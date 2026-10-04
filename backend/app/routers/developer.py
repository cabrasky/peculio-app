"""Router de modo Desarrollador: activar/desactivar el modo y gestionar API keys."""
import secrets
import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import User, ApiKey
from app.routers.auth import get_current_user, require_developer
from app.schemas.schemas import (
    ApiKeyCreate,
    ApiKeyCreatedOut,
    ApiKeyOut,
    DeveloperToggleOut,
)

router = APIRouter(prefix="/developer", tags=["developer"])


def _hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _generate_key() -> str:
    """Clave de API con prefijo estable: mb_live_ + 43 chars aleatorios."""
    return "mb_live_" + secrets.token_urlsafe(32)


@router.get("", response_model=DeveloperToggleOut)
async def get_developer_status(
    user: User = Depends(get_current_user),
):
    """Estado actual del modo Desarrollador del usuario autenticado."""
    return DeveloperToggleOut(is_developer=bool(user.is_developer or user.is_admin))


@router.put("/toggle", response_model=DeveloperToggleOut)
async def toggle_developer(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Activa/desactiva el modo Desarrollador (autoservicio)."""
    user.is_developer = not user.is_developer
    await db.flush()
    return DeveloperToggleOut(is_developer=bool(user.is_developer or user.is_admin))


@router.get("/keys", response_model=list[ApiKeyOut])
async def list_api_keys(
    user: User = Depends(require_developer),
    db: AsyncSession = Depends(get_db),
):
    """Lista las API keys del usuario (sin la clave completa)."""
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == user.id)
        .order_by(ApiKey.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        ApiKeyOut(
            id=k.id,
            name=k.name,
            prefix=k.prefix,
            created_at=k.created_at,
            last_used_at=k.last_used_at,
            revoked=k.revoked_at is not None,
        )
        for k in rows
    ]


@router.post("/keys", response_model=ApiKeyCreatedOut, status_code=201)
async def create_api_key(
    body: ApiKeyCreate,
    user: User = Depends(require_developer),
    db: AsyncSession = Depends(get_db),
):
    """Crea una API key. La clave completa se devuelve UNA sola vez."""
    key = _generate_key()
    api_key = ApiKey(
        user_id=user.id,
        name=(body.name or "").strip()[:128],
        key_hash=_hash_api_key(key),
        prefix=key[:12],
    )
    db.add(api_key)
    await db.flush()
    await db.refresh(api_key)
    return ApiKeyCreatedOut(
        id=api_key.id,
        name=api_key.name,
        prefix=api_key.prefix,
        key=key,
        created_at=api_key.created_at,
    )


@router.delete("/keys/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: str,
    user: User = Depends(require_developer),
    db: AsyncSession = Depends(get_db),
):
    """Revoca una API key (no se borra; queda marcada como revocada)."""
    result = await db.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user.id)
    )
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    api_key.revoked_at = datetime.utcnow()
    await db.flush()
