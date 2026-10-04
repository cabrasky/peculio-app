"""Prueba E2E del soporte técnico: el usuario escribe, el admin responde (por email también) y se cierra.

Uso:  python tests/test_support_e2e.py     (desde backend/, o desde cualquier parte)
      (necesita: uv pip install -r requirements.txt aiosqlite httpx)
"""
import os, sys, tempfile

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

WORK = tempfile.mkdtemp(prefix="mbtest_support_")
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
import app.mail as mail

SENT = []
async def _fake_send(to, subject, html, text=None, db=None):
    SENT.append({"to": to, "subject": subject, "html": html})
    return True
mail.send_email = _fake_send


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from starlette.testclient import TestClient
    from sqlalchemy import func, select, update
    from app.models.models import SupportMessage, SupportTicket, User

    fails = 0
    def check(name, cond, extra=""):
        nonlocal fails
        if not cond: fails += 1
        print(("PASS " if cond else "FAIL ") + name + (f" — {extra}" if extra else ""))

    def register(c, email, name):
        r = c.post("/api/auth/register", json={"email": email, "password": "secret123", "name": name})
        return r.json()["user"]["id"], {"Authorization": f"Bearer {r.json()['token']}"}

    with TestClient(app) as c:
        admin_id, HA = register(c, "admin@test.local", "Admin")
        async with engine.begin() as conn:
            await conn.execute(update(User).where(User.id == admin_id).values(is_admin=True))
        uid, HU = register(c, "ana@test.local", "Ana <b>")
        _, HV = register(c, "otro@test.local", "Otro")

        # Nueva consulta
        SENT.clear()
        r = c.post("/api/support", headers=HU, json={"subject": "No carga la foto", "category": "problem",
                                                     "body": "Al subir un ticket <script>x</script> da error", "platform": "android", "app_version": "1.0.0"})
        check("crear consulta 201", r.status_code == 201, f"got {r.status_code} {r.text[:160]}")
        t = r.json(); tid = t["id"]
        check("abierta con 1 mensaje", t["status"] == "open" and len(t["messages"]) == 1 and t["platform"] == "android")
        check("aviso por email al admin", len(SENT) == 1 and SENT[0]["to"] == "admin@test.local")
        check("el email escapa el HTML del usuario", "<script>" not in SENT[0]["html"] and "&lt;script&gt;" in SENT[0]["html"]
              and "Ana &lt;b&gt;" in SENT[0]["html"])

        # Validación y límite diario
        check("asunto demasiado corto → 422", c.post("/api/support", headers=HU, json={"subject": "a", "body": "texto largo"}).status_code == 422)
        check("categoría inválida → 422", c.post("/api/support", headers=HU, json={"subject": "Hola", "category": "spam", "body": "texto largo"}).status_code == 422)
        codes = [c.post("/api/support", headers=HU, json={"subject": f"Consulta {i}", "body": "Otra duda más"}).status_code for i in range(5)]
        check("límite de 5 al día → 429 la sexta", codes == [201, 201, 201, 201, 429], str(codes))

        # Admin: lista y detalle
        r = c.get("/api/admin/support", headers=HA)
        check("admin ve 5 consultas", r.status_code == 200 and len(r.json()) == 5, f"{r.status_code} {len(r.json()) if r.status_code == 200 else ''}")
        row = next(x for x in r.json() if x["id"] == tid)
        check("fila con usuario y vista previa", row["user"]["email"] == "ana@test.local" and row["preview"].startswith("Al subir"))
        check("filtro por estado", len(c.get("/api/admin/support?status=closed", headers=HA).json()) == 0)
        r = c.get(f"/api/admin/support/{tid}", headers=HA)
        check("detalle con hilo", r.status_code == 200 and r.json()["user"]["name"] == "Ana <b>" and len(r.json()["messages"]) == 1)

        # Admin responde
        SENT.clear()
        r = c.post(f"/api/admin/support/{tid}/reply", headers=HA, json={"body": "Prueba a actualizar la app"})
        check("respuesta → answered y email", r.status_code == 200 and r.json()["status"] == "answered" and r.json()["emailed"]
              and SENT and SENT[0]["to"] == "ana@test.local")
        mine = {x["id"]: x for x in c.get("/api/support", headers=HU).json()}
        check("el usuario ve la respuesta", mine[tid]["messages"][-1]["author"] == "admin" and len(mine[tid]["messages"]) == 2)

        # El usuario contesta → vuelve a abierta
        SENT.clear()
        r = c.post(f"/api/support/{tid}/messages", headers=HU, json={"body": "Ya funciona, gracias"})
        check("respuesta del usuario → open", r.status_code == 201 and r.json()["status"] == "open" and len(r.json()["messages"]) == 3)
        check("aviso al admin de la respuesta", SENT and SENT[0]["to"] == "admin@test.local")

        # Aislamiento entre usuarios
        check("otro usuario no ve consultas ajenas", c.get("/api/support", headers=HV).json() == [])
        check("otro usuario no puede responder (404)", c.post(f"/api/support/{tid}/messages", headers=HV, json={"body": "hola"}).status_code == 404)
        check("no-admin no ve el soporte del panel", c.get("/api/admin/support", headers=HU).status_code == 403)

        # Cerrar y reabrir
        check("cerrar", c.post(f"/api/admin/support/{tid}/close", headers=HA).json()["status"] == "closed")
        check("reabrir", c.post(f"/api/admin/support/{tid}/reopen", headers=HA).json()["status"] == "open")
        check("consulta inexistente → 404", c.post("/api/admin/support/nope/close", headers=HA).status_code == 404)

        # Demo: solo lectura
        HD = {"Authorization": f"Bearer {c.post('/api/auth/demo').json()['token']}"}
        check("la demo no puede escribir a soporte (403)", c.post("/api/support", headers=HD, json={"subject": "Hola", "body": "texto largo"}).status_code == 403)

        # La baja borra consultas y mensajes
        r = c.request("DELETE", "/api/auth/me", headers=HU, json={"confirm_email": "ana@test.local"})
        async with engine.connect() as conn:
            nt = await conn.scalar(select(func.count()).select_from(SupportTicket).where(SupportTicket.user_id == uid))
            nm = await conn.scalar(select(func.count()).select_from(SupportMessage))
        check("baja: 0 consultas y 0 mensajes", r.status_code == 204 and nt == 0 and nm == 0, f"{nt}/{nm}")

    print("\n" + ("TODO OK" if fails == 0 else f"{fails} FALLARON"))
    sys.exit(1 if fails else 0)

import anyio
anyio.run(main)
