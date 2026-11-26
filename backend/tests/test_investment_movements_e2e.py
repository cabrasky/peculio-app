"""Run directly with the backend test venv; isolated SQLite E2E."""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
work = tempfile.mkdtemp(prefix="investment_e2e_")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{work}/test.db"

import sqlalchemy.ext.asyncio as sa
original = sa.create_async_engine
def sqlite_engine(url, **kw):
    if "sqlite" in str(url):
        kw.pop("pool_size", None)
        kw.pop("max_overflow", None)
    return original(url, **kw)
sa.create_async_engine = sqlite_engine

import anyio
from starlette.testclient import TestClient
from app.database import Base, engine
from app.main import app

async def prepare():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

anyio.run(prepare)
with TestClient(app) as c:
    def signup(email):
        r = c.post("/api/auth/register", json={"email": email, "name": "Tester", "password": "secret123"})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['token']}"}
    a, b = signup("inv-a@example.test"), signup("inv-b@example.test")
    def create(kind, amount, **extra):
        return c.post("/api/investments", headers=a, json={"date": "2026-01-12", "asset": "ETF", "kind": kind, "amount": amount, **extra})
    contribution = create("contribution", 750)
    assert contribution.status_code == 201, contribution.text
    assert contribution.json()["net_received"] is None
    assert contribution.json()["realized_gain"] is None
    assert create("withdrawal", 20).status_code == 201
    first = create("sale", 300, fee=2, cost_basis=280)
    assert first.status_code == 201, first.text
    assert first.json()["net_received"] == 298
    assert first.json()["realized_gain"] == 18
    second = create("sale", 300, fee=2, cost_basis=320)
    assert second.json()["realized_gain"] == -22
    unknown = create("sale", 749.04, fee=1)
    assert unknown.json()["realized_gain"] is None
    assert unknown.json()["net_received"] == 748.04
    assert create("contribution", 20, fee=1).status_code == 422
    assert create("sale", 1, fee=2).status_code == 422
    assert c.get("/api/investments", headers=b).json() == []
    assert len(c.get("/api/investments", headers=a).json()) == 5
    assert c.delete(f"/api/investments/{first.json()['id']}", headers=b).status_code == 404
    assert c.delete(f"/api/investments/{first.json()['id']}", headers=a).status_code == 204
    assert len(c.get("/api/investments", headers=a).json()) == 4
    assert c.get("/api/expenses", headers=a).json() == []
    assert c.get("/api/incomes", headers=a).json() == []
print("TODO OK: investment transfers, partial sales, cost bases, tenancy, historical totals")
