"""Projects CRUD router (gastos enlazables a proyectos: NAS, homelab...)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Project, Expense
from app.schemas.schemas import ProjectCreate, ProjectUpdate, ProjectOut
from app.routers.auth import get_user_from_bearer as get_current_user
from app.routers.crud import list_entities, get_entity, create_entity, update_entity, delete_entity

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await list_entities(db, Project, user.id, order_by=Project.name.asc())


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await get_entity(db, Project, project_id, user.id)
    if not p:
        raise HTTPException(status_code=404)
    return p


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(body: ProjectCreate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    return await create_entity(db, Project, user.id, {"name": name})


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: str, body: ProjectUpdate, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data = {}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        data["name"] = name
    p = await update_entity(db, Project, project_id, user.id, data)
    if not p:
        raise HTTPException(status_code=404)
    return p


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ok = await delete_entity(db, Project, project_id, user.id)
    if not ok:
        raise HTTPException(status_code=404)
    # Desvincular los gastos que apuntaban al proyecto
    await db.execute(
        update(Expense)
        .where(Expense.user_id == user.id, Expense.project_id == project_id)
        .values(project_id="")
    )
