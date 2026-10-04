"""Consultas de soporte: serialización y avisos por email (compartido usuario/admin)."""
import logging
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.models import SupportMessage, SupportTicket, User

logger = logging.getLogger(__name__)


async def messages_by_ticket(db: AsyncSession, ticket_ids: list[str]) -> dict[str, list[SupportMessage]]:
    out: dict[str, list[SupportMessage]] = defaultdict(list)
    if not ticket_ids:
        return out
    rows = (await db.execute(
        select(SupportMessage).where(SupportMessage.ticket_id.in_(ticket_ids)).order_by(SupportMessage.created_at)
    )).scalars().all()
    for m in rows:
        out[m.ticket_id].append(m)
    return out


def ticket_out(t: SupportTicket, messages: list[SupportMessage], user: User | None = None) -> dict:
    data = {
        "id": t.id,
        "subject": t.subject,
        "category": t.category,
        "status": t.status,
        "platform": t.platform,
        "app_version": t.app_version,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "messages": [{"id": m.id, "author": m.author, "body": m.body, "created_at": m.created_at} for m in messages],
    }
    if user is not None:
        data["user"] = {"id": user.id, "name": user.name, "email": user.email}
    return data


async def admin_emails(db: AsyncSession) -> list[str]:
    rows = (await db.execute(
        select(User.email).where(User.is_admin.is_(True), User.suspended_at.is_(None))
    )).scalars().all()
    return [e for e in rows if e]


async def notify_admins(user_name: str, user_email: str, subject: str, body: str,
                        ticket_id: str = "", is_reply: bool = False) -> None:
    """Email a los admins. Va en segundo plano (BackgroundTasks) con su propia sesión:
    el usuario no espera al correo y, si falla, la consulta ya está guardada."""
    from app.mail import send_support_new_ticket
    try:
        async with async_session_factory() as db:
            to = await admin_emails(db)
            if to:
                await send_support_new_ticket(to, user_name, user_email, subject, body, db=db,
                                              ticket_id=ticket_id, is_reply=is_reply)
    except Exception:
        logger.warning("support: could not email admins")
