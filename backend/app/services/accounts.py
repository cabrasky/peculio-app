"""Operaciones sobre cuentas de usuario.

- Borrado de los datos de un usuario: lo usan la baja de la cuenta
  (`DELETE /auth/me`), el borrado desde el panel de admin y el re-sembrado
  diario de la cuenta demo. Si se añade una tabla con `user_id`, hay que
  borrarla aquí también.
- Envío del enlace para restablecer la contraseña (usuario y admin).
"""
import secrets
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    ApiKey, Category, Expense, ExpensePhoto, Goal, Income, Project, Subscription,
    SupportMessage, SupportTicket, User,
)

# Tablas con datos del usuario (fotos y mensajes de soporte van aparte: cuelgan de otra fila)
USER_TABLES = (Expense, Income, Goal, Subscription, Project, Category, ApiKey, SupportTicket)


async def delete_user_data(db: AsyncSession, user_id: str) -> None:
    """Borra todo lo que pertenece al usuario, pero no la fila del usuario."""
    expense_ids = select(Expense.id).where(Expense.user_id == user_id)
    await db.execute(delete(ExpensePhoto).where(ExpensePhoto.expense_id.in_(expense_ids)))
    ticket_ids = select(SupportTicket.id).where(SupportTicket.user_id == user_id)
    await db.execute(delete(SupportMessage).where(SupportMessage.ticket_id.in_(ticket_ids)))
    for model in USER_TABLES:
        await db.execute(delete(model).where(model.user_id == user_id))


async def issue_password_reset(db: AsyncSession, user: User) -> bool:
    """Genera un token de un solo uso (1 h) y envía el email. Devuelve si se envió."""
    from app.mail import send_password_reset_email

    token = secrets.token_urlsafe(48)
    user.reset_token = token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    await db.flush()
    return await send_password_reset_email(user.email, user.name, token, db=db)
