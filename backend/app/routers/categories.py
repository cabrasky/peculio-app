"""Categorías por usuario (gastos e ingresos).

Cada usuario parte de las categorías por defecto (se siembran solas en el
primer GET) y puede crear, renombrar o borrar las suyas. Renombrar actualiza
también el histórico (expenses.purpose, subscriptions.category, incomes.category).
Borrar solo se permite si ninguna fila la usa.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Category, Expense, Income, Subscription
from app.schemas.schemas import CategoryCreate, CategoryUpdate, CategoryOut
from app.routers.auth import get_user_from_bearer as get_current_user

router = APIRouter(prefix="/categories", tags=["categories"])

_PALETTE = ["#6d28d9", "#92400e", "#155e75", "#1e40af", "#9a3412", "#065f46", "#9d174d", "#3f6212", "#115e59",
            "#be185d", "#b45309", "#4d7c0f", "#7c3aed", "#0e7490", "#c026d3", "#0369a1"]

_DEFAULTS = {
    "expense": ["Ocio", "Comida", "Bebida", "Transporte", "Estancia", "Ahorro/Inversion",
                "Productos", "Deporte/Ejercicio", "Farmacia"],
    "income": ["Salario", "Freelance", "Inversion", "Regalo", "Venta", "Devolucion", "Otro"],
}
_VALID_KINDS = {"expense", "income"}


async def _ensure_defaults(db: AsyncSession, user_id: str, kind: str):
    """Si el usuario aún no tiene categorías de este tipo, crea las por defecto."""
    n = await db.scalar(select(func.count()).select_from(Category).where(
        Category.user_id == user_id, Category.kind == kind))
    if n:
        return
    for i, name in enumerate(_DEFAULTS[kind]):
        db.add(Category(user_id=user_id, kind=kind, name=name, color=_PALETTE[i % len(_PALETTE)]))
    await db.flush()


@router.get("", response_model=list[CategoryOut])
async def list_categories(kind: str = "", user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if kind and kind not in _VALID_KINDS:
        raise HTTPException(status_code=400, detail="kind must be 'expense' or 'income'")
    kinds = [kind] if kind else list(_VALID_KINDS)
    for k in kinds:
        await _ensure_defaults(db, user.id, k)
    await db.flush()
    result = await db.execute(
        select(Category).where(Category.user_id == user.id, Category.kind.in_(kinds)).order_by(Category.kind, Category.created_at)
    )
    return list(result.scalars().all())


@router.post("", response_model=CategoryOut, status_code=201)
async def create_category(body: CategoryCreate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    name = (body.name or "").strip()
    kind = (body.kind or "").strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if kind not in _VALID_KINDS:
        raise HTTPException(status_code=400, detail="kind must be 'expense' or 'income'")
    if len(name) > 40:
        raise HTTPException(status_code=400, detail="Maximum length is 40 characters")
    dup = await db.scalar(select(Category).where(
        Category.user_id == user.id, Category.kind == kind, func.lower(Category.name) == name.lower()))
    if dup:
        raise HTTPException(status_code=400, detail="A category with that name already exists")
    color = _PALETTE[(await db.scalar(select(func.count()).select_from(Category).where(Category.user_id == user.id, Category.kind == kind)) or 0) % len(_PALETTE)]
    cat = Category(user_id=user.id, kind=kind, name=name, color=color)
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.put("/{category_id}", response_model=CategoryOut)
async def update_category(category_id: str, body: CategoryUpdate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cat = await db.scalar(select(Category).where(Category.id == category_id, Category.user_id == user.id))
    if not cat:
        raise HTTPException(status_code=404)
    old_name = cat.name
    new_name = old_name
    if body.name is not None:
        new_name = body.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name is required")
        dup = await db.scalar(select(Category).where(
            Category.id != category_id, Category.user_id == user.id,
            Category.kind == cat.kind, func.lower(Category.name) == new_name.lower()))
        if dup:
            raise HTTPException(status_code=400, detail="A category with that name already exists")
    if body.color is not None and body.color.strip():
        cat.color = body.color.strip()
    if new_name != old_name:
        cat.name = new_name
        # Renombrar actualiza el histórico del usuario
        if cat.kind == "expense":
            await db.execute(update(Expense).where(Expense.user_id == user.id, Expense.purpose == old_name).values(purpose=new_name))
            await db.execute(update(Subscription).where(Subscription.user_id == user.id, Subscription.category == old_name).values(category=new_name))
        else:
            await db.execute(update(Income).where(Income.user_id == user.id, Income.category == old_name).values(category=new_name))
    await db.flush()
    await db.refresh(cat)
    return cat


@router.delete("/{category_id}", status_code=204)
async def delete_category(category_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cat = await db.scalar(select(Category).where(Category.id == category_id, Category.user_id == user.id))
    if not cat:
        raise HTTPException(status_code=404)
    if cat.kind == "expense":
        used = await db.scalar(select(func.count()).select_from(Expense).where(
            Expense.user_id == user.id, Expense.purpose == cat.name)) or 0
        used += await db.scalar(select(func.count()).select_from(Subscription).where(
            Subscription.user_id == user.id, Subscription.category == cat.name)) or 0
        if used:
            raise HTTPException(status_code=409, detail=f"Cannot delete: {used} record(s) use this category")
    else:
        used = await db.scalar(select(func.count()).select_from(Income).where(
            Income.user_id == user.id, Income.category == cat.name)) or 0
        if used:
            raise HTTPException(status_code=409, detail=f"Cannot delete: {used} income record(s) use this category")
    await db.delete(cat)
    await db.flush()
