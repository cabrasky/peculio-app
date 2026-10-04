"""Subscriptions CRUD router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Subscription
from app.schemas.schemas import SubscriptionCreate, SubscriptionUpdate, SubscriptionOut
from app.routers.auth import get_user_from_bearer as get_current_user
from app.routers.crud import list_entities, get_entity, create_entity, update_entity, delete_entity

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# El enum de BD es inglés (weekly/monthly/quarterly/yearly); tolera el español
# de las UIs (Mensual/Semanal/Trimestral/Anual) normalizando el ciclo.
_CYCLE_MAP = {"mensual": "monthly", "semanal": "weekly", "trimestral": "quarterly", "anual": "yearly"}
_VALID_CYCLES = {"weekly", "monthly", "quarterly", "yearly"}


def _norm_cycle(data: dict) -> dict:
    ciclo = (data.get("billing_cycle") or data.get("cycle") or "").strip().lower()
    if ciclo:
        if ciclo not in _VALID_CYCLES and ciclo in _CYCLE_MAP:
            data["billing_cycle"] = _CYCLE_MAP[ciclo]
        elif ciclo in _VALID_CYCLES:
            data["billing_cycle"] = ciclo
        else:
            raise HTTPException(status_code=400, detail=f"Invalid billing cycle: {ciclo}")
    return data


@router.get("", response_model=list[SubscriptionOut])
async def list_subscriptions(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await list_entities(db, Subscription, user.id, order_by=Subscription.next_billing.asc())


@router.get("/{sub_id}", response_model=SubscriptionOut)
async def get_subscription(sub_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = await get_entity(db, Subscription, sub_id, user.id)
    if not s:
        raise HTTPException(status_code=404)
    return s


@router.post("", response_model=SubscriptionOut, status_code=201)
async def create_subscription(body: SubscriptionCreate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await create_entity(db, Subscription, user.id, _norm_cycle(body.model_dump()))


@router.put("/{sub_id}", response_model=SubscriptionOut)
async def update_subscription(sub_id: str, body: SubscriptionUpdate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    upd = await update_entity(db, Subscription, sub_id, user.id, _norm_cycle(body.model_dump(exclude_unset=True)))
    if not upd:
        raise HTTPException(status_code=404)
    return upd


@router.delete("/{sub_id}", status_code=204)
async def delete_subscription(sub_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ok = await delete_entity(db, Subscription, sub_id, user.id)
    if not ok:
        raise HTTPException(status_code=404)
