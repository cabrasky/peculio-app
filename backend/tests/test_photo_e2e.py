"""Prueba E2E real del endpoint de fotos: registro → gasto → upload → GET → delete.

Uso:  python tests/test_photo_e2e.py     (desde backend/, o desde cualquier parte)
      (necesita: uv pip install -r requirements.txt aiosqlite pillow httpx)
"""
import os, sys, tempfile

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

WORK = tempfile.mkdtemp(prefix="mbtest_photos_")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{os.path.join(WORK, 'test.db')}"

import httpx
from PIL import Image

# SQLite no acepta pool_size/max_overflow → wrapper solo para esta prueba (antes de importar la app)
import sqlalchemy.ext.asyncio as _sa
_orig_async = _sa.create_async_engine
def _safe_async_engine(url, **kw):
    if "sqlite" in str(url):
        kw.pop("pool_size", None); kw.pop("max_overflow", None)
    return _orig_async(url, **kw)
_sa.create_async_engine = _safe_async_engine

from app.main import app
from app.database import engine, Base

async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from starlette.testclient import TestClient
    fails = 0
    def check(name, cond, extra=""):
        nonlocal fails
        if not cond: fails += 1
        print(("PASS " if cond else "FAIL ") + name + (f" — {extra}" if extra else ""))

    with TestClient(app) as c:
        # 1. registro
        r = c.post("/api/auth/register", json={"email": "test@test.local", "password": "secret123", "name": "Tester"})
        check("register 200", r.status_code == 200, f"got {r.status_code}")
        tok = r.json()["token"]
        H = {"Authorization": f"Bearer {tok}"}

        # 2. crear gasto
        r = c.post("/api/expenses", headers=H, json={"date": "2026-09-20", "description": "Bar La Parada", "amount": 194.0})
        check("create expense 201", r.status_code == 201, f"got {r.status_code}")
        eid = r.json()["id"]
        check("has_photo=false inicial", r.json().get("has_photo") is False)

        # 3. jpeg real
        img = Image.new("RGB", (400, 300), (30, 120, 200))
        p1 = os.path.join(WORK, "ticket.jpg"); img.save(p1, "JPEG", quality=85)
        jpg = open(p1, "rb").read()

        # 4. upload
        r = c.post(f"/api/expenses/{eid}/photo", headers=H, files={"file": ("ticket.jpg", jpg, "image/jpeg")})
        check("upload photo 201", r.status_code == 201, f"got {r.status_code} {r.text[:120]}")
        check("has_photo=true tras upload", r.json().get("has_photo") is True)

        # 5. list includes has_photo
        r = c.get("/api/expenses", headers=H)
        rows = {e["id"]: e for e in r.json()}
        check("lista trae has_photo", eid in rows and rows[eid].get("has_photo") is True)

        # 6. GET foto = mismos bytes, content-type original
        r = c.get(f"/api/expenses/{eid}/photo", headers=H)
        check("GET foto 200", r.status_code == 200)
        check("content-type image/jpeg", (r.headers.get("content-type") or "").startswith("image/jpeg"))
        check("bytes idénticos al original", r.content == jpg, f"{len(r.content)} vs {len(jpg)} b")
        check("cache privado", (r.headers.get("cache-control") or "").startswith("private"))

        # 7. reemplazo (segunda foto)
        img2 = Image.new("RGB", (300, 300), (200, 60, 60)); p2 = os.path.join(WORK, "t2.jpg"); img2.save(p2, "JPEG")
        jpg2 = open(p2, "rb").read()
        r = c.post(f"/api/expenses/{eid}/photo", headers=H, files={"file": ("t2.jpg", jpg2, "image/jpeg")})
        check("reemplazo 201", r.status_code == 201)
        r = c.get(f"/api/expenses/{eid}/photo", headers=H)
        check("GET devuelve la NUEVA foto", r.content == jpg2)

        # 8. tipo no permitido
        r = c.post(f"/api/expenses/{eid}/photo", headers=H, files={"file": ("x.txt", b"hola", "text/plain")})
        check("tipo no permitido 400", r.status_code == 400, f"got {r.status_code}")

        # 9. otro usuario no ve la foto ni el gasto
        r2 = c.post("/api/auth/register", json={"email": "otro@test.local", "password": "secret123", "name": "Otro"})
        H2 = {"Authorization": f"Bearer {r2.json()['token']}"}
        r = c.get(f"/api/expenses/{eid}/photo", headers=H2)
        check("otro usuario NO ve foto (404)", r.status_code == 404, f"got {r.status_code}")
        r = c.get(f"/api/expenses/{eid}", headers=H2)
        check("otro usuario NO ve el gasto (404)", r.status_code == 404, f"got {r.status_code}")

        # 10. borrar foto
        r = c.delete(f"/api/expenses/{eid}/photo", headers=H)
        check("delete photo 200", r.status_code == 200, f"got {r.status_code}")
        check("has_photo=false tras delete", r.json().get("has_photo") is False)
        r = c.get(f"/api/expenses/{eid}/photo", headers=H)
        check("GET foto tras delete 404", r.status_code == 404)
        r = c.delete(f"/api/expenses/{eid}/photo", headers=H)
        check("delete sin foto 404", r.status_code == 404)

        # 11. borrar el gasto borra la foto en cascada
        c.post(f"/api/expenses/{eid}/photo", headers=H, files={"file": ("a.jpg", jpg, "image/jpeg")})
        r = c.delete(f"/api/expenses/{eid}", headers=H)
        check("delete expense 204", r.status_code == 204)
        r = c.get(f"/api/expenses/{eid}/photo", headers=H)
        check("GET foto tras borrar gasto 404", r.status_code == 404)

    print("\n" + ("TODO OK" if fails == 0 else f"{fails} FALLARON"))
    sys.exit(1 if fails else 0)

import anyio
anyio.run(main)
