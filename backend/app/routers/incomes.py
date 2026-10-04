"""Incomes CRUD router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.models import Income
from app.schemas.schemas import IncomeCreate, IncomeUpdate, IncomeOut
from app.routers.auth import get_user_from_bearer as get_current_user
from app.routers.crud import get_entity, create_entity, update_entity, delete_entity

router = APIRouter(prefix="/incomes", tags=["incomes"])


@router.get("", response_model=list[IncomeOut])
async def list_incomes(
    skip: int = 0, limit: int = 100,
    month: int | None = None, year: int | None = None,
    user=Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    stmt = select(Income).where(Income.user_id == user.id).order_by(Income.date.desc())
    if month and year:
        stmt = stmt.where(func.extract("month", Income.date) == month, func.extract("year", Income.date) == year)
    elif year:
        stmt = stmt.where(func.extract("year", Income.date) == year)
    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{income_id}", response_model=IncomeOut)
async def get_income(income_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    inc = await get_entity(db, Income, income_id, user.id)
    if not inc:
        raise HTTPException(status_code=404)
    return inc


@router.post("", response_model=IncomeOut, status_code=201)
async def create_income(body: IncomeCreate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await create_entity(db, Income, user.id, body.model_dump())


@router.put("/{income_id}", response_model=IncomeOut)
async def update_income(income_id: str, body: IncomeUpdate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    upd = await update_entity(db, Income, income_id, user.id, body.model_dump(exclude_unset=True))
    if not upd:
        raise HTTPException(status_code=404)
    return upd


@router.delete("/{income_id}", status_code=204)
async def delete_income(income_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ok = await delete_entity(db, Income, income_id, user.id)
    if not ok:
        raise HTTPException(status_code=404)
