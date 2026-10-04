"""Soporte técnico (lado del usuario): enviar consultas y seguir el hilo con el admin.

La cuenta demo no llega a los POST: la corta el middleware demo_read_only.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import SupportMessage, SupportTicket, User
from app.routers.auth import get_current_user
from app.schemas.schemas import SupportCreate, SupportReply
from app.services.support import messages_by_ticket, notify_admins, ticket_out

router = APIRouter(prefix="/support", tags=["support"])

# Consultas nuevas por usuario y día (evita spam al buzón de los admins)
MAX_PER_DAY = 5


@router.get("")
async def my_tickets(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Mis consultas, de la más reciente a la más antigua, con su hilo."""
    tickets = (await db.execute(
        select(SupportTicket).where(SupportTicket.user_id == user.id).order_by(SupportTicket.updated_at.desc())
    )).scalars().all()
    msgs = await messages_by_ticket(db, [t.id for t in tickets])
    return [ticket_out(t, msgs[t.id]) for t in tickets]


@router.post("", status_code=201)
async def create_ticket(body: SupportCreate, background: BackgroundTasks,
                        user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=1)
    recent = await db.scalar(select(func.count()).select_from(SupportTicket).where(
        SupportTicket.user_id == user.id, SupportTicket.created_at >= since))
    if (recent or 0) >= MAX_PER_DAY:
        raise HTTPException(status_code=429, detail="Too many support requests today")

    now = datetime.utcnow()
    ticket = SupportTicket(
        user_id=user.id, subject=body.subject.strip(), category=body.category, status="open",
        platform=body.platform, app_version=body.app_version.strip(), created_at=now, updated_at=now,
    )
    db.add(ticket)
    await db.flush()
    msg = SupportMessage(ticket_id=ticket.id, author="user", body=body.body.strip(), created_at=now)
    db.add(msg)
    await db.flush()
    background.add_task(notify_admins, user.name, user.email, ticket.subject, msg.body, ticket.id)
    return ticket_out(ticket, [msg])


@router.post("/{ticket_id}/messages", status_code=201)
async def reply(ticket_id: str, body: SupportReply, background: BackgroundTasks,
                user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Responder en el hilo: la consulta vuelve a quedar pendiente del admin."""
    ticket = await db.get(SupportTicket, ticket_id)
    if ticket is None or ticket.user_id != user.id:
        raise HTTPException(status_code=404, detail="Ticket not found")
    now = datetime.utcnow()
    db.add(SupportMessage(ticket_id=ticket.id, author="user", body=body.body.strip(), created_at=now))
    ticket.status = "open"
    ticket.updated_at = now
    await db.flush()
    background.add_task(notify_admins, user.name, user.email, ticket.subject, body.body.strip(), ticket.id, True)
    msgs = await messages_by_ticket(db, [ticket.id])
    return ticket_out(ticket, msgs[ticket.id])
