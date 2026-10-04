"""Prueba E2E de los cobros automáticos: una suscripción con auto_charge se apunta sola como gasto.

Uso:  python tests/test_recurring_e2e.py     (desde backend/, o desde cualquier parte)
      (necesita: uv pip install -r requirements.txt aiosqlite httpx)
"""
import os, sys, tempfile
from datetime import date, timedelta

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

WORK = tempfile.mkdtemp(prefix="mbtest_recurring_")
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
from app.services.recurring import next_billing_after

async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from starlette.testclient import TestClient
    fails = 0
    def check(name, cond, extra=""):
        nonlocal fails
        if not cond: fails += 1
        print(("PASS " if cond else "FAIL ") + name + (f" — {extra}" if extra else ""))

    # 0. fechas: fin de mes y cambio de año
    check("mensual 31 ene → 28 feb", next_billing_after(date(2026, 1, 31), "monthly") == date(2026, 2, 28))
    check("mensual dic → ene del año siguiente", next_billing_after(date(2026, 12, 2), "monthly") == date(2027, 1, 2))
    check("trimestral", next_billing_after(date(2026, 11, 15), "quarterly") == date(2027, 2, 15))
    check("anual 29 feb → 28 feb", next_billing_after(date(2028, 2, 29), "yearly") == date(2029, 2, 28))
    check("semanal", next_billing_after(date(2026, 10, 2), "weekly") == date(2026, 10, 9))

    today = date.today()
    with TestClient(app) as c:
        r = c.post("/api/auth/register", json={"email": "recurring@test.local", "password": "secret123", "name": "Tester"})
        check("register 200", r.status_code == 200, f"got {r.status_code}")
        H = {"Authorization": f"Bearer {r.json()['token']}"}

        def expenses():
            return c.get("/api/expenses", headers=H).json()

        # 1. una suscripción normal vencida no se apunta sola
        r = c.post("/api/subscriptions", headers=H, json={
            "name": "Netflix", "amount": 13.99, "billing_cycle": "monthly",
            "next_billing": (today - timedelta(days=3)).isoformat(), "category": "Ocio", "method": "Tarjeta"})
        check("crear suscripción manual 201", r.status_code == 201, f"got {r.status_code} {r.text[:120]}")
        check("auto_charge false por defecto", r.json().get("auto_charge") is False)
        check("la manual no genera gastos", expenses() == [])

        # 2. la automática se apunta al vencer y avanza la fecha
        due = today - timedelta(days=1)
        r = c.post("/api/subscriptions", headers=H, json={
            "name": "Inversion S&P500", "amount": 450, "billing_cycle": "monthly", "next_billing": due.isoformat(),
            "category": "Ahorro/Inversion", "method": "Transferencia", "auto_charge": True})
        check("crear suscripción automática 201", r.status_code == 201 and r.json().get("auto_charge") is True, r.text[:120])
        sub_id = r.json()["id"]
        rows = expenses()
        check("se crea un gasto", len(rows) == 1, f"{len(rows)} gastos")
        e = rows[0] if rows else {}
        check("con los datos de la suscripción", e.get("description") == "Inversion S&P500" and e.get("amount") == 450
              and e.get("purpose") == "Ahorro/Inversion" and e.get("type") == "Recurrente"
              and e.get("method") == "Transferencia" and e.get("date") == due.isoformat(), str(e)[:200])
        sub = c.get(f"/api/subscriptions/{sub_id}", headers=H).json()
        check("la fecha avanza un mes", sub["next_billing"] == next_billing_after(due, "monthly").isoformat(), sub["next_billing"])

        # 3. no se duplica al volver a pedir la lista…
        check("segunda petición: sigue habiendo uno", len(expenses()) == 1)
        # …ni al editar el importe del gasto generado (el fallo de la regla antigua)
        r = c.put(f"/api/expenses/{e.get('id')}", headers=H, json={"amount": 750})
        check("editar el gasto 200", r.status_code == 200, f"got {r.status_code} {r.text[:120]}")
        rows = expenses()
        check("tras editar el gasto no aparece otro", len(rows) == 1 and rows[0]["amount"] == 750, str([x["amount"] for x in rows]))
        # …ni al borrarlo
        c.delete(f"/api/expenses/{e.get('id')}", headers=H)
        check("tras borrar el gasto no vuelve a crearse", expenses() == [])

        # …ni si una app con datos viejos devuelve la fecha a la ya cobrada (envían la suscripción entera al editar)
        r = c.put(f"/api/subscriptions/{sub_id}", headers=H, json={"notes": "editada", "next_billing": due.isoformat()})
        check("fecha ya cobrada: no se repite el gasto", expenses() == [])
        sub = c.get(f"/api/subscriptions/{sub_id}", headers=H).json()
        check("y la fecha vuelve a avanzar", sub["next_billing"] == next_billing_after(due, "monthly").isoformat(), sub["next_billing"])

        # 4. el siguiente cobro usa el importe editado en la suscripción
        r = c.put(f"/api/subscriptions/{sub_id}", headers=H, json={"amount": 750, "next_billing": today.isoformat()})
        check("editar la suscripción 200", r.status_code == 200 and r.json()["amount"] == 750, r.text[:120])
        rows = expenses()
        check("cobro de hoy con el importe nuevo", len(rows) == 1 and rows[0]["amount"] == 750 and rows[0]["date"] == today.isoformat(),
              str([(x["date"], x["amount"]) for x in rows]))

        # 5. varios ciclos atrasados se ponen al día
        first = today - timedelta(days=21)
        r = c.post("/api/subscriptions", headers=H, json={
            "name": "Paga semanal", "amount": 5, "billing_cycle": "weekly", "next_billing": first.isoformat(),
            "auto_charge": True})
        weekly_id = r.json()["id"]
        weekly = [x for x in expenses() if x["description"] == "Paga semanal"]
        check("cuatro semanas atrasadas → cuatro gastos", sorted(x["date"] for x in weekly)
              == [(first + timedelta(days=7 * i)).isoformat() for i in range(4)], str([x["date"] for x in weekly]))
        check("sin categoría ni método usa los de por defecto", all(x["purpose"] == "Ocio" and x["method"] == "Tarjeta" for x in weekly))
        sub = c.get(f"/api/subscriptions/{weekly_id}", headers=H).json()
        check("la fecha queda en el futuro", sub["next_billing"] == (first + timedelta(days=28)).isoformat(), sub["next_billing"])

        # 6. una automática en pausa no se apunta
        c.put(f"/api/subscriptions/{weekly_id}", headers=H, json={"active": False, "next_billing": today.isoformat()})
        check("en pausa no genera gastos", len([x for x in expenses() if x["description"] == "Paga semanal"]) == 4)

    print("\nTODO OK" if not fails else f"\n{fails} FALLARON")
    return fails

if __name__ == "__main__":
    import asyncio
    sys.exit(1 if asyncio.run(main()) else 0)
