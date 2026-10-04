"""Prueba E2E de la baja: eliminar la cuenta borra TODOS los datos del usuario (y solo los suyos).

Uso:  python tests/test_delete_account_e2e.py     (desde backend/, o desde cualquier parte)
      (necesita: uv pip install -r requirements.txt aiosqlite httpx)
"""
import os, sys, tempfile

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

WORK = tempfile.mkdtemp(prefix="mbtest_delete_")
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

JPG = bytes.fromhex(  # JPEG mínimo válido (1×1)
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720"
    "222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405"
    "060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282"
    "090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495"
    "969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008"
    "010100003f00fbd3ffd9")


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from starlette.testclient import TestClient
    from sqlalchemy import func, select
    from app.models.models import ExpensePhoto, Expense, SupportMessage, SupportTicket, User
    from app.services.accounts import USER_TABLES

    fails = 0
    def check(name, cond, extra=""):
        nonlocal fails
        if not cond: fails += 1
        print(("PASS " if cond else "FAIL ") + name + (f" — {extra}" if extra else ""))

    async def rows_of(uid):
        """Filas del usuario en cada tabla (y fotos de sus gastos)."""
        async with engine.connect() as conn:
            out = {m.__tablename__: await conn.scalar(select(func.count()).select_from(m).where(m.user_id == uid)) for m in USER_TABLES}
            out["expense_photos"] = await conn.scalar(select(func.count()).select_from(ExpensePhoto).where(
                ExpensePhoto.expense_id.in_(select(Expense.id).where(Expense.user_id == uid))))
            out["support_messages"] = await conn.scalar(select(func.count()).select_from(SupportMessage).where(
                SupportMessage.ticket_id.in_(select(SupportTicket.id).where(SupportTicket.user_id == uid))))
            out["users"] = await conn.scalar(select(func.count()).select_from(User).where(User.id == uid))
            return out

    def fill_account(c, email):
        r = c.post("/api/auth/register", json={"email": email, "password": "secret123", "name": "Tester"})
        H = {"Authorization": f"Bearer {r.json()['token']}"}
        uid = r.json()["user"]["id"]
        eid = c.post("/api/expenses", headers=H, json={"date": "2026-09-20", "description": "Cena", "amount": 30}).json()["id"]
        c.post(f"/api/expenses/{eid}/photo", headers=H, files={"file": ("t.jpg", JPG, "image/jpeg")})
        c.post("/api/incomes", headers=H, json={"date": "2026-09-01", "description": "Nómina", "amount": 1500})
        c.post("/api/goals", headers=H, json={"name": "Viaje", "target_amount": 900})
        c.post("/api/subscriptions", headers=H, json={"name": "Spotify", "amount": 10.99, "next_billing": "2026-10-01"})
        c.post("/api/projects", headers=H, json={"name": "NAS"})
        c.post("/api/categories", headers=H, json={"kind": "expense", "name": "Mascotas"})
        c.put("/api/developer/toggle", headers=H)
        c.post("/api/developer/keys", headers=H, json={"name": "script"})
        c.post("/api/support", headers=H, json={"subject": "Duda", "body": "¿Cómo exporto mis gastos?"})
        return uid, H

    with TestClient(app) as c:
        uid, H = fill_account(c, "borrar@test.local")
        other_uid, HO = fill_account(c, "otro@test.local")
        before = await rows_of(uid)
        check("hay datos en todas las tablas antes de borrar", all(v > 0 for v in before.values()), str(before))

        r = c.request("DELETE", "/api/auth/me", headers=H, json={"confirm_email": "otro@test.local"})
        check("email que no coincide → 400", r.status_code == 400, f"got {r.status_code}")
        r = c.request("DELETE", "/api/auth/me", headers=H, json={})
        check("sin confirmación → 422", r.status_code == 422, f"got {r.status_code}")
        check("sigue todo tras intentos fallidos", await rows_of(uid) == before)

        r = c.request("DELETE", "/api/auth/me", headers=H, json={"confirm_email": "  BORRAR@test.local "})
        check("email correcto (sin distinguir mayúsculas) → 204", r.status_code == 204, f"got {r.status_code} {r.text[:120]}")
        after = await rows_of(uid)
        check("0 filas del usuario en todas las tablas", all(v == 0 for v in after.values()), str(after))
        check("el token ya no vale (401)", c.get("/api/auth/me", headers=H).status_code == 401)
        check("no se puede entrar", c.post("/api/auth/login", json={"email": "borrar@test.local", "password": "secret123"}).status_code == 401)

        other = await rows_of(other_uid)
        check("el otro usuario conserva todo", all(v > 0 for v in other.values()), str(other))
        check("el otro usuario sigue entrando", c.get("/api/expenses", headers=HO).status_code == 200)

        r = c.post("/api/auth/register", json={"email": "borrar@test.local", "password": "secret123", "name": "Otra vez"})
        check("se puede volver a registrar el mismo email", r.status_code == 200, f"got {r.status_code}")
        H2 = {"Authorization": f"Bearer {r.json()['token']}"}
        check("la cuenta nueva empieza vacía", c.get("/api/expenses", headers=H2).json() == [])

        # La demo pública no se puede eliminar
        HD = {"Authorization": f"Bearer {c.post('/api/auth/demo').json()['token']}"}
        r = c.request("DELETE", "/api/auth/me", headers=HD, json={"confirm_email": "demo@peculio.app"})
        check("la demo no se puede eliminar (403)", r.status_code == 403, f"got {r.status_code}")
        check("la demo sigue con sus datos", len(c.get("/api/expenses?limit=5000", headers=HD).json()) > 50)

    print("\n" + ("TODO OK" if fails == 0 else f"{fails} FALLARON"))
    sys.exit(1 if fails else 0)

import anyio
anyio.run(main)
