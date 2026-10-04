"""Prueba E2E del panel de admin: métricas, usuarios (acciones y salvaguardas) y estado del sistema.

Uso:  python tests/test_admin_e2e.py     (desde backend/, o desde cualquier parte)
      (necesita: uv pip install -r requirements.txt aiosqlite httpx)
"""
import os, sys, tempfile
from datetime import datetime, timedelta

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

WORK = tempfile.mkdtemp(prefix="mbtest_admin_")
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
import app.mail as mail

# Correo simulado: se guarda lo que se enviaría
SENT = []
async def _fake_send(to, subject, html, text=None, db=None):
    SENT.append({"to": to, "subject": subject, "html": html})
    return True
mail.send_email = _fake_send

# Prueba de SMTP simulada: se guarda con qué configuración se llamó (la real está en test_smtp_check.py)
CHECKS = []
async def _fake_check(cfg, send_to=None, timeout=10):
    CHECKS.append({"cfg": cfg, "to": send_to})
    return {"ok": True, "steps": [], "error": None, "sent_to": send_to}
mail.check_smtp = _fake_check

JPG = bytes.fromhex(
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
    from sqlalchemy import update, select
    from app.models.models import ServerError, User

    fails = 0
    def check(name, cond, extra=""):
        nonlocal fails
        if not cond: fails += 1
        print(("PASS " if cond else "FAIL ") + name + (f" — {extra}" if extra else ""))

    def register(c, email, name):
        r = c.post("/api/auth/register", json={"email": email, "password": "secret123", "name": name})
        return r.json()["user"]["id"], {"Authorization": f"Bearer {r.json()['token']}"}

    async def set_user(uid, **values):
        async with engine.begin() as conn:
            await conn.execute(update(User).where(User.id == uid).values(**values))

    with TestClient(app) as c:
        admin_id, HA = register(c, "admin@test.local", "Admin")
        await set_user(admin_id, is_admin=True)
        u1, H1 = register(c, "uno@test.local", "Usuario Uno")
        u2, H2 = register(c, "dos@test.local", "Usuario Dos")
        for i in range(3):
            eid = c.post("/api/expenses", headers=H1, json={"date": "2026-09-20", "description": f"G{i}", "amount": 10 + i}).json()["id"]
        c.post(f"/api/expenses/{eid}/photo", headers=H1, files={"file": ("t.jpg", JPG, "image/jpeg")})
        c.post("/api/incomes", headers=H1, json={"date": "2026-09-01", "description": "Nómina", "amount": 1500})
        c.post("/api/goals", headers=H1, json={"name": "Viaje", "target_amount": 900})
        HD = {"Authorization": f"Bearer {c.post('/api/auth/demo').json()['token']}"}  # siembra la demo (no debe contar)

        # ── Acceso ──
        check("no-admin no ve métricas (403)", c.get("/api/admin/stats", headers=H1).status_code == 403)
        check("la demo no ve métricas (403)", c.get("/api/admin/stats", headers=HD).status_code == 403)
        check("sin sesión (401)", c.get("/api/admin/users").status_code == 401)

        # ── Métricas ──
        r = c.get("/api/admin/stats?days=30", headers=HA)
        check("stats 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
        s = r.json(); k = s["kpis"]
        check("usuarios sin la demo = 3", k["users"] == 3, str(k["users"]))
        check("altas y activos en 7 días = 3", k["new_7d"] == 3 and k["active_7d"] == 3, f'{k["new_7d"]}/{k["active_7d"]}')
        check("registros sin la demo", k["records"]["expenses"] == 3 and k["records"]["incomes"] == 1 and k["records"]["goals"] == 1, str(k["records"]))
        check("fotos = 1", k["photos"] == 1, str(k["photos"]))
        check("serie de 30 días", len(s["series"]) == 30)
        today = s["series"][-1]
        check("hoy: 3 altas y 3 gastos", today["signups"] == 3 and today["expenses"] == 3 and today["users"] == 3, str(today))
        check("último acceso: 3 hoy", next(b for b in s["last_login"] if b["bucket"] == "today")["users"] == 3)
        check("days fuera de rango → 422", c.get("/api/admin/stats?days=2", headers=HA).status_code == 422)

        # ── Usuarios ──
        r = c.get("/api/admin/users", headers=HA)
        rows = {u["email"]: u for u in r.json()["users"]}
        check("lista con 4 cuentas (la demo marcada)", r.json()["total"] == 4 and rows["demo@peculio.app"]["is_demo"])
        uno = rows["uno@test.local"]
        check("conteos de Usuario Uno", uno["counts"]["expenses"] == 3 and uno["counts"]["photos"] == 1 and uno["records"] == 5, str(uno["counts"]))
        check("métodos de entrada", uno["providers"] == ["email"])
        check("sin contenido financiero en la lista", "description" not in str(r.json()) and "Nómina" not in str(r.json()))
        r = c.get("/api/admin/users?q=UNO", headers=HA)
        check("búsqueda sin distinguir mayúsculas", r.json()["total"] == 1 and r.json()["users"][0]["id"] == u1)
        r = c.get("/api/admin/users?sort=records", headers=HA)
        check("orden por registros", r.json()["users"][0]["email"] == "demo@peculio.app" or r.json()["users"][0]["records"] >= r.json()["users"][1]["records"])
        r = c.get(f"/api/admin/users/{u1}", headers=HA)
        check("detalle 200", r.status_code == 200 and r.json()["email"] == "uno@test.local" and "api_keys" in r.json())
        check("detalle de usuario inexistente → 404", c.get("/api/admin/users/nope", headers=HA).status_code == 404)

        # Suspender
        check("suspender 200", c.post(f"/api/admin/users/{u1}/suspend", headers=HA).status_code == 200)
        r = c.get("/api/auth/me", headers=H1)
        check("suspendido: /me 403 Account suspended", r.status_code == 403 and r.json()["detail"] == "Account suspended", f"{r.status_code}")
        r = c.post("/api/auth/login", json={"email": "uno@test.local", "password": "secret123"})
        check("suspendido: login 403", r.status_code == 403)
        check("suspendido cuenta en stats", c.get("/api/admin/stats", headers=HA).json()["kpis"]["suspended"] == 1)
        check("reactivar 200", c.post(f"/api/admin/users/{u1}/reactivate", headers=HA).status_code == 200)
        check("reactivado: /me 200", c.get("/api/auth/me", headers=H1).status_code == 200)

        # Salvaguardas
        demo_id = c.get("/api/auth/me", headers=HD).json()["id"]
        check("no puede suspenderse a sí mismo", c.post(f"/api/admin/users/{admin_id}/suspend", headers=HA).status_code == 400)
        check("no se puede suspender la demo", c.post(f"/api/admin/users/{demo_id}/suspend", headers=HA).status_code == 400)
        check("no se puede quitar su propio admin", c.put(f"/api/admin/users/{admin_id}/admin", headers=HA, json={"is_admin": False}).status_code == 400)

        # Dar / quitar admin
        check("dar admin a Dos", c.put(f"/api/admin/users/{u2}/admin", headers=HA, json={"is_admin": True}).status_code == 200)
        check("Dos ya ve el panel", c.get("/api/admin/stats", headers=H2).status_code == 200)
        check("no se suspende a un admin", c.post(f"/api/admin/users/{u2}/suspend", headers=HA).status_code == 400)
        check("no se elimina a un admin", c.request("DELETE", f"/api/admin/users/{u2}", headers=HA, json={"confirm_email": "dos@test.local"}).status_code == 400)
        check("quitar admin a Dos", c.put(f"/api/admin/users/{u2}/admin", headers=HA, json={"is_admin": False}).status_code == 200)
        check("Dos ya no ve el panel", c.get("/api/admin/stats", headers=H2).status_code == 403)

        # Reset de contraseña
        SENT.clear()
        r = c.post(f"/api/admin/users/{u2}/password-reset", headers=HA)
        async with engine.connect() as conn:
            token = (await conn.execute(select(User.reset_token).where(User.id == u2))).scalar_one()
        check("reset de contraseña: token + email a Dos", r.status_code == 200 and token and SENT and SENT[0]["to"] == "dos@test.local")

        # Último acceso: /auth/me lo refresca si tiene más de una hora
        await set_user(u2, last_login=datetime.utcnow() - timedelta(days=3))
        c.get("/api/auth/me", headers=H2)
        async with engine.connect() as conn:
            ll = (await conn.execute(select(User.last_login).where(User.id == u2))).scalar_one()
        check("/auth/me refresca el último acceso", datetime.utcnow() - ll < timedelta(minutes=1))

        # Eliminar
        check("eliminar con email que no coincide → 400",
              c.request("DELETE", f"/api/admin/users/{u1}", headers=HA, json={"confirm_email": "x@test.local"}).status_code == 400)
        r = c.request("DELETE", f"/api/admin/users/{u1}", headers=HA, json={"confirm_email": "UNO@test.local"})
        check("eliminar 204", r.status_code == 204, f"got {r.status_code}")
        check("eliminado: su token ya no vale", c.get("/api/auth/me", headers=H1).status_code == 401)
        k = c.get("/api/admin/stats", headers=HA).json()["kpis"]
        check("stats sin sus datos", k["users"] == 2 and k["records"]["expenses"] == 0 and k["photos"] == 0, str(k["records"]))

        # ── Sistema ──
        async with engine.begin() as conn:
            await conn.execute(ServerError.__table__.insert().values(
                id="e1", created_at=datetime.utcnow(), method="GET", path="/api/x", status=500,
                request_id="req-1", error_type="ValueError", message="boom"))
            await conn.execute(ServerError.__table__.insert().values(
                id="e0", created_at=datetime.utcnow() - timedelta(days=40), method="GET", path="/api/old", status=500,
                request_id="req-0", error_type="ValueError", message="viejo"))
        r = c.get("/api/admin/system", headers=HA)
        sysd = r.json()
        check("system 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
        check("BD ok y tablas contadas", sysd["database"]["ok"] and sysd["database"]["tables"]["users"] == 3, str(sysd["database"]["tables"].get("users")))
        check("errores recientes listados", sysd["errors"]["recent"][0]["request_id"] == "req-1" and sysd["errors"]["last_24h"] == 1)
        check("demo sembrada hoy", sysd["demo"]["seeded_on"] == datetime.now().date().isoformat(), str(sysd["demo"]))
        check("no-admin no ve el sistema", c.get("/api/admin/system", headers=H2).status_code == 403)

        # Guardar un error de verdad (y borrar los de más de 30 días)
        from app.services.errors import record_server_error
        class _Req:
            method = "POST"; state = type("S", (), {"request_id": "req-2"})()
            url = type("U", (), {"path": "/api/boom"})()
        await record_server_error(_Req(), 500, RuntimeError("fallo\nsegunda línea"))
        recent = c.get("/api/admin/system", headers=HA).json()["errors"]["recent"]
        check("record_server_error guarda la primera línea", recent[0]["request_id"] == "req-2" and recent[0]["message"] == "fallo")
        check("borra los de más de 30 días", all(e["request_id"] != "req-0" for e in recent))

        r = c.post("/api/admin/system/test-email", headers=HA)
        check("correo de prueba al admin", r.status_code == 200 and r.json()["ok"] and CHECKS[-1]["to"] == "admin@test.local")

        # Probar la configuración SMTP del formulario (sin guardar)
        smtp = {"host": "smtp.test.local", "port": 587, "user": "gastos@test.local", "password": "guardada",
                "from_email": "gastos@test.local", "from_name": "Peculio"}
        c.put("/api/auth/admin/smtp", headers=HA, json=smtp)
        r = c.post("/api/auth/admin/smtp/test", headers=HA, json={**smtp, "host": "otro.test.local", "password": ""})
        last = CHECKS[-1]
        check("probar conexión: usa el formulario y, sin contraseña, la guardada",
              r.status_code == 200 and last["cfg"]["host"] == "otro.test.local" and last["cfg"]["password"] == "guardada")
        check("probar conexión no envía correo", last["to"] is None)
        c.post("/api/auth/admin/smtp/test", headers=HA, json={**smtp, "send": True})
        check("enviar prueba: por defecto al admin", CHECKS[-1]["to"] == "admin@test.local")
        c.post("/api/auth/admin/smtp/test", headers=HA, json={**smtp, "send": True, "to": "ana@test.local"})
        check("enviar prueba: al destinatario elegido", CHECKS[-1]["to"] == "ana@test.local")
        r = c.post("/api/auth/admin/smtp/test", headers=HA, json={**smtp, "send": True, "to": "no-es-un-email"})
        check("enviar prueba: destinatario no válido → 400", r.status_code == 400)
        check("probar SMTP solo admins", c.post("/api/auth/admin/smtp/test", headers=H2, json=smtp).status_code == 403)

    print("\n" + ("TODO OK" if fails == 0 else f"{fails} FALLARON"))
    sys.exit(1 if fails else 0)

import anyio
anyio.run(main)
