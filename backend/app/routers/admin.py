"""Panel de admin: uso de la app, usuarios, soporte técnico y estado del sistema.

Privacidad: el admin ve datos de cuenta y CUÁNTOS registros tiene cada usuario,
nunca su contenido (gastos, ingresos…). La cuenta demo queda fuera de las
métricas y no admite acciones.
"""
import os
import platform
import socket
import sys
import time
from collections import Counter
from datetime import date, datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base, get_db
from app.models.models import (
    ApiKey, Expense, ExpensePhoto, Goal, Income, OAuthConfig, Project, ServerError, Subscription,
    SupportMessage, SupportTicket, User,
)
from app.routers.auth import require_admin
from app.schemas.schemas import AccountDeleteRequest, AdminSetRole, SupportReply
from app.services.accounts import delete_user_data, issue_password_reset
from app.services.demo import DEMO_EMAIL, DEMO_ENABLED, is_demo
from app.services.support import messages_by_ticket, ticket_out

router = APIRouter(prefix="/admin", tags=["admin"])

STARTED_AT = datetime.utcnow()

# Registros que cuentan como "uso" (nombre en la API → modelo)
RECORDS = {"expenses": Expense, "incomes": Income, "goals": Goal, "subscriptions": Subscription, "projects": Project}


def _api_version() -> str:
    try:
        with open("/app/version.txt") as f:
            return f.read().strip()
    except OSError:
        return "dev"


async def _demo_id(db: AsyncSession) -> str | None:
    return (await db.execute(select(User.id).where(User.email == DEMO_EMAIL))).scalar_one_or_none()


def _not_demo(model, demo_id: str | None):
    """Condición «no es de la cuenta demo» (siempre cierta si la demo no existe)."""
    return model.user_id != demo_id if demo_id else true()


# ── Uso ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def stats(days: int = Query(90, ge=7, le=730), admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    today = now.date()
    start = today - timedelta(days=days - 1)
    since = datetime.combine(start, datetime.min.time())
    demo_id = await _demo_id(db)

    users = (await db.execute(select(
        User.created_at, User.last_login, User.google_id, User.is_admin, User.is_developer,
        User.suspended_at, User.mobile_tour_done,
    ).where(User.email != DEMO_EMAIL))).all()

    def within(dt, d):
        return dt is not None and dt >= now - timedelta(days=d)

    kpis = {
        "users": len(users),
        "new_7d": sum(within(u.created_at, 7) for u in users),
        "new_30d": sum(within(u.created_at, 30) for u in users),
        "active_1d": sum(within(u.last_login, 1) for u in users),
        "active_7d": sum(within(u.last_login, 7) for u in users),
        "active_30d": sum(within(u.last_login, 30) for u in users),
        "google": sum(bool(u.google_id) for u in users),
        "admins": sum(bool(u.is_admin) for u in users),
        "developers": sum(bool(u.is_developer) for u in users),
        "suspended": sum(u.suspended_at is not None for u in users),
        # Hicieron el tutorial de la app móvil: la han usado al menos una vez
        "mobile": sum(bool(u.mobile_tour_done) for u in users),
        "api_keys_30d": await db.scalar(select(func.count()).select_from(ApiKey).where(
            ApiKey.revoked_at.is_(None), ApiKey.last_used_at >= now - timedelta(days=30), _not_demo(ApiKey, demo_id))) or 0,
        "photos": await db.scalar(select(func.count()).select_from(ExpensePhoto).join(
            Expense, Expense.id == ExpensePhoto.expense_id).where(_not_demo(Expense, demo_id))) or 0,
        "tickets_open": await db.scalar(select(func.count()).select_from(SupportTicket).where(SupportTicket.status == "open")) or 0,
        "tickets_answered": await db.scalar(select(func.count()).select_from(SupportTicket).where(SupportTicket.status == "answered")) or 0,
    }
    totals = {}
    for key, model in RECORDS.items():
        totals[key] = await db.scalar(select(func.count()).select_from(model).where(_not_demo(model, demo_id))) or 0
    kpis["records"] = totals

    # Series diarias (agregadas en Python: igual en SQLite y Postgres)
    signups = Counter(u.created_at.date() for u in users if u.created_at and u.created_at >= since)
    before = sum(1 for u in users if u.created_at and u.created_at < since)
    created: dict[str, Counter] = {}
    for key, model in RECORDS.items():
        rows = (await db.execute(select(model.created_at).where(model.created_at >= since, _not_demo(model, demo_id)))).scalars().all()
        created[key] = Counter(dt.date() for dt in rows if dt)
    series, running = [], before
    for i in range(days):
        d = start + timedelta(days=i)
        running += signups[d]
        series.append({"day": d.isoformat(), "signups": signups[d], "users": running,
                       **{k: created[k][d] for k in RECORDS}})

    # ¿Cuándo entró cada usuario por última vez?
    buckets = [("today", 0, 1), ("week", 1, 7), ("month", 7, 30), ("quarter", 30, 90), ("older", 90, None)]
    last_login = []
    for name, lo, hi in buckets:
        n = 0
        for u in users:
            if u.last_login is None:
                continue
            age = (now - u.last_login).total_seconds() / 86400
            if age >= lo and (hi is None or age < hi):
                n += 1
        last_login.append({"bucket": name, "users": n})

    return {"days": days, "kpis": kpis, "series": series, "last_login": last_login}


# ── Usuarios ────────────────────────────────────────────────────────────────

async def _counts(db: AsyncSession) -> dict[str, dict[str, int]]:
    """{user_id: {expenses: n, …, photos: n, tickets: n}} con un group by por tabla."""
    out: dict[str, dict[str, int]] = {}
    for key, model in {**RECORDS, "tickets": SupportTicket}.items():
        for uid, n in (await db.execute(select(model.user_id, func.count()).group_by(model.user_id))).all():
            out.setdefault(uid, {})[key] = n
    for uid, n in (await db.execute(
        select(Expense.user_id, func.count()).join(ExpensePhoto, ExpensePhoto.expense_id == Expense.id).group_by(Expense.user_id)
    )).all():
        out.setdefault(uid, {})["photos"] = n
    return out


def _user_row(u: User, counts: dict[str, int]) -> dict:
    c = {k: counts.get(k, 0) for k in (*RECORDS, "photos", "tickets")}
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "created_at": u.created_at,
        "last_login": u.last_login,
        "providers": [p for p, ok in (("email", bool(u.password_hash)), ("google", bool(u.google_id))) if ok],
        "is_admin": bool(u.is_admin),
        "is_developer": bool(u.is_developer),
        "suspended_at": u.suspended_at,
        "is_demo": is_demo(u),
        "mobile": bool(u.mobile_tour_done),
        "counts": c,
        "records": sum(c[k] for k in RECORDS),
    }


@router.get("/users")
async def list_users(
    q: str = "",
    sort: str = Query("created", pattern="^(created|last_login|name|records)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User)
    term = q.strip().lower()
    if term:
        stmt = stmt.where(func.lower(User.email).contains(term) | func.lower(User.name).contains(term))
    users = (await db.execute(stmt)).scalars().all()
    counts = await _counts(db)
    rows = [_user_row(u, counts.get(u.id, {})) for u in users]
    epoch = datetime.min
    key = {
        "created": lambda r: r["created_at"] or epoch,
        "last_login": lambda r: r["last_login"] or epoch,
        "name": lambda r: (r["name"] or "").lower(),
        "records": lambda r: r["records"],
    }[sort]
    rows.sort(key=key, reverse=sort != "name")
    return {"total": len(rows), "users": rows[offset:offset + limit]}


async def _get_user(db: AsyncSession, user_id: str) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _guard(user: User, admin: User, *, self_ok: bool = False) -> None:
    if is_demo(user):
        raise HTTPException(status_code=400, detail="Not allowed on the demo account")
    if not self_ok and user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot do this to your own account")


@router.get("/users/{user_id}")
async def user_detail(user_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, user_id)
    counts = await _counts(db)
    keys = (await db.execute(select(ApiKey).where(ApiKey.user_id == user.id))).scalars().all()
    tickets = (await db.execute(
        select(SupportTicket).where(SupportTicket.user_id == user.id).order_by(SupportTicket.updated_at.desc())
    )).scalars().all()
    return {
        **_user_row(user, counts.get(user.id, {})),
        "locale": user.locale,
        "theme": user.theme,
        "setup_done": bool(user.setup_done),
        "api_keys": {
            "active": sum(k.revoked_at is None for k in keys),
            "last_used_at": max((k.last_used_at for k in keys if k.last_used_at), default=None),
        },
        "tickets": [{"id": t.id, "subject": t.subject, "status": t.status, "updated_at": t.updated_at} for t in tickets],
    }


@router.post("/users/{user_id}/suspend")
async def suspend_user(user_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, user_id)
    _guard(user, admin)
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Remove admin rights before suspending")
    user.suspended_at = user.suspended_at or datetime.utcnow()
    await db.flush()
    return {"ok": True, "suspended_at": user.suspended_at}


@router.post("/users/{user_id}/reactivate")
async def reactivate_user(user_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, user_id)
    _guard(user, admin)
    user.suspended_at = None
    await db.flush()
    return {"ok": True}


@router.put("/users/{user_id}/admin")
async def set_admin(user_id: str, body: AdminSetRole, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, user_id)
    _guard(user, admin)
    if body.is_admin and user.suspended_at is not None:
        raise HTTPException(status_code=400, detail="Reactivate the account first")
    if not body.is_admin:
        others = await db.scalar(select(func.count()).select_from(User).where(
            User.is_admin.is_(True), User.id != user.id, User.suspended_at.is_(None)))
        if not others:
            raise HTTPException(status_code=400, detail="There must be at least one admin")
    user.is_admin = body.is_admin
    await db.flush()
    return {"ok": True, "is_admin": user.is_admin}


@router.post("/users/{user_id}/password-reset")
async def send_password_reset(user_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Envía al usuario el email para (re)establecer la contraseña (sirve también a cuentas de Google)."""
    user = await _get_user(db, user_id)
    _guard(user, admin, self_ok=True)
    if not await issue_password_reset(db, user):
        raise HTTPException(status_code=502, detail="Could not send email")
    return {"ok": True}


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, body: AccountDeleteRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, user_id)
    _guard(user, admin)
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Remove admin rights before deleting")
    if body.confirm_email.strip().lower() != (user.email or "").lower():
        raise HTTPException(status_code=400, detail="Email confirmation does not match")
    await delete_user_data(db, user.id)
    await db.delete(user)
    await db.flush()


# ── Soporte ─────────────────────────────────────────────────────────────────

STATUS_ORDER = {"open": 0, "answered": 1, "closed": 2}


@router.get("/support")
async def list_tickets(
    status: str = Query("", pattern="^(|open|answered|closed)$"),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(SupportTicket)
    if status:
        stmt = stmt.where(SupportTicket.status == status)
    tickets = (await db.execute(stmt)).scalars().all()
    users = {u.id: u for u in (await db.execute(
        select(User).where(User.id.in_({t.user_id for t in tickets}))
    )).scalars().all()} if tickets else {}
    msgs = await messages_by_ticket(db, [t.id for t in tickets])
    out = []
    for t in tickets:
        last = msgs[t.id][-1] if msgs[t.id] else None
        u = users.get(t.user_id)
        out.append({
            "id": t.id, "subject": t.subject, "category": t.category, "status": t.status,
            "platform": t.platform, "created_at": t.created_at, "updated_at": t.updated_at,
            "messages": len(msgs[t.id]),
            "last_author": last.author if last else "",
            "preview": (last.body[:140] if last else ""),
            "user": {"id": t.user_id, "name": u.name if u else "", "email": u.email if u else ""},
        })
    # Abiertas primero; dentro de cada estado, lo más reciente arriba (dos sort estables)
    out.sort(key=lambda r: r["updated_at"] or datetime.min, reverse=True)
    out.sort(key=lambda r: STATUS_ORDER.get(r["status"], 9))
    return out


async def _ticket_detail(db: AsyncSession, ticket: SupportTicket) -> dict:
    user = await db.get(User, ticket.user_id)
    msgs = await messages_by_ticket(db, [ticket.id])
    return ticket_out(ticket, msgs[ticket.id], user or User(id=ticket.user_id, name="", email=""))


async def _get_ticket(db: AsyncSession, ticket_id: str) -> SupportTicket:
    ticket = await db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@router.get("/support/{ticket_id}")
async def ticket_detail(ticket_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _ticket_detail(db, await _get_ticket(db, ticket_id))


@router.post("/support/{ticket_id}/reply")
async def reply_ticket(ticket_id: str, body: SupportReply, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Responde al usuario (queda «answered») y se lo manda por email."""
    from app.mail import send_support_reply

    ticket = await _get_ticket(db, ticket_id)
    now = datetime.utcnow()
    db.add(SupportMessage(ticket_id=ticket.id, author="admin", body=body.body.strip(), created_at=now))
    ticket.status = "answered"
    ticket.updated_at = now
    await db.flush()
    user = await db.get(User, ticket.user_id)
    emailed = False
    if user is not None:
        try:
            emailed = await send_support_reply(user.email, user.name, ticket.subject, body.body.strip(), db=db)
        except Exception:
            emailed = False
    return {**(await _ticket_detail(db, ticket)), "emailed": emailed}


@router.post("/support/{ticket_id}/close")
async def close_ticket(ticket_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    ticket = await _get_ticket(db, ticket_id)
    ticket.status = "closed"
    ticket.updated_at = datetime.utcnow()
    await db.flush()
    return await _ticket_detail(db, ticket)


@router.post("/support/{ticket_id}/reopen")
async def reopen_ticket(ticket_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    ticket = await _get_ticket(db, ticket_id)
    ticket.status = "open"
    ticket.updated_at = datetime.utcnow()
    await db.flush()
    return await _ticket_detail(db, ticket)


# ── Estado del sistema ──────────────────────────────────────────────────────

async def _ping(url: str) -> dict:
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(url)
        return {"ok": r.status_code < 500, "status": r.status_code, "ms": round((time.perf_counter() - t0) * 1000)}
    except Exception as e:
        return {"ok": False, "status": None, "ms": None, "error": type(e).__name__}


@router.get("/system")
async def system(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    from app.mail import _get_smtp_config
    from app.routers.expenses import CC_BASE

    # Base de datos
    t0 = time.perf_counter()
    await db.execute(text("SELECT 1"))
    db_ms = round((time.perf_counter() - t0) * 1000, 1)
    dialect = (await db.connection()).dialect.name
    tables = {}
    for table in Base.metadata.sorted_tables:
        try:
            tables[table.name] = await db.scalar(select(func.count()).select_from(table)) or 0
        except Exception:
            tables[table.name] = None
    size = None
    if dialect == "postgresql":
        try:
            size = await db.scalar(text("SELECT pg_database_size(current_database())"))
        except Exception:
            size = None

    # Servicios
    smtp = await _get_smtp_config(db)
    google = (await db.execute(select(OAuthConfig).where(OAuthConfig.provider == "google"))).scalar_one_or_none()
    demo_id = await _demo_id(db)
    demo_day = await db.scalar(select(func.max(Expense.date)).where(Expense.user_id == demo_id)) if demo_id else None

    now = datetime.utcnow()
    errors = (await db.execute(select(ServerError).order_by(ServerError.created_at.desc()).limit(50))).scalars().all()
    err_24h = await db.scalar(select(func.count()).select_from(ServerError).where(ServerError.created_at >= now - timedelta(days=1))) or 0
    err_7d = await db.scalar(select(func.count()).select_from(ServerError).where(ServerError.created_at >= now - timedelta(days=7))) or 0

    return {
        "api": {
            "version": _api_version(),
            "python": sys.version.split()[0],
            "platform": platform.platform(terse=True),
            "host": socket.gethostname(),
            "pid": os.getpid(),
            "started_at": STARTED_AT,
            "now": now,
        },
        "database": {"ok": True, "dialect": dialect, "ms": db_ms, "size_bytes": size, "tables": tables},
        "smtp": {
            "host": smtp.get("host", ""), "port": smtp.get("port"), "from": smtp.get("from_email", ""),
            "configured": bool(smtp.get("host")) and (bool(smtp.get("password")) or smtp.get("port") == 25),
        },
        "google": {"enabled": bool(google and google.enabled and google.client_id)},
        "cuentas_claras": {"url": CC_BASE, **(await _ping(CC_BASE))},
        "demo": {
            "enabled": DEMO_ENABLED, "email": DEMO_EMAIL,
            "seeded_on": demo_day.isoformat() if isinstance(demo_day, date) else None,
        },
        "errors": {
            "last_24h": err_24h, "last_7d": err_7d,
            "recent": [{
                "created_at": e.created_at, "method": e.method, "path": e.path, "status": e.status,
                "request_id": e.request_id, "error_type": e.error_type, "message": e.message,
            } for e in errors],
        },
    }


@router.post("/system/test-email")
async def test_email(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Correo de prueba al admin con la configuración guardada; si falla, dice en qué paso y por qué."""
    from app.mail import _get_smtp_config, check_smtp
    return await check_smtp(await _get_smtp_config(db), send_to=admin.email)
