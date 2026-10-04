"""Registro de errores 5xx para el panel de admin.

Se guardan en BD (hay varias réplicas del backend) solo con metadatos: método,
ruta sin query, estado, request_id, tipo y primera línea del mensaje. Se borran
a los 30 días. Nunca debe romper la respuesta de error: todo va en try/except.
"""
import logging
from datetime import datetime, timedelta

from fastapi import Request
from sqlalchemy import delete

from app.database import async_session_factory
from app.models.models import ServerError

logger = logging.getLogger(__name__)
KEEP = timedelta(days=30)


def _first_line(exc: BaseException | None) -> str:
    if exc is None:
        return ""
    text = str(exc).strip().splitlines()
    return (text[0] if text else "")[:300]


async def record_server_error(request: Request, status: int, exc: BaseException | None) -> None:
    try:
        async with async_session_factory() as session:
            session.add(ServerError(
                method=request.method[:8],
                path=request.url.path[:255],
                status=status,
                request_id=str(getattr(request.state, "request_id", ""))[:64],
                error_type=(type(exc).__name__ if exc else "")[:80],
                message=_first_line(exc),
            ))
            await session.execute(delete(ServerError).where(ServerError.created_at < datetime.utcnow() - KEEP))
            await session.commit()
    except Exception:  # la BD puede ser justo lo que falla
        logger.warning("could not record server error for %s", request.url.path)
