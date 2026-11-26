"""Prueba E2E de idempotencia de gastos e ingresos (claves de cliente).

Uso:  python tests/test_sync_idempotency_e2e.py     (desde backend/)
      (necesita: uv pip install -r requirements.txt aiosqlite httpx)
"""
import os, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

WORK = tempfile.mkdtemp(prefix="mbsync_")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{os.path.join(WORK, 'test.db')}"

import sqlalchemy.ext.asyncio as _sa
_orig_async = _sa.create_async_engine
def _safe_async_engine(url, **kw):
    if "sqlite" in str(url):
        kw.pop("pool_size", None); kw.pop("max_overflow", None)
    return _orig_async(url, **kw)
_sa.create_async_engine = _safe_async_engine

from app.main import app
from app.database import engine, Base

EXPENSE = {"date": "2026-01-15", "description": "Compra", "amount": 12.5}
INCOME = {"date": "2026-01-15", "description": "Nomina", "amount": 1000}


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from starlette.testclient import TestClient
    fails = 0

    def check(name, cond, extra=""):
        nonlocal fails
        if not cond:
            fails += 1
        print(("PASS " if cond else "FAIL ") + name + (f" — {extra}" if extra else ""))

    with TestClient(app) as c:
        def register(email):
            r = c.post("/api/auth/register", json={"email": email, "password": "secret123", "name": "Tester"})
            check(f"register {email}", r.status_code == 200, f"got {r.status_code} {r.text[:120]}")
            return {"Authorization": f"Bearer {r.json()['token']}"}

        ha = register("sync-a@test.local")
        hb = register("sync-b@test.local")

        for label, path, base, key1, key2 in (
            ("expense", "/api/expenses", EXPENSE, "cliente-exp-1", "cliente-exp-2"),
            ("income", "/api/incomes", INCOME, "cliente-inc-1", "cliente-inc-2"),
        ):
            first = c.post(path, headers=ha, json={**base, "client_id": key1})
            check(f"{label}: crear con client_id 201", first.status_code == 201, f"got {first.status_code} {first.text[:120]}")
            check(f"{label}: respuesta incluye client_id", first.json().get("client_id") == key1, first.text[:120])

            replay = c.post(path, headers=ha, json={**base, "description": "OTRO", "client_id": key1})
            check(f"{label}: reintento con la misma clave no crea otra fila", replay.status_code in (200, 201), f"got {replay.status_code}")
            check(f"{label}: reintento devuelve el mismo id", replay.json().get("id") == first.json()["id"], replay.text[:120])
            check(f"{label}: reintento no sobrescribe la fila original", replay.json().get("description") == base["description"], replay.text[:120])

            other = c.post(path, headers=hb, json={**base, "client_id": key1})
            check(f"{label}: la clave es por usuario", other.status_code == 201 and other.json()["id"] != first.json()["id"], other.text[:120])

            second = c.post(path, headers=ha, json={**base, "client_id": key2})
            check(f"{label}: otra clave crea otra fila", second.status_code == 201 and second.json()["id"] != first.json()["id"], second.text[:120])

            rows = c.get(path, headers=ha).json()
            check(f"{label}: exactamente 2 filas en el servidor", len(rows) == 2, str(rows)[:200])
            check(f"{label}: la lista expone client_id", any(r.get("client_id") == key1 for r in rows), str(rows)[:200])

            noauth = c.post(path, json={**base, "client_id": "sin-token"})
            check(f"{label}: 401 sin token", noauth.status_code == 401, f"got {noauth.status_code}")
            check(f"{label}: 401 es error_code http_401 (no offline/503)", noauth.json().get("error_code") == "http_401", noauth.text[:160])

            def post_concurrent(_):
                return c.post(path, headers=ha, json={**base, "client_id": "cliente-race"})

            with ThreadPoolExecutor(max_workers=4) as pool:
                results = list(pool.map(post_concurrent, range(4)))
            ids = {r.json().get("id") for r in results if r.status_code in (200, 201)}
            check(f"{label}: carrera de 4 reintentos → un solo id", len(ids) == 1, str([(r.status_code, r.text[:80]) for r in results]))
            rows_after = c.get(path, headers=ha).json()
            check(f"{label}: carrera no duplica filas", len(rows_after) == 3, str(len(rows_after)))

    print("\n" + ("TODO OK" if fails == 0 else f"{fails} FALLARON"))
    sys.exit(1 if fails else 0)

import anyio
anyio.run(main)
