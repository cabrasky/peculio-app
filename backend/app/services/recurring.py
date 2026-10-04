"""Gastos recurrentes automáticos (sin CronJob externo).

Una suscripción con «registrar automáticamente» (`auto_charge`) se apunta sola:
cuando llega su `next_billing` se crea el gasto con el importe que tenga en ese
momento y la fecha avanza un ciclo. Si han pasado varios ciclos sin que nadie
abra la app, se ponen todos al día.

Cuándo se comprueba (idempotente y a prueba de carreras entre réplicas):
  - al arrancar el backend (main.py, lifespan), para todos los usuarios
  - en cada GET /api/expenses (expenses.py), para el usuario que la pide

Que no se duplique depende solo de la suscripción, no del gasto: `next_billing`
avanza en la misma transacción que lo inserta y `last_charged` recuerda el último
cobro apuntado. Editar o borrar después el gasto generado no hace que vuelva a
crearse, y tampoco que un cliente con datos viejos devuelva `next_billing` a una
fecha ya cobrada (las apps envían la suscripción entera al editarla).

Concurrencia: con varias réplicas comprobando a la vez, se usa un advisory lock
transaccional de Postgres (pg_advisory_xact_lock): solo una inserta y las demás,
al releer las suscripciones dentro de su transacción tras esperar el lock, ven
la fecha ya avanzada y no hacen nada.
"""
import calendar
import uuid
from datetime import date, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import BillingCycle, Expense, Subscription

# Clave del advisory lock (constante arbitraria de la regla)
_LOCK_KEY = 882211001

# Tope de ciclos atrasados que se apuntan de una vez por suscripción
_MAX_CATCH_UP = 60

RECURRING_TYPE = "Recurrente"
DEFAULT_PURPOSE = "Ocio"
DEFAULT_METHOD = "Tarjeta"

_MONTHS = {BillingCycle.monthly: 1, BillingCycle.quarterly: 3, BillingCycle.yearly: 12}


def next_billing_after(d: date, cycle: BillingCycle | str) -> date:
    """Siguiente fecha de cobro; si el mes no tiene ese día, el último del mes."""
    cycle = BillingCycle(cycle)
    if cycle == BillingCycle.weekly:
        return d + timedelta(days=7)
    month = d.month - 1 + _MONTHS[cycle]
    year, month = d.year + month // 12, month % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


async def _charge_due(db: AsyncSession, user_id: str | None, today: date) -> int:
    """Dentro de la transacción actual: lock + releer + insertar y avanzar."""
    if db.get_bind().dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _LOCK_KEY})
    stmt = select(Subscription).where(
        Subscription.active.is_(True),
        Subscription.auto_charge.is_(True),
        Subscription.next_billing <= today,
    )
    if user_id is not None:
        stmt = stmt.where(Subscription.user_id == user_id)
    subs = (await db.execute(stmt.execution_options(populate_existing=True))).scalars().all()

    created = 0
    for sub in subs:
        for _ in range(_MAX_CATCH_UP):
            if sub.next_billing > today:
                break
            if sub.last_charged is not None and sub.next_billing <= sub.last_charged:
                sub.next_billing = next_billing_after(sub.next_billing, sub.billing_cycle)
                continue  # ya cobrado: solo se vuelve a avanzar la fecha
            db.add(Expense(
                id=str(uuid.uuid4()),
                user_id=sub.user_id,
                date=sub.next_billing,
                description=sub.name,
                amount=sub.amount,
                purpose=sub.category or DEFAULT_PURPOSE,
                motive="",
                type=RECURRING_TYPE,
                method=sub.method or DEFAULT_METHOD,
                is_shared=False,
                debtors="",
                repayment_method="",
                repaid=False,
                personal_share=sub.amount,
                trip="",
            ))
            print(f"[recurring] OK: {sub.next_billing.isoformat()} — {sub.name} {sub.amount:g} €")
            sub.last_charged = sub.next_billing
            sub.next_billing = next_billing_after(sub.next_billing, sub.billing_cycle)
            created += 1
    await db.flush()
    return created


async def ensure_recurring_expenses(db: AsyncSession, user_id: str | None = None, today: date | None = None) -> int:
    """Apunta los cobros automáticos vencidos (de `user_id`, o de todos si es None).

    Devuelve cuántos gastos ha creado.
    """
    today = today or date.today()
    if db.in_transaction():
        # Ya hay transacción abierta: la reutilizamos (el lock se libera al cerrarla).
        return await _charge_due(db, user_id, today)
    async with db.begin():
        return await _charge_due(db, user_id, today)
