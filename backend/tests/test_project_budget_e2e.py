"""Prueba E2E del presupuesto por proyecto: crear, editar, quitar y compatibilidad sin el campo.

Uso:  python tests/test_project_budget_e2e.py     (desde backend/, o desde cualquier parte)
      (necesita: uv pip install -r requirements.txt aiosqlite httpx)
"""
import os, sys, tempfile

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

WORK = tempfile.mkdtemp(prefix="mbtest_budget_")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{os.path.join(WORK, 'test.db')}"

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
        r = c.post("/api/auth/register", json={"email": "budget@test.local", "password": "secret123", "name": "Tester"})
        check("register 200", r.status_code == 200, f"got {r.status_code}")
        H = {"Authorization": f"Bearer {r.json()['token']}"}

        # 1. sin el campo (apps anteriores): el proyecto no tiene presupuesto
        r = c.post("/api/projects", headers=H, json={"name": "NAS"})
        check("crear sin presupuesto 201", r.status_code == 201, f"got {r.status_code} {r.text[:120]}")
        nas = r.json()
        check("budget nulo por defecto", nas.get("budget") is None, str(nas.get("budget")))

        # 2. con presupuesto
        r = c.post("/api/projects", headers=H, json={"name": "Reforma", "budget": 1500.456})
        check("crear con presupuesto 201", r.status_code == 201 and r.json().get("budget") == 1500.46, r.text[:120])
        reforma = r.json()

        # 3. editar solo el nombre no toca el presupuesto
        r = c.put(f"/api/projects/{reforma['id']}", headers=H, json={"name": "Reforma baño"})
        check("renombrar conserva el presupuesto", r.status_code == 200 and r.json()["name"] == "Reforma baño" and r.json()["budget"] == 1500.46, r.text[:120])

        # 4. cambiarlo y ponerlo a un proyecto que no tenía
        r = c.put(f"/api/projects/{reforma['id']}", headers=H, json={"budget": 2000})
        check("cambiar el presupuesto", r.status_code == 200 and r.json()["budget"] == 2000 and r.json()["name"] == "Reforma baño", r.text[:120])
        r = c.put(f"/api/projects/{nas['id']}", headers=H, json={"budget": 600})
        check("poner presupuesto a uno que no tenía", r.status_code == 200 and r.json()["budget"] == 600, r.text[:120])

        # 5. quitarlo: null o 0
        r = c.put(f"/api/projects/{reforma['id']}", headers=H, json={"budget": None})
        check("null quita el presupuesto", r.status_code == 200 and r.json()["budget"] is None, r.text[:120])
        r = c.put(f"/api/projects/{nas['id']}", headers=H, json={"budget": 0})
        check("0 quita el presupuesto", r.status_code == 200 and r.json()["budget"] is None, r.text[:120])

        # 6. negativo no vale
        r = c.put(f"/api/projects/{nas['id']}", headers=H, json={"budget": -5})
        check("presupuesto negativo 422", r.status_code == 422, f"got {r.status_code}")

        # 7. la lista lo devuelve
        rows = {p["name"]: p for p in c.get("/api/projects", headers=H).json()}
        check("la lista incluye budget", "budget" in rows["NAS"] and "budget" in rows["Reforma baño"], str(rows)[:160])

    print("\n" + ("TODO OK" if fails == 0 else f"{fails} FALLARON"))
    sys.exit(1 if fails else 0)

import anyio
anyio.run(main)
