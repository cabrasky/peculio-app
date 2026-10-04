"""Goals CRUD router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Goal
from app.schemas.schemas import GoalCreate, GoalUpdate, GoalOut
from app.routers.auth import get_user_from_bearer as get_current_user
from app.routers.crud import list_entities, get_entity, create_entity, update_entity, delete_entity

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("", response_model=list[GoalOut])
async def list_goals(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await list_entities(db, Goal, user.id, order_by=Goal.created_at.desc())


@router.get("/{goal_id}", response_model=GoalOut)
async def get_goal(goal_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await get_entity(db, Goal, goal_id, user.id)
    if not g:
        raise HTTPException(status_code=404)
    return g


@router.post("", response_model=GoalOut, status_code=201)
async def create_goal(body: GoalCreate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await create_entity(db, Goal, user.id, body.model_dump())


@router.put("/{goal_id}", response_model=GoalOut)
async def update_goal(goal_id: str, body: GoalUpdate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    upd = await update_entity(db, Goal, goal_id, user.id, body.model_dump(exclude_unset=True))
    if not upd:
        raise HTTPException(status_code=404)
    return upd


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(goal_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ok = await delete_entity(db, Goal, goal_id, user.id)
    if not ok:
        raise HTTPException(status_code=404)
