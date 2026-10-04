"""Generic CRUD utilities."""
from typing import Type, TypeVar, Optional, Any
from sqlalchemy import select, func, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

ModelT = TypeVar("ModelT")


async def list_entities(
    db: AsyncSession,
    model: Type[ModelT],
    user_id: str,
    skip: int = 0,
    limit: int = 100,
    order_by: Optional[Any] = None,
) -> list[ModelT]:
    stmt = select(model).where(model.user_id == user_id)
    if order_by is not None:
        stmt = stmt.order_by(order_by)
    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_entity(
    db: AsyncSession, model: Type[ModelT], entity_id: str, user_id: str
) -> Optional[ModelT]:
    result = await db.execute(
        select(model).where(model.id == entity_id, model.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def create_entity(
    db: AsyncSession, model: Type[ModelT], user_id: str, data: dict[str, Any]
) -> ModelT:
    entity = model(user_id=user_id, **data)
    db.add(entity)
    await db.flush()
    await db.refresh(entity)
    return entity


async def update_entity(
    db: AsyncSession, model: Type[ModelT], entity_id: str, user_id: str, data: dict[str, Any]
) -> Optional[ModelT]:
    entity = await get_entity(db, model, entity_id, user_id)
    if entity is None:
        return None
    for key, value in data.items():
        if value is not None:
            setattr(entity, key, value)
    await db.flush()
    await db.refresh(entity)
    return entity


async def delete_entity(
    db: AsyncSession, model: Type[ModelT], entity_id: str, user_id: str
) -> bool:
    result = await db.execute(
        sa_delete(model).where(model.id == entity_id, model.user_id == user_id)
    )
    await db.flush()
    return result.rowcount > 0
