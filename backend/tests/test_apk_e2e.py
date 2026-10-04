"""Prueba E2E del repositorio de APKs: builds de la carpeta, build servida, descargas y subida por trozos.

Uso:  python tests/test_apk_e2e.py     (desde backend/, o desde cualquier parte)
      (necesita: uv pip install -r requirements.txt aiosqlite httpx)
"""
import io, json, os, sys, tempfile, zipfile
from pathlib import Path

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

WORK = tempfile.mkdtemp(prefix="mbtest_apk_")
APK_DIR = Path(WORK) / "apk"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{os.path.join(WORK, 'test.db')}"
os.environ["APK_DIR"] = str(APK_DIR)
os.environ["APK_CHUNK_BYTES"] = "4096"
os.environ["FRONTEND_URL"] = "https://peculio.example"

import sqlalchemy.ext.asyncio as _sa
_orig_async = _sa.create_async_engine
def _safe_async_engine(url, **kw):
    if "sqlite" in str(url):
        kw.pop("pool_size", None); kw.pop("max_overflow", None)
    return _orig_async(url, **kw)
_sa.create_async_engine = _safe_async_engine

from app.main import app
from app.database import engine, Base


def fake_apk(tag: str, size: int = 10_000) -> bytes:
    """Zip con AndroidManifest.xml (lo mínimo para pasar por APK) y relleno aleatorio."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        z.writestr("AndroidManifest.xml", f"<manifest {tag}/>")
        z.writestr("classes.dex", os.urandom(size))
    return buf.getvalue()


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Carpeta como la de producción: dos APK antiguos + manifest.json, y una build de Jenkins con su .json
    (APK_DIR / "builds").mkdir(parents=True)
    (APK_DIR / "peculio-1.0.0.apk").write_bytes(fake_apk("old"))
    (APK_DIR / "peculio-1.2.0.apk").write_bytes(fake_apk("120"))
    (APK_DIR / "manifest.json").write_text(json.dumps({
        "version": "1.2.0", "apkUrl": "https://peculio.cabrasky.net/apk/peculio-1.2.0.apk",
        "publishedAt": "2026-09-25T12:10:29Z", "commit": "d0b947e"}))
    ci_name = "peculio-1.2.0-b43-abc1234.apk"
    (APK_DIR / "builds" / ci_name).write_bytes(fake_apk("ci"))
    (APK_DIR / "builds" / (ci_name + ".json")).write_text(json.dumps({
        "version": "1.2.0", "versionCode": 3530000, "build": "43", "commit": "abc1234",
        "publishedAt": "2026-09-26T09:00:00Z", "notes": "Soporte desde la app", "sha256": "f" * 64}))

    from starlette.testclient import TestClient
    from sqlalchemy import update
    from app.models.models import User

    fails = 0
    def check(name, cond, extra=""):
        nonlocal fails
        if not cond: fails += 1
        print(("PASS " if cond else "FAIL ") + name + (f" — {extra}" if extra else ""))

    def manifest():
        return json.loads((APK_DIR / "manifest.json").read_text())

    with TestClient(app) as c:
        r = c.post("/api/auth/register", json={"email": "admin@test.local", "password": "secret123", "name": "Admin"})
        HA = {"Authorization": f"Bearer {r.json()['token']}"}
        async with engine.begin() as conn:
            await conn.execute(update(User).where(User.id == r.json()["user"]["id"]).values(is_admin=True))
        HU = {"Authorization": f"Bearer {c.post('/api/auth/register', json={'email': 'u@test.local', 'password': 'secret123', 'name': 'U'}).json()['token']}"}

        # ── Público, antes de tocar nada: se sigue sirviendo lo que decía manifest.json ──
        r = c.get("/api/apk/latest")
        check("latest 200 sin elegir nada", r.status_code == 200 and r.json()["version"] == "1.2.0", r.text[:120])
        r = c.get("/api/apk/download", follow_redirects=False)
        check("descarga → 302 al APK que ya se servía", r.status_code == 302 and r.headers["location"] == "/apk/peculio-1.2.0.apk", str(r.headers.get("location")))

        # ── Repositorio ──
        check("no-admin no ve el repositorio (403)", c.get("/api/admin/apk", headers=HU).status_code == 403)
        r = c.get("/api/admin/apk", headers=HA)
        data = r.json()
        by_file = {b["file"]: b for b in data["builds"]}
        check("3 builds registradas (2 antiguas + Jenkins)", len(data["builds"]) == 3, str(list(by_file)))
        old = by_file["peculio-1.2.0.apk"]
        ci = by_file[f"builds/{ci_name}"]
        check("antigua: versión por el nombre, commit del manifest y sha calculado",
              old["source"] == "legacy" and old["commit"] == "d0b947e" and len(old["sha256"]) == 64)
        check("antigua servida y con 1 descarga", old["served"] and old["downloads"] == 1)
        check("Jenkins: datos del .json", ci["source"] == "ci" and ci["version_code"] == 3530000 and ci["build_number"] == "43"
              and ci["notes"] == "Soporte desde la app" and ci["uploaded_at"].startswith("2026-09-26"))
        check("más reciente primero", data["builds"][0]["file"] == f"builds/{ci_name}")

        # ── Servir otra build ──
        r = c.post(f"/api/admin/apk/{ci['id']}/serve", headers=HA)
        m = manifest()
        check("servir → manifest.json nuevo", r.status_code == 200 and m["versionCode"] == 3530000 and m["commit"] == "abc1234"
              and m["apkUrl"] == f"https://peculio.example/api/apk/download/{ci['id']}", json.dumps(m)[:160])
        check("latest = la servida", c.get("/api/apk/latest").json()["id"] == ci["id"])
        r = c.put(f"/api/admin/apk/{ci['id']}", headers=HA, json={"notes": "Soporte y cuenta suspendida"})
        check("notas → también en manifest.json", r.status_code == 200 and manifest()["notes"] == "Soporte y cuenta suspendida")
        r = c.get(f"/api/apk/download/{ci['id']}", follow_redirects=False)
        check("descarga de una build concreta → 302", r.status_code == 302 and r.headers["location"] == f"/apk/builds/{ci_name}")
        counts = {b["file"]: b["downloads"] for b in c.get("/api/admin/apk", headers=HA).json()["builds"]}
        check("contador de descargas por build", counts[f"builds/{ci_name}"] == 1 and counts["peculio-1.2.0.apk"] == 1, str(counts))
        check("build inexistente → 404", c.get("/api/apk/download/nope", follow_redirects=False).status_code == 404)

        # ── Subida por trozos ──
        blob = fake_apk("up", 20_000)
        r = c.post("/api/admin/apk/uploads", headers=HA, json={"filename": "app.apk", "size": len(blob), "version": "1.3.0", "notes": "Subida a mano"})
        check("empezar subida", r.status_code == 201 and r.json()["chunk_bytes"] == 4096, r.text[:120])
        uid, chunk = r.json()["id"], r.json()["chunk_bytes"]
        check("offset equivocado → 409", c.put(f"/api/admin/apk/uploads/{uid}?offset=10", headers={**HA, "Content-Type": "application/octet-stream"}, content=blob[:100]).status_code == 409)
        check("trozo demasiado grande → 413", c.put(f"/api/admin/apk/uploads/{uid}?offset=0", headers={**HA, "Content-Type": "application/octet-stream"}, content=blob[:5000]).status_code == 413)
        r = c.post(f"/api/admin/apk/uploads/{uid}/complete", headers=HA, json={})
        check("completar a medias → 400", r.status_code == 400)
        ok = True
        for off in range(0, len(blob), chunk):
            rr = c.put(f"/api/admin/apk/uploads/{uid}?offset={off}", headers={**HA, "Content-Type": "application/octet-stream"}, content=blob[off:off + chunk])
            ok = ok and rr.status_code == 200
        check("todos los trozos 200", ok)
        r = c.post(f"/api/admin/apk/uploads/{uid}/complete", headers=HA, json={"serve": True})
        up = r.json()
        check("subida completa y servida", r.status_code == 201 and up["source"] == "upload" and up["served"] and up["uploaded_by"] == "admin@test.local", r.text[:160])
        check("fichero en builds/ idéntico", (APK_DIR / up["file"]).read_bytes() == blob)
        check("manifest.json apunta a la subida", manifest()["version"] == "1.3.0" and manifest()["notes"] == "Subida a mano")
        check("sin restos en .uploads", not any((APK_DIR / ".uploads").iterdir()))

        # Un fichero que no es APK
        r = c.post("/api/admin/apk/uploads", headers=HA, json={"size": 10, "version": "9.9.9"})
        bad = r.json()["id"]
        c.put(f"/api/admin/apk/uploads/{bad}?offset=0", headers={**HA, "Content-Type": "application/octet-stream"}, content=b"not an apk")
        r = c.post(f"/api/admin/apk/uploads/{bad}/complete", headers=HA, json={})
        check("no es un APK → 400 y se borra", r.status_code == 400 and not (APK_DIR / ".uploads" / f"{bad}.part").exists())
        check("versión con formato raro → 422", c.post("/api/admin/apk/uploads", headers=HA, json={"size": 10, "version": "../../x"}).status_code == 422)
        check("id de subida raro → 404", c.put("/api/admin/apk/uploads/..%2F..%2Fmanifest?offset=0", headers=HA, content=b"x").status_code == 404)
        check("no-admin no puede subir (403)", c.post("/api/admin/apk/uploads", headers=HU, json={"size": 10, "version": "1.0.0"}).status_code == 403)

        # Fichero desaparecido
        (APK_DIR / "peculio-1.0.0.apk").unlink()
        builds = c.get("/api/admin/apk", headers=HA).json()["builds"]
        gone = next(b for b in builds if b["file"] == "peculio-1.0.0.apk")
        check("fichero borrado a mano → marcado como perdido", gone["missing"])
        check("no se puede servir un fichero perdido (409)", c.post(f"/api/admin/apk/{gone['id']}/serve", headers=HA).status_code == 409)

        # ── Borrar builds ──
        check("no-admin no puede borrar (403)", c.delete(f"/api/admin/apk/{ci['id']}", headers=HU).status_code == 403)
        check("no se puede borrar la servida (409)", c.delete(f"/api/admin/apk/{up['id']}", headers=HA).status_code == 409)
        check("la servida sigue ahí", (APK_DIR / up["file"]).is_file())
        r = c.delete(f"/api/admin/apk/{ci['id']}", headers=HA)
        check("borrar build de Jenkins → 204", r.status_code == 204, r.text[:120])
        check("se borran el APK y su .json", not (APK_DIR / "builds" / ci_name).exists() and not (APK_DIR / "builds" / (ci_name + ".json")).exists())
        files = [b["file"] for b in c.get("/api/admin/apk", headers=HA).json()["builds"]]
        check("no vuelve a aparecer al recargar el repositorio", f"builds/{ci_name}" not in files, str(files))
        check("descarga de la build borrada → 404", c.get(f"/api/apk/download/{ci['id']}", follow_redirects=False).status_code == 404)
        check("borrar una build con el fichero perdido → 204", c.delete(f"/api/admin/apk/{gone['id']}", headers=HA).status_code == 204)
        check("borrar dos veces → 404", c.delete(f"/api/admin/apk/{gone['id']}", headers=HA).status_code == 404)
        files = [b["file"] for b in c.get("/api/admin/apk", headers=HA).json()["builds"]]
        check("quedan la antigua y la subida", sorted(files) == sorted(["peculio-1.2.0.apk", up["file"]]), str(files))
        check("manifest.json intacto", manifest()["version"] == "1.3.0")

    print("\n" + ("TODO OK" if fails == 0 else f"{fails} FALLARON"))
    sys.exit(1 if fails else 0)

import anyio
anyio.run(main)
