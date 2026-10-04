"""Prueba E2E de la cuenta demo: entrar → datos de ejemplo → solo lectura → datos renovados cada día.

Uso:  python tests/test_demo_e2e.py     (desde backend/, o desde cualquier parte)
      (necesita: uv pip install -r requirements.txt aiosqlite httpx)
"""
import os, sys, tempfile
from datetime import date, timedelta

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

WORK = tempfile.mkdtemp(prefix="mbtest_demo_")
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
        # 1. entrar a la demo
        r = c.post("/api/auth/demo")
        check("demo 200", r.status_code == 200, f"got {r.status_code} {r.text[:120]}")
        user = r.json()["user"]
        check("is_demo true", user.get("is_demo") is True)
        check("entra sin ventana de configuración", user.get("setup_done") is True)
        H = {"Authorization": f"Bearer {r.json()['token']}"}

        # 2. datos de ejemplo completos
        exps = c.get("/api/expenses?limit=5000", headers=H).json()
        incs = c.get("/api/incomes?limit=5000", headers=H).json()
        goals = c.get("/api/goals?limit=5000", headers=H).json()
        subs = c.get("/api/subscriptions?limit=5000", headers=H).json()
        projs = c.get("/api/projects", headers=H).json()
        check("≥ 50 gastos", len(exps) >= 50, f"{len(exps)}")
        check("ingresos, metas, suscripciones y proyectos", len(incs) >= 8 and len(goals) >= 4 and len(subs) >= 5 and len(projs) == 2,
              f"{len(incs)} ingresos, {len(goals)} metas, {len(subs)} subs, {len(projs)} proyectos")
        shared = [e for e in exps if e.get("participants")]
        check("hay gastos compartidos con deuda pendiente", any('"repaid": false' in e["participants"] for e in shared))
        check("parte propia calculada", all(e["personal_share"] < e["amount"] for e in shared if '"deb"' in e["participants"]))
        in_project = [e for e in exps if e.get("project_id")]
        check("gastos enlazados a proyectos", len(in_project) >= 6, f"{len(in_project)}")
        months = {e["date"][:7] for e in exps}
        check("repartidos en ≥ 6 meses", len(months) >= 6, f"{sorted(months)}")
        check("categorías sembradas", len(c.get("/api/categories", headers=H).json()) > 0)

        # 3. solo lectura: cualquier cambio hecho con el token demo se rechaza
        eid, gid, iid = exps[0]["id"], goals[0]["id"], incs[0]["id"]
        sid, pid = subs[0]["id"], projs[0]["id"]
        cid = c.get("/api/categories", headers=H).json()[0]["id"]
        writes = [
            ("crear gasto", "POST", "/api/expenses", {"json": {"date": "2026-09-20", "description": "X", "amount": 1}}),
            ("editar gasto", "PUT", f"/api/expenses/{eid}", {"json": {"description": "X"}}),
            ("borrar gasto", "DELETE", f"/api/expenses/{eid}", {}),
            ("subir foto", "POST", f"/api/expenses/{eid}/photo", {"files": {"file": ("a.jpg", b"x", "image/jpeg")}}),
            ("borrar foto", "DELETE", f"/api/expenses/{eid}/photo", {}),
            ("enviar a Cuentas Claras", "POST", f"/api/expenses/{eid}/split", {}),
            ("crear ingreso", "POST", "/api/incomes", {"json": {"date": "2026-09-20", "description": "X", "amount": 1}}),
            ("editar ingreso", "PUT", f"/api/incomes/{iid}", {"json": {"amount": 2}}),
            ("borrar meta", "DELETE", f"/api/goals/{gid}", {}),
            ("editar meta", "PUT", f"/api/goals/{gid}", {"json": {"current_amount": 1}}),
            ("borrar suscripción", "DELETE", f"/api/subscriptions/{sid}", {}),
            ("renombrar proyecto", "PUT", f"/api/projects/{pid}", {"json": {"name": "X"}}),
            ("borrar categoría", "DELETE", f"/api/categories/{cid}", {}),
            ("cambiar nombre", "PUT", "/api/auth/me", {"json": {"name": "Hacker"}}),
            ("cambiar contraseña", "PUT", "/api/auth/me/password", {"json": {"current_password": "", "new_password": "secret123"}}),
            ("modo desarrollador", "PUT", "/api/developer/toggle", {}),
            ("crear clave API", "POST", "/api/developer/keys", {"json": {"name": "k"}}),
            ("importar Excel", "POST", "/api/excel/import", {"files": {"file": ("a.xlsx", b"x", "application/octet-stream")}}),
        ]
        for name, method, url, kw in writes:
            resp = c.request(method, url, headers=H, **kw)
            check(f"bloquea {name} (403)", resp.status_code == 403 and resp.json().get("error_code") == "demo_read_only",
                  f"got {resp.status_code}")
        after = c.get("/api/expenses?limit=5000", headers=H).json()
        check("los datos no han cambiado", after == exps)
        check("no se puede registrar el email demo", c.post("/api/auth/register", json={"email": "demo@peculio.app", "password": "secret123", "name": "X"}).status_code == 409)
        check("no se puede entrar con contraseña", c.post("/api/auth/login", json={"email": "demo@peculio.app", "password": ""}).status_code in (400, 401))

        # 4. preferencias: se devuelven aplicadas pero no se guardan
        r = c.put("/api/auth/me/preferences", headers=H, json={"theme": "dark", "locale": "en"})
        check("preferencias 200 con los valores pedidos", r.status_code == 200 and r.json().get("theme") == "dark")
        me = c.get("/api/auth/me", headers=H).json()
        check("preferencias no guardadas (la demo no impone las suyas)", me.get("theme") == "" and me.get("locale") == "" and me.get("weekly_goal") is None)

        # 5. volver a entrar el mismo día no re-siembra (mismos ids), aunque se mande el token demo
        r = c.post("/api/auth/demo", headers=H)
        check("re-entrar con token demo 200", r.status_code == 200, f"got {r.status_code}")
        same = c.get("/api/expenses?limit=5000", headers=H).json()
        check("mismo día: mismos datos", [e["id"] for e in same] == [e["id"] for e in exps])

        # 6. al día siguiente se re-siembra con fechas al día
        from sqlalchemy import update
        from app.models.models import Expense, User
        from sqlalchemy import select
        async with engine.begin() as conn:
            uid = (await conn.execute(select(User.id).where(User.email == "demo@peculio.app"))).scalar_one()
            for eid_, d in (await conn.execute(select(Expense.id, Expense.date).where(Expense.user_id == uid))).all():
                await conn.execute(update(Expense).where(Expense.id == eid_).values(date=d - timedelta(days=1)))
        H3 = {"Authorization": f"Bearer {c.post('/api/auth/demo').json()['token']}"}
        exps3 = c.get("/api/expenses?limit=5000", headers=H3).json()
        check("otro día: datos renovados", len(exps3) == len(exps) and max(e["date"] for e in exps3) == date.today().isoformat()
              and {e["id"] for e in exps3}.isdisjoint({e["id"] for e in exps}), f"{len(exps3)} gastos")

        # 7. un usuario normal no tiene restricciones
        r = c.post("/api/auth/register", json={"email": "real@test.local", "password": "secret123", "name": "Real"})
        HR = {"Authorization": f"Bearer {r.json()['token']}"}
        check("usuario normal is_demo false", r.json()["user"].get("is_demo") is False)
        check("usuario normal puede cambiar su nombre", c.put("/api/auth/me", headers=HR, json={"name": "Real 2"}).status_code == 200)

    print("\n" + ("TODO OK" if fails == 0 else f"{fails} FALLARON"))
    sys.exit(1 if fails else 0)

import anyio
anyio.run(main)
