"""Envío de correos (recuperar contraseña, soporte, prueba).

La configuración SMTP sale de la BD (tabla smtp_config) y, si no hay, del entorno.
Todos los correos usan la plantilla de app/email_layout.py.
check_smtp() prueba una configuración paso a paso y explica en qué falla.
"""

import logging
import socket
import ssl
import time
from datetime import datetime
from email.message import EmailMessage
from email.utils import make_msgid
from html import escape

import aiosmtplib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.email_layout import LOGO_CID, LOGO_PATH, Email, render
from app.models.models import SmtpConfig

logger = logging.getLogger(__name__)


async def _get_smtp_config(db: AsyncSession | None = None) -> dict:
    """Get SMTP config from DB, falling back to environment config."""
    if db is not None:
        try:
            result = await db.execute(select(SmtpConfig).limit(1))
            config = result.scalar_one_or_none()
            # La fila DB manda si existe con host; user/password son OPCIONALES
            # (relay interno sin auth: 100.111.166.119:25)
            if config and config.host:
                return {
                    "host": config.host,
                    "port": config.port or 25,
                    "user": config.user or "",
                    "password": config.password or "",
                    "from_email": config.from_email or settings.smtp_from,
                    "from_name": config.from_name or settings.smtp_from_name,
                }
        except Exception:
            pass

    # Fallback to env vars
    return {
        "host": settings.smtp_host,
        "port": settings.smtp_port,
        "user": settings.smtp_user,
        "password": settings.smtp_password,
        "from_email": settings.smtp_from,
        "from_name": settings.smtp_from_name,
    }


def build_message(cfg: dict, to: str, subject: str, html: str, text: str) -> EmailMessage:
    """Mensaje multipart: texto + HTML, con el logo incrustado si la plantilla lo usa."""
    msg = EmailMessage()
    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"] = to
    msg["Subject"] = " ".join(subject.split())  # sin saltos de línea (texto del usuario en el asunto)
    msg["Message-ID"] = make_msgid(domain=(cfg.get("from_email") or "peculio").split("@")[-1])
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    if f"cid:{LOGO_CID}" in html and LOGO_PATH.exists():
        html_part = msg.get_payload()[1]
        html_part.add_related(LOGO_PATH.read_bytes(), maintype="image", subtype="png",
                              cid=f"<{LOGO_CID}>", filename="peculio.png")
    return msg


async def send_email(
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
    db: AsyncSession | None = None,
) -> bool:
    """Send an HTML email via SMTP."""
    cfg = await _get_smtp_config(db)
    msg = build_message(cfg, to, subject, html, text or _strip_html(html))
    mode = tls_mode(cfg["port"])

    try:
        # aiosmtplib omite AUTH si username/password son None.
        await aiosmtplib.send(
            msg,
            hostname=cfg["host"],
            port=cfg["port"],
            username=cfg["user"] or None,
            password=cfg["password"] or None,
            start_tls=(mode == "starttls"),
            use_tls=(mode == "tls"),
        )
        return True
    except Exception as e:
        logger.warning("SMTP: no se pudo enviar un correo (%s): %s", classify_smtp_error(e), _error_detail(e))
        return False


# ── Prueba de la configuración ────────────────────────────────────────────────

def tls_mode(port: int) -> str:
    """Cifrado según el puerto: 465 TLS desde el inicio, 25 ninguno (relay interno), el resto STARTTLS."""
    if port == 465:
        return "tls"
    if port == 25:
        return "none"
    return "starttls"


def _exc_chain(exc: BaseException) -> list[BaseException]:
    """La excepción y sus causas (aiosmtplib envuelve el OSError original en SMTPConnectError)."""
    chain: list[BaseException] = []
    while exc is not None and exc not in chain:
        chain.append(exc)
        exc = exc.__cause__ or exc.__context__
    return chain


def classify_smtp_error(exc: BaseException) -> str:
    """Código del fallo; la web explica cada uno (admin.smtpErr.<código>)."""
    chain = _exc_chain(exc)

    def has(*types) -> bool:
        return any(isinstance(e, types) for e in chain)

    text = " ".join(str(e) for e in chain).lower()
    codes = {e.code for e in chain if isinstance(e, aiosmtplib.SMTPResponseException)}

    if has(ssl.SSLCertVerificationError) or "certificate verify failed" in text:
        return "cert"
    if has(socket.gaierror):
        return "dns"
    if has(aiosmtplib.SMTPAuthenticationError) or 535 in codes:
        return "auth"
    if 530 in codes:  # «Authentication required» al dar el remitente
        return "auth_required"
    if has(aiosmtplib.SMTPSenderRefused):
        return "sender_refused"
    if has(aiosmtplib.SMTPRecipientsRefused, aiosmtplib.SMTPRecipientRefused):
        return "recipient_refused"
    if "starttls extension not supported" in text:
        return "starttls_unsupported"
    if "auth extension is not supported" in text:
        return "auth_unsupported"
    if has(ssl.SSLError):
        return "tls"
    if has(aiosmtplib.SMTPConnectResponseError, aiosmtplib.SMTPHeloError):
        return "rejected"  # contesta, pero no con 220/250: p. ej. IP bloqueada
    if has(ConnectionRefusedError):
        return "refused"
    if has(TimeoutError, aiosmtplib.SMTPTimeoutError):
        return "timeout"
    if has(aiosmtplib.SMTPDataError):
        return "data_refused"
    if has(aiosmtplib.SMTPServerDisconnected) or "connection lost" in text:
        return "disconnected"
    if has(OSError):
        return "network"
    return "unknown"


def _error_detail(exc: BaseException) -> str:
    """Lo que dijo el servidor (o el error de red), para mostrarlo tal cual como detalle técnico."""
    if isinstance(exc, aiosmtplib.SMTPResponseException):
        detail = f"{exc.code} {exc.message}"
    else:
        detail = str(exc) or type(exc).__name__
    return " ".join(detail.split())[:300]


async def check_smtp(cfg: dict, send_to: str | None = None, timeout: float = 10) -> dict:
    """Prueba una configuración SMTP paso a paso, igual que la usa send_email.

    Pasos: conexión (con TLS si es el 465), STARTTLS, inicio de sesión (si hay usuario) y, al
    final, el remitente (MAIL FROM y RSET, sin enviar nada) o, con send_to, el correo de prueba.
    Se para en el primer fallo y lo devuelve clasificado en `error`.
    """
    host = (cfg.get("host") or "").strip()
    port = int(cfg.get("port") or 0)
    user = (cfg.get("user") or "").strip()
    from_email = (cfg.get("from_email") or "").strip()
    mode = tls_mode(port)
    result = {"ok": False, "mode": mode, "server": f"{host}:{port}", "user": user,
              "from_email": from_email, "sent_to": send_to, "steps": [], "error": None}

    def fail(step: str, code: str, detail: str = "", ms: float | None = None) -> dict:
        result["steps"].append({"step": step, "ok": False, "ms": ms})
        result["error"] = {"step": step, "code": code, "detail": detail}
        return result

    if not host:
        return fail("connect", "no_host")
    if not 0 < port < 65536:
        return fail("connect", "bad_port")
    if "@" not in from_email:
        return fail("sender", "bad_from")

    smtp = aiosmtplib.SMTP(hostname=host, port=port, use_tls=(mode == "tls"), start_tls=False, timeout=timeout)
    step, t0 = "connect", time.perf_counter()

    def done() -> None:
        nonlocal t0
        result["steps"].append({"step": step, "ok": True, "ms": round((time.perf_counter() - t0) * 1000)})
        t0 = time.perf_counter()

    try:
        await smtp.connect()
        done()
        if mode == "starttls":
            step = "starttls"
            await smtp.starttls()
            done()
        if user:
            step = "auth"
            await smtp.login(user, cfg.get("password") or "")
            done()
        if send_to:
            step = "send"
            email = smtp_test_email()
            html, text = render(email)
            await smtp.send_message(build_message(cfg, send_to, email.subject, html, text))
        else:
            step = "sender"
            await smtp.mail(from_email)
            await smtp.rset()
        done()
    except Exception as e:
        return fail(step, classify_smtp_error(e), _error_detail(e), round((time.perf_counter() - t0) * 1000))
    finally:
        try:
            if smtp.is_connected:
                await smtp.quit()
        except Exception:
            smtp.close()

    result["ok"] = True
    return result


async def send_rendered(to: str, email: Email, db: AsyncSession | None = None) -> bool:
    html, text = render(email)
    return await send_email(to, email.subject, html, text, db=db)


def _strip_html(html: str) -> str:
    """Crude HTML-to-text fallback."""
    import re
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _links() -> list[tuple[str, str]]:
    return [("Ayuda y soporte", f"{settings.frontend_url}/support"),
            ("Privacidad", f"{settings.frontend_url}/legal/privacidad")]


# ── Correos ───────────────────────────────────────────────────────────────────

def password_reset_email(to: str, name: str, token: str) -> Email:
    url = f"{settings.frontend_url}/reset-password?token={token}"
    return Email(
        subject="Restablece tu contraseña de Peculio",
        eyebrow="Tu cuenta",
        title="Restablece tu contraseña",
        preheader="El enlace caduca en 1 hora.",
        paragraphs=[
            f"Hola <strong>{escape(name)}</strong>,",
            "Hemos recibido una petición para restablecer la contraseña de tu cuenta de Peculio. "
            "Pulsa el botón para elegir una nueva.",
        ],
        button=("Crear una contraseña nueva", url),
        note="El enlace caduca en <strong>1 hora</strong> y solo sirve una vez. Si no lo has pedido tú, "
             "ignora este correo: tu contraseña no cambia.",
        reason=f"Te escribimos porque se pidió restablecer la contraseña de {escape(to)}.",
        footer_links=_links(),
    )


def support_new_ticket_email(user_name: str, user_email: str, subject: str, body: str,
                             ticket_id: str = "", is_reply: bool = False) -> Email:
    url = f"{settings.frontend_url}/admin?tab=support" + (f"&ticket={ticket_id}" if ticket_id else "")
    who = f"<strong>{escape(user_name)}</strong> ({escape(user_email)})"
    return Email(
        subject=f"[Peculio] Soporte: {subject}",
        eyebrow="Soporte",
        title=f"Respuesta de {user_name}" if is_reply else "Consulta nueva",
        preheader=body[:120],
        paragraphs=[f"{who} ha {'contestado en' if is_reply else 'escrito una consulta sobre'} «{escape(subject)}»:"],
        quote=body,
        button=("Abrir en el panel", url),
        reason="Recibes este aviso porque eres administrador de Peculio.",
    )


def support_reply_email(name: str, subject: str, body: str) -> Email:
    return Email(
        subject=f"Respuesta a tu consulta: {subject}",
        eyebrow="Soporte",
        title="Te hemos respondido",
        preheader=body[:120],
        paragraphs=[f"Hola <strong>{escape(name)}</strong>, tenemos respuesta a tu consulta «{escape(subject)}»:"],
        quote=body,
        quote_by="Soporte de Peculio",
        button=("Ver la consulta", f"{settings.frontend_url}/support"),
        note="Puedes contestar desde la web o la app, en <strong>Ayuda y soporte</strong>.",
        reason="Te escribimos porque enviaste una consulta al soporte de Peculio.",
        footer_links=_links(),
    )


def smtp_test_email() -> Email:
    return Email(
        subject="[Peculio] Correo de prueba",
        eyebrow="Sistema",
        title="Correo de prueba",
        preheader="El envío de correo funciona.",
        paragraphs=[
            "Si lees esto, el envío de correo de Peculio funciona.",
            f"Enviado el {datetime.utcnow():%d/%m/%Y a las %H:%M} (UTC) desde el panel de administración.",
        ],
        reason="Lo has enviado tú desde el panel de administración de Peculio.",
    )


async def send_password_reset_email(to: str, name: str, token: str, db: AsyncSession | None = None) -> bool:
    """Send a password reset email with a one-time link."""
    return await send_rendered(to, password_reset_email(to, name, token), db=db)


async def send_support_new_ticket(
    admins: list[str], user_name: str, user_email: str, subject: str, body: str,
    db: AsyncSession | None = None, ticket_id: str = "", is_reply: bool = False,
) -> bool:
    """Aviso a los admins de una consulta nueva (o de una respuesta del usuario)."""
    email = support_new_ticket_email(user_name, user_email, subject, body, ticket_id, is_reply)
    ok = True
    for to in admins:
        ok = await send_rendered(to, email, db=db) and ok
    return ok


async def send_support_reply(to: str, name: str, subject: str, body: str, db: AsyncSession | None = None) -> bool:
    """Respuesta del admin al usuario."""
    return await send_rendered(to, support_reply_email(name, subject, body), db=db)
