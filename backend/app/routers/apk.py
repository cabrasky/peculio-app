"""APK de Android: build servida (público) y repositorio de versiones (admin).

Público:
    GET  /apk/latest                 datos de la build que se sirve (para la portada)
    GET  /apk/download               descarga la build servida (cuenta la descarga)
    GET  /apk/download/{id}          descarga una build concreta (la usa manifest.json)
Admin:
    GET  /admin/apk                  repositorio (registra antes los APK nuevos de la carpeta)
    POST /admin/apk/{id}/serve       servir esa build (reescribe manifest.json)
    PUT  /admin/apk/{id}             notas / código de versión
    DELETE /admin/apk/{id}           borrar la build y su fichero (no la servida)
    POST /admin/apk/uploads          empezar una subida → id y tamaño de trozo
    PUT  /admin/apk/uploads/{id}     un trozo (cuerpo binario, ?offset=bytes ya subidos)
    POST /admin/apk/uploads/{id}/complete   comprobar, guardar en builds/ y registrar
    DELETE /admin/apk/uploads/{id}   cancelar
"""
import hashlib
import json
import os
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.models import ApkBuild, User
from app.routers.auth import require_admin
from app.schemas.schemas import ApkBuildUpdate, ApkUploadComplete, ApkUploadInit
from app.services import apk as repo

public = APIRouter(prefix="/apk", tags=["apk"])
admin_router = APIRouter(prefix="/admin/apk", tags=["admin"])

UPLOAD_ID = re.compile(r"^[0-9a-f]{32}$")


def _build_out(b: ApkBuild, served_id: str | None) -> dict:
    return {
        "id": b.id, "file": b.file, "version": b.version, "version_code": b.version_code,
        "build_number": b.build_number, "commit": b.commit, "source": b.source,
        "size": b.size, "sha256": b.sha256, "uploaded_at": b.uploaded_at, "uploaded_by": b.uploaded_by,
        "notes": b.notes, "downloads": b.downloads, "served": b.id == served_id,
        "file_url": f"/apk/{b.file}",
        "missing": not (repo.apk_dir() / b.file).is_file(),
    }


# ── Público ──────────────────────────────────────────────────────────────────

@public.get("/latest")
async def latest(db: AsyncSession = Depends(get_db)):
    build = await repo.served_build(db)
    if build is None:
        await repo.sync_builds(db)
        build = await repo.served_build(db)
    if build is None:
        raise HTTPException(status_code=404, detail="No APK published")
    return {
        "id": build.id, "version": build.version, "version_code": build.version_code,
        "build_number": build.build_number, "size": build.size,
        "published_at": build.uploaded_at, "notes": build.notes,
        "download_url": "/api/apk/download",
    }


async def _download(db: AsyncSession, build: ApkBuild | None) -> RedirectResponse:
    if build is None or not (repo.apk_dir() / build.file).is_file():
        raise HTTPException(status_code=404, detail="No APK published")
    await db.execute(update(ApkBuild).where(ApkBuild.id == build.id).values(downloads=ApkBuild.downloads + 1))
    return RedirectResponse(f"/apk/{build.file}", status_code=302)


@public.get("/download")
async def download_served(db: AsyncSession = Depends(get_db)):
    build = await repo.served_build(db)
    if build is None:
        await repo.sync_builds(db)
        build = await repo.served_build(db)
    return await _download(db, build)


@public.get("/download/{build_id}")
async def download_build(build_id: str, db: AsyncSession = Depends(get_db)):
    return await _download(db, await db.get(ApkBuild, build_id))


# ── Admin: repositorio ───────────────────────────────────────────────────────

@admin_router.get("")
async def list_builds(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await repo.sync_builds(db)
    served = await repo.served_build(db)
    builds = (await db.execute(select(ApkBuild).order_by(ApkBuild.uploaded_at.desc()))).scalars().all()
    return {
        "served_id": served.id if served else None,
        "chunk_bytes": settings.apk_chunk_bytes,
        "max_bytes": settings.apk_max_bytes,
        "storage_ok": repo.apk_dir().is_dir(),
        "builds": [_build_out(b, served.id if served else None) for b in builds],
    }


async def _get_build(db: AsyncSession, build_id: str) -> ApkBuild:
    build = await db.get(ApkBuild, build_id)
    if build is None:
        raise HTTPException(status_code=404, detail="Build not found")
    return build


@admin_router.post("/{build_id}/serve")
async def serve_build(build_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    build = await _get_build(db, build_id)
    if not (repo.apk_dir() / build.file).is_file():
        raise HTTPException(status_code=409, detail="APK file is missing")
    await repo.serve(db, build)
    return _build_out(build, build.id)


@admin_router.put("/{build_id}")
async def update_build(build_id: str, body: ApkBuildUpdate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    build = await _get_build(db, build_id)
    if body.notes is not None:
        build.notes = body.notes.strip()
    if body.version_code is not None:
        build.version_code = body.version_code
    await db.flush()
    served = await repo.served_build(db)
    if served is not None and served.id == build.id:
        repo.write_manifest(build)  # la app ve las notas nuevas
    return _build_out(build, served.id if served else None)


@admin_router.delete("/{build_id}", status_code=204)
async def delete_build(build_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    build = await _get_build(db, build_id)
    served = await repo.served_build(db)
    if served is not None and served.id == build.id:
        raise HTTPException(status_code=409, detail="Cannot delete the served build")
    await db.delete(build)
    await db.flush()
    repo.delete_files(build)


# ── Admin: subida por trozos ─────────────────────────────────────────────────

def _upload_paths(upload_id: str):
    if not UPLOAD_ID.match(upload_id):
        raise HTTPException(status_code=404, detail="Upload not found")
    d = repo.uploads_dir()
    return d / f"{upload_id}.part", d / f"{upload_id}.json"


@admin_router.post("/uploads", status_code=201)
async def start_upload(body: ApkUploadInit, admin: User = Depends(require_admin)):
    if not repo.apk_dir().is_dir():
        raise HTTPException(status_code=503, detail="APK storage is not available")
    if body.size > settings.apk_max_bytes:
        raise HTTPException(status_code=413, detail="APK is too large")
    repo.uploads_dir().mkdir(parents=True, exist_ok=True)
    repo.cleanup_stale_uploads()
    upload_id = uuid.uuid4().hex
    part, meta = _upload_paths(upload_id)
    part.write_bytes(b"")
    meta.write_text(json.dumps({**body.model_dump(), "admin": admin.email, "started": datetime.utcnow().isoformat()}), encoding="utf-8")
    return {"id": upload_id, "chunk_bytes": settings.apk_chunk_bytes}


@admin_router.put("/uploads/{upload_id}")
async def upload_chunk(upload_id: str, request: Request, offset: int = Query(..., ge=0), admin: User = Depends(require_admin)):
    part, meta = _upload_paths(upload_id)
    if not meta.is_file():
        raise HTTPException(status_code=404, detail="Upload not found")
    info = json.loads(meta.read_text(encoding="utf-8"))
    data = await request.body()
    if len(data) > settings.apk_chunk_bytes:
        raise HTTPException(status_code=413, detail="Chunk is too large")
    current = part.stat().st_size
    if offset != current:
        # el cliente reintenta desde lo que ya tenemos
        raise HTTPException(status_code=409, detail=f"Expected offset {current}")
    if current + len(data) > info["size"]:
        raise HTTPException(status_code=400, detail="More data than declared")
    with part.open("ab") as f:
        f.write(data)
    return {"received": current + len(data)}


@admin_router.post("/uploads/{upload_id}/complete", status_code=201)
async def complete_upload(upload_id: str, body: ApkUploadComplete, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    part, meta = _upload_paths(upload_id)
    if not meta.is_file():
        raise HTTPException(status_code=404, detail="Upload not found")
    info = json.loads(meta.read_text(encoding="utf-8"))
    size = part.stat().st_size
    if size != info["size"]:
        raise HTTPException(status_code=400, detail=f"Incomplete upload ({size} of {info['size']} bytes)")
    if not repo.looks_like_apk(part):
        part.unlink(missing_ok=True)
        meta.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="The file is not a valid APK")

    h = hashlib.sha256()
    with part.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    stamp = datetime.utcnow()
    safe_version = re.sub(r"[^0-9A-Za-z.+-]", "", info["version"]) or "0"
    rel = f"builds/peculio-{safe_version}-u{stamp:%Y%m%d%H%M%S}.apk"
    (repo.apk_dir() / "builds").mkdir(parents=True, exist_ok=True)
    os.replace(part, repo.apk_dir() / rel)
    meta.unlink(missing_ok=True)

    build = ApkBuild(
        file=rel, version=info["version"], version_code=info.get("version_code"),
        source="upload", size=size, sha256=h.hexdigest(), uploaded_at=stamp,
        uploaded_by=info.get("admin", ""), notes=(info.get("notes") or "").strip(),
    )
    db.add(build)
    await db.flush()
    if body.serve:
        await repo.serve(db, build)
    served = await repo.served_build(db)
    return _build_out(build, served.id if served else None)


@admin_router.delete("/uploads/{upload_id}", status_code=204)
async def cancel_upload(upload_id: str, admin: User = Depends(require_admin)):
    part, meta = _upload_paths(upload_id)
    part.unlink(missing_ok=True)
    meta.unlink(missing_ok=True)
