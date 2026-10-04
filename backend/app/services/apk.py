"""Repositorio de versiones del APK de Android.

Los ficheros viven en APK_DIR (en producción, /opt/peculio-apk del servidor, que
nginx sirve en /apk):

    suelto-1.0.0.apk, …       builds antiguas (antes de este repositorio)
    builds/<nombre>.apk            builds nuevas: las sube Jenkins (con un
    builds/<nombre>.apk.json       .json al lado con sus datos) o un admin
    .uploads/                      subidas por trozos en curso
    manifest.json                  la build que se sirve (lo lee la app para
                                   saber si hay actualización)

Los datos de cada build (notas, descargas…) están en la tabla apk_builds; la
que se sirve, en app_settings['apk_served']. Solo cambia cuando lo elige un
admin: Jenkins sube builds pero ya no toca manifest.json.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.models import ApkBuild, AppSetting

SERVED_KEY = "apk_served"
VERSION_RE = re.compile(r"^\d+(\.\d+){0,3}([-+][0-9A-Za-z.]+)?$")
LEGACY_NAME_RE = re.compile(r"(?:peculio|suelto)-(\d+(?:\.\d+){1,3})")


def apk_dir() -> Path:
    return Path(settings.apk_dir)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _parse_dt(value: str | None, fallback: datetime) -> datetime:
    if not value:
        return fallback
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return fallback


def looks_like_apk(path: Path) -> bool:
    """Un APK es un zip con AndroidManifest.xml dentro."""
    try:
        with zipfile.ZipFile(path) as z:
            return "AndroidManifest.xml" in z.namelist()
    except (zipfile.BadZipFile, OSError):
        return False


async def sync_builds(db: AsyncSession) -> None:
    """Registra en la BD los APK de la carpeta que aún no estén (los de Jenkins y los antiguos)."""
    root = apk_dir()
    if not root.is_dir():
        return
    known = set((await db.execute(select(ApkBuild.file))).scalars().all())
    manifest = _read_json(root / "manifest.json")
    candidates = sorted(root.glob("*.apk")) + sorted((root / "builds").glob("*.apk"))
    for path in candidates:
        rel = path.relative_to(root).as_posix()
        if rel in known:
            continue
        try:
            stat = path.stat()
        except FileNotFoundError:  # otra réplica acaba de borrarlo
            continue
        mtime = datetime.utcfromtimestamp(stat.st_mtime)
        meta = _read_json(path.with_name(path.name + ".json"))
        legacy = path.parent == root
        version = str(meta.get("version") or "")
        if not version:
            m = LEGACY_NAME_RE.search(path.name)
            version = m.group(1) if m else ""
        commit = str(meta.get("commit") or "")
        if legacy and not commit and str(manifest.get("apkUrl", "")).endswith("/" + path.name):
            commit = str(manifest.get("commit") or "")
        code = meta.get("versionCode")
        db.add(ApkBuild(
            file=rel,
            version=version[:32],
            version_code=int(code) if isinstance(code, (int, str)) and str(code).isdigit() else None,
            build_number=str(meta.get("build") or "")[:32],
            commit=commit[:40],
            source="legacy" if legacy else str(meta.get("source") or "ci")[:10],
            size=int(meta.get("size") or stat.st_size),
            sha256=str(meta.get("sha256") or "") or _sha256(path),
            uploaded_at=_parse_dt(meta.get("publishedAt"), mtime),
            uploaded_by=str(meta.get("uploadedBy") or ("jenkins" if not legacy else "")),
            notes=str(meta.get("notes") or "")[:1000],
        ))
    await db.flush()
    # Primera vez: la build servida es la que ya anunciaba el manifest.json de la carpeta
    if await db.get(AppSetting, SERVED_KEY) is None and manifest.get("apkUrl"):
        name = str(manifest["apkUrl"]).rsplit("/", 1)[-1]
        current = (await db.execute(select(ApkBuild).where(ApkBuild.file.in_([name, f"builds/{name}"])))).scalar_one_or_none()
        if current is not None:
            db.add(AppSetting(key=SERVED_KEY, value=current.id, updated_at=datetime.utcnow()))
            await db.flush()


async def served_build(db: AsyncSession) -> ApkBuild | None:
    setting = await db.get(AppSetting, SERVED_KEY)
    return await db.get(ApkBuild, setting.value) if setting and setting.value else None


def download_url(build: ApkBuild) -> str:
    return f"{settings.frontend_url}/api/apk/download/{build.id}"


def manifest_of(build: ApkBuild) -> dict:
    """Lo que publica manifest.json (compatible con las apps ya instaladas: version + apkUrl)."""
    return {
        "version": build.version,
        "versionCode": build.version_code,
        "build": build.build_number,
        "commit": build.commit,
        "apkUrl": download_url(build),
        "publishedAt": build.uploaded_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "notes": build.notes,
        "size": build.size,
        "sha256": build.sha256,
    }


def write_manifest(build: ApkBuild) -> None:
    """Escribe manifest.json de forma atómica (varias réplicas pueden escribir a la vez)."""
    root = apk_dir()
    tmp = root / f".manifest-{uuid.uuid4().hex}.json"
    tmp.write_text(json.dumps(manifest_of(build), ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, root / "manifest.json")


async def serve(db: AsyncSession, build: ApkBuild) -> None:
    setting = await db.get(AppSetting, SERVED_KEY)
    if setting is None:
        db.add(AppSetting(key=SERVED_KEY, value=build.id, updated_at=datetime.utcnow()))
    else:
        setting.value = build.id
        setting.updated_at = datetime.utcnow()
    await db.flush()
    write_manifest(build)


def delete_files(build: ApkBuild) -> None:
    """Borra el APK y su .json: si quedaran en la carpeta, sync_builds volvería a registrarlo."""
    path = apk_dir() / build.file
    for p in (path, path.with_name(path.name + ".json")):
        p.unlink(missing_ok=True)


# ── Subidas por trozos (desde el panel) ──────────────────────────────────────

def uploads_dir() -> Path:
    return apk_dir() / ".uploads"


def cleanup_stale_uploads(max_age_hours: int = 24) -> None:
    d = uploads_dir()
    if not d.is_dir():
        return
    limit = datetime.utcnow().timestamp() - max_age_hours * 3600
    for p in d.iterdir():
        try:
            if p.stat().st_mtime < limit:
                p.unlink()
        except OSError:
            pass
