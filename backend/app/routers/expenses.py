"""Expenses CRUD router."""
import json
import logging
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import SQLAlchemyError

from app.database import get_db
from app.models.models import Expense
from app.schemas.schemas import ExpenseCreate, ExpenseUpdate, ExpenseOut
from app.routers.auth import get_user_from_bearer as get_current_user
from app.routers.crud import list_entities, get_entity, create_entity, update_entity, delete_entity
from app.services.photos import store_photo, get_photo_response, delete_photo
from app.services.recurring import ensure_recurring_expenses

router = APIRouter(prefix="/expenses", tags=["expenses"])
logger = logging.getLogger(__name__)

def _to_api(expense: Expense) -> dict:
    return {
        "id": expense.id,
        "user_id": expense.user_id,
        "date": expense.date,
        "description": expense.description,
        "amount": expense.amount,
        "purpose": expense.purpose,
        "motive": expense.motive,
        "type": expense.type,
        "method": expense.method,
        "is_shared": expense.is_shared,
        "is_invitation": expense.is_invitation,
        "debtors": expense.debtors,
        "participants": expense.participants,
        "cc_reference": expense.cc_reference,
        "repayment_method": expense.repayment_method,
        "repaid": expense.repaid,
        "personal_share": expense.personal_share,
        "trip": expense.trip,
        "project_id": expense.project_id,
        "has_photo": expense.has_photo,
        "created_at": expense.created_at,
    }


def _calculated_my_share(data: dict) -> float:
    """Calcula la parte propia a partir del reparto, no del importe bruto."""
    amount = round(float(data.get("amount") or 0), 2)
    try:
        people = json.loads(data.get("participants") or "[]")
    except (TypeError, ValueError):
        people = []
    if isinstance(people, list) and people:
        debt = 0.0
        for person in people:
            if not isinstance(person, dict) or person.get("r") != "deb":
                continue
            try:
                debt += round(float(person.get("m") or 0), 2)
            except (TypeError, ValueError):
                continue
        return round(max(0, amount - debt), 2)
    if data.get("is_invitation") and not data.get("is_shared") and not str(data.get("debtors") or "").strip():
        return amount
    if data.get("is_shared") or str(data.get("debtors") or "").strip():
        return round(max(0, float(data.get("personal_share") or 0)), 2)
    return amount


@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    request: Request,
    skip: int = 0,
    limit: int = 100,
    month: int | None = None,
    year: int | None = None,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Gastos recurrentes: los cobros automáticos vencidos se apuntan antes de
    # devolver la lista, para que la web esté al día.
    request_id = getattr(request.state, "request_id", "unknown")
    # Leer antes del try: si el chequeo falla, el rollback expira `user` y volver a
    # leer sus atributos fuera del contexto async da MissingGreenlet (503).
    user_id = user.id
    try:
        await ensure_recurring_expenses(db, user_id)
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Expense recurring check failed request_id=%s", request_id)
        # Recurring expenses are optional; they must never block the expense list.
    stmt = select(Expense).where(Expense.user_id == user_id).order_by(Expense.date.desc())
    if month and year:
        stmt = stmt.where(
            func.extract("month", Expense.date) == month,
            func.extract("year", Expense.date) == year,
        )
    elif year:
        stmt = stmt.where(func.extract("year", Expense.date) == year)
    stmt = stmt.offset(skip).limit(limit)
    try:
        result = await db.execute(stmt)
        return [_to_api(expense) for expense in result.scalars().all()]
    except SQLAlchemyError:
        logger.exception("Expense list query failed request_id=%s", request_id)
        raise HTTPException(
            status_code=503,
            detail="Database error while loading expenses",
            headers={"X-Error-Code": "expense_list_database_error"},
        )


@router.get("/{expense_id}", response_model=ExpenseOut)
async def get_expense(expense_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    expense = await get_entity(db, Expense, expense_id, user.id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return _to_api(expense)


@router.post("", response_model=ExpenseOut, status_code=201)
async def create_expense(body: ExpenseCreate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data = body.model_dump()
    data["personal_share"] = _calculated_my_share(data)
    return _to_api(await create_entity(db, Expense, user.id, data))


@router.put("/{expense_id}", response_model=ExpenseOut)
async def update_expense(expense_id: str, body: ExpenseUpdate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    updated = await update_entity(db, Expense, expense_id, user.id, body.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Expense not found")
    updated.personal_share = _calculated_my_share({
        "amount": updated.amount,
        "is_shared": updated.is_shared,
        "is_invitation": updated.is_invitation,
        "debtors": updated.debtors,
        "participants": updated.participants,
        "personal_share": updated.personal_share,
    })
    await db.flush()
    await db.refresh(updated)
    return _to_api(updated)


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(expense_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    deleted = await delete_entity(db, Expense, expense_id, user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Expense not found")
    # la foto se borra en cascada (FK ondelete=CASCADE en expense_photos)


# ── Integración: enviar gasto compartido a Cuentas Claras ──────────
import json as _json
import httpx as _httpx
import os as _os

CC_BASE = _os.environ.get("CC_BASE_URL", "https://cuentas-claras.cabrasky.net")
CC_SECRET = _os.environ.get("CC_MB_SECRET", "")


def _personas_list(raw: str):
    try:
        arr = _json.loads(raw or "[]")
        return [p for p in arr if isinstance(p, dict) and p.get("n")]
    except Exception:
        return []


@router.post("/{expense_id}/split")
async def send_to_cc(expense_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Empuja un gasto compartido (personas) a Cuentas Claras como reparto."""
    expense = await get_entity(db, Expense, expense_id, user.id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    personas = _personas_list(expense.participants)
    if not personas:
        raise HTTPException(status_code=400, detail="Shared expense has no participants to split")
    amount = float(expense.amount or 0)
    parts = []
    sum_parts = 0.0
    for p in personas:
        m = round(float(p.get("m") or 0), 2)
        role = "deb" if p.get("r") == "deb" else "inv"
        if m <= 0:
            continue
        parts.append({"name": str(p["n"])[:30], "amount": m, "role": role})
        sum_parts += m
    self_part = round(amount - sum_parts, 2)
    if self_part > 0.005:
        parts.append({"name": "", "amount": self_part, "role": "self"})
    if not parts:
        raise HTTPException(status_code=400, detail="No distributable amounts found")
    name = (getattr(user, "name", "") or "").strip() or (user.email or "").split("@")[0]
    payload = {
        "title": expense.description or "Gasto compartido",
        "date": expense.date.isoformat() if expense.date else None,
        "paidBy": name[:30],
        "parts": parts,
        "refMb": f"mb:{expense.id}",
    }
    headers = {"X-MB-Secret": CC_SECRET, "X-MB-Email": (user.email or "").lower()}
    try:
        async with _httpx.AsyncClient(timeout=40) as client:
            resp = await client.post(f"{CC_BASE}/api/integration/suelto/split", json=payload, headers=headers)
    except Exception:
        raise HTTPException(status_code=502, detail="Split service is unavailable; retry in a few seconds")
    if resp.status_code == 403:
        raise HTTPException(status_code=409, detail="Your email has no account in the split service")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Split service returned {resp.status_code}")
    data = resp.json()
    expense.cc_reference = _json.dumps(data, ensure_ascii=False)
    await db.commit()
    await db.refresh(expense)
    return {"ok": True, "url": data.get("receipt", {}).get("url", ""), "session": data.get("session"), "receipt": data.get("receipt")}


# ── Fotos del ticket ─────────────────────────────────────────────────────────

@router.post("/{expense_id}/photo", status_code=201, response_model=ExpenseOut)
async def upload_photo(
    expense_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
):
    """Subir (o reemplazar) la foto del ticket de un gasto."""
    expense = await get_entity(db, Expense, expense_id, user.id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    expense.photo_type = await store_photo(db, expense.id, file)
    await db.commit()
    await db.refresh(expense)
    return _to_api(expense)


@router.get("/{expense_id}/photo", response_class=Response)
async def get_photo(
    expense_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Servir la foto en memoria."""
    expense = await get_entity(db, Expense, expense_id, user.id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return await get_photo_response(db, expense.id, expense.photo_type)


@router.delete("/{expense_id}/photo", response_model=ExpenseOut)
async def remove_photo(
    expense_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Borrar la foto del ticket."""
    expense = await get_entity(db, Expense, expense_id, user.id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if not await delete_photo(db, expense.id) and not expense.photo_type:
        raise HTTPException(status_code=404, detail="Expense has no photo")
    expense.photo_type = ""
    await db.commit()
    await db.refresh(expense)
    return _to_api(expense)
