"""Investment capital movements: never included in wages or consumption totals."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import InvestmentMovement
from app.routers.auth import get_user_from_bearer as get_current_user
from app.routers.crud import create_entity, delete_entity, list_entities
from app.schemas.schemas import InvestmentMovementCreate, InvestmentMovementOut

router = APIRouter(prefix="/investments", tags=["investments"])


def view(row: InvestmentMovement) -> InvestmentMovementOut:
    net = round(row.amount - row.fee, 2) if row.kind == "sale" else None
    gain = round(net - row.cost_basis, 2) if net is not None and row.cost_basis is not None else None
    return InvestmentMovementOut.model_validate(row).model_copy(
        update={"net_received": net, "realized_gain": gain}
    )


@router.get("", response_model=list[InvestmentMovementOut])
async def list_movements(
    skip: int = 0, limit: int = 100,
    user=Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    rows = await list_entities(db, InvestmentMovement, user.id, skip, min(limit, 500), InvestmentMovement.date.desc())
    return [view(row) for row in rows]


@router.post("", response_model=InvestmentMovementOut, status_code=201)
async def create_movement(
    body: InvestmentMovementCreate,
    user=Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    row = await create_entity(db, InvestmentMovement, user.id, body.model_dump())
    return view(row)


@router.delete("/{movement_id}", status_code=204)
async def remove_movement(
    movement_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    if not await delete_entity(db, InvestmentMovement, movement_id, user.id):
        raise HTTPException(status_code=404)
