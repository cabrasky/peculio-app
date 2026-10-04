"""Photo service: almacenamiento de fotos de gastos en PostgreSQL.

Las fotos se guardan EN CLARO en la tabla ``expense_photos`` (cifrado
pendiente, se añadirá más tarde). La columna ``expenses.photo_type`` actúa
como marca de "hay foto" para no tener que leer los bytes en cada listado.
"""
from fastapi import HTTPException, Response
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import ExpensePhoto

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 15 * 1024 * 1024  # 15 MB


async def store_photo(db: AsyncSession, expense_id: str, file: UploadFile) -> str:
    """Guardar (o reemplazar) la foto del ticket. Devuelve el content-type validado."""
    ctype = (file.content_type or "").lower()
    if ctype not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type (only jpeg/png/webp are allowed)")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Maximum file size is 15 MB")

    photo = await db.get(ExpensePhoto, expense_id)
    if photo is None:
        photo = ExpensePhoto(expense_id=expense_id, data=data, content_type=ctype)
        db.add(photo)
    else:
        photo.data = data
        photo.content_type = ctype
    await db.flush()
    return ctype


async def get_photo_response(db: AsyncSession, expense_id: str, original_type: str | None) -> Response:
    """Servir la foto en memoria (no hay fichero en disco)."""
    photo = await db.get(ExpensePhoto, expense_id)
    if photo is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    media_type = original_type if original_type in ALLOWED_TYPES else "application/octet-stream"
    return Response(
        content=photo.data,
        media_type=media_type,
        headers={"Cache-Control": "private, max-age=0"},
    )


async def delete_photo(db: AsyncSession, expense_id: str) -> bool:
    """Borrar la foto. Devuelve False si no existía."""
    photo = await db.get(ExpensePhoto, expense_id)
    if photo is None:
        return False
    await db.delete(photo)
    await db.flush()
    return True
