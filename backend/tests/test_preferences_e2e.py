"""Prueba E2E de las preferencias de cuenta: registro → valores por defecto → PUT parcial → GET /me.

Uso:  python tests/test_preferences_e2e.py     (desde backend/, o desde cualquier parte)
      (necesita: uv pip install -r requirements.txt aiosqlite httpx)
"""
import os, sys, tempfile

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

WORK = tempfile.mkdtemp(prefix="mbtest_prefs_")
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
        # 1. registro: la cuenta nueva trae las preferencias por defecto
        r = c.post("/api/auth/register", json={"email": "prefs@test.local", "password": "secret123", "name": "Tester"})
        check("register 200", r.status_code == 200, f"got {r.status_code}")
        user = r.json()["user"]
        check("locale vacío por defecto", user.get("locale") == "")
        check("theme system por defecto", user.get("theme") == "system")
        check("weekly_goal nulo por defecto", user.get("weekly_goal") is None)
        check("setup_done false por defecto", user.get("setup_done") is False)
        check("mobile_tour_done false por defecto", user.get("mobile_tour_done") is False)
        H = {"Authorization": f"Bearer {r.json()['token']}"}

        # 2. actualización parcial
        r = c.put("/api/auth/me/preferences", headers=H, json={"locale": "pt", "theme": "dark", "weekly_goal": 75.5, "setup_done": True})
        check("PUT preferences 200", r.status_code == 200, f"got {r.status_code} {r.text[:120]}")
        body = r.json()
        check("devuelve los valores nuevos", body.get("locale") == "pt" and body.get("theme") == "dark"
              and body.get("weekly_goal") == 75.5 and body.get("setup_done") is True)

        # 3. los campos no enviados no cambian
        r = c.put("/api/auth/me/preferences", headers=H, json={"mobile_tour_done": True})
        body = r.json()
        check("PUT parcial conserva el resto", body.get("locale") == "pt" and body.get("theme") == "dark"
              and body.get("mobile_tour_done") is True)

        # 4. persistencia en /me
        r = c.get("/api/auth/me", headers=H)
        me = r.json()
        check("GET /me trae las preferencias", me.get("locale") == "pt" and me.get("weekly_goal") == 75.5
              and me.get("setup_done") is True and me.get("mobile_tour_done") is True)

        # 5. login también las devuelve
        r = c.post("/api/auth/login", json={"email": "prefs@test.local", "password": "secret123"})
        check("login trae las preferencias", r.json()["user"].get("theme") == "dark")

        # 6. valores no válidos
        for bad in ({"locale": "fr"}, {"theme": "sepia"}, {"weekly_goal": -5}):
            r = c.put("/api/auth/me/preferences", headers=H, json=bad)
            check(f"rechaza {bad}", r.status_code == 422, f"got {r.status_code}")

        # 7. sin sesión
        r = c.put("/api/auth/me/preferences", json={"theme": "light"})
        check("sin token 401", r.status_code == 401, f"got {r.status_code}")

    print("\n" + ("TODO OK" if fails == 0 else f"{fails} FALLARON"))
    sys.exit(1 if fails else 0)

import anyio
anyio.run(main)
