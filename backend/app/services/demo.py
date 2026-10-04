"""Cuenta demo pública de solo lectura para probar la app sin registrarse.

`POST /auth/demo` entra con un usuario fijo cuyos datos (unos 6 meses de gastos,
ingresos, metas, suscripciones y proyectos) están definidos aquí, en el código.
Como cualquiera puede entrar:

* es de solo lectura: `demo_read_only` (middleware) rechaza con 403 cualquier
  POST/PUT/PATCH/DELETE hecho con su token;
* la única excepción son las preferencias (idioma, tema…), que se devuelven
  aplicadas a quien las cambia pero no se guardan en la cuenta;
* los datos se vuelven a sembrar una vez al día para que las fechas sigan siendo
  "este mes", "ayer"…

Se desactiva con `DEMO_ENABLED=false`.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import date, datetime, timedelta

from fastapi import Request
from fastapi.responses import JSONResponse
from jose import jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.models import (
    BillingCycle, Expense, Goal, Income, Project, Subscription, User,
)
from app.services.accounts import delete_user_data

DEMO_EMAIL = settings.demo_email.strip().lower()
DEMO_ENABLED = settings.demo_enabled
DEMO_READ_ONLY = "Not available in the demo account"

# Lo que la demo sí puede enviar: las preferencias (no se guardan) y las rutas
# públicas de auth, que no actúan sobre el usuario del token.
_ALLOWED_WRITES = {
    ("PUT", "/api/auth/me/preferences"),
    ("POST", "/api/auth/demo"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/forgot-password"),
    ("POST", "/api/auth/reset-password"),
}
_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

_seed_lock = asyncio.Lock()


def is_demo(user: User | None) -> bool:
    return bool(user) and (user.email or "").lower() == DEMO_EMAIL


def _token_is_demo(request: Request) -> bool:
    auth = request.headers.get("Authorization", "")
    if not auth[:7].lower() == "bearer ":
        return False
    try:
        payload = jwt.decode(auth[7:].strip(), settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except Exception:
        return False  # token inválido: ya lo rechazará el endpoint con 401
    return (payload.get("email") or "").lower() == DEMO_EMAIL


async def demo_read_only(request: Request, call_next):
    """Middleware: la cuenta demo es pública, así que no puede cambiar nada."""
    if (request.method in _WRITE_METHODS
            and (request.method, request.url.path.rstrip("/")) not in _ALLOWED_WRITES
            and _token_is_demo(request)):
        return JSONResponse(status_code=403, content={"detail": DEMO_READ_ONLY, "error_code": "demo_read_only"})
    return await call_next(request)


async def get_demo_user(db: AsyncSession) -> User:
    """Devuelve el usuario demo, creándolo o re-sembrando sus datos si son de otro día."""
    async with _seed_lock:
        user = (await db.execute(select(User).where(User.email == DEMO_EMAIL).with_for_update())).scalar_one_or_none()
        if user is None:
            user = User(email=DEMO_EMAIL, name="Demo", password_hash="", code=uuid.uuid4().hex[:16].upper())
            db.add(user)
            await db.flush()
            await reset_demo_data(db, user)
        else:
            newest = await db.scalar(select(func.max(Expense.date)).where(Expense.user_id == user.id))
            if newest != date.today():
                await reset_demo_data(db, user)
        user.last_login = datetime.utcnow()
        await db.flush()
        return user


async def reset_demo_data(db: AsyncSession, user: User) -> None:
    """Borra todo lo de la cuenta demo y vuelve a sembrar el conjunto de ejemplo."""
    from app.routers.categories import _ensure_defaults  # evita import circular (auth → demo → routers)

    uid = user.id
    await delete_user_data(db, uid)

    user.name = "Demo"
    user.avatar_url = ""
    user.is_admin = False
    user.is_developer = False
    # Sin preferencias propias: cada visitante conserva su idioma, tema y presupuesto
    user.locale = ""
    user.theme = ""
    user.weekly_goal = None
    user.setup_done = True          # entra directo al panel
    user.mobile_tour_done = False   # el móvil enseña el tutorial una vez (marca local)

    for row in _seed(date.today()):
        db.add(row(uid))
    for kind in ("expense", "income"):
        await _ensure_defaults(db, uid, kind)
    await db.flush()


# ── Datos de ejemplo ─────────────────────────────────────────────────────────

def _people(*people: tuple[str, float, str, bool]) -> str:
    return json.dumps([{"n": n, "m": m, "r": r, "repaid": repaid, "method": "Bizum" if repaid else ""}
                       for n, m, r, repaid in people])


def _seed(today: date):
    """Filas (como funciones que reciben el user_id) con fechas relativas a hoy."""
    ago = lambda n: today - timedelta(days=n)  # noqa: E731
    ahead = lambda n: today + timedelta(days=n)  # noqa: E731
    lisboa = str(uuid.uuid4())
    nas = str(uuid.uuid4())
    rows = []

    def expense(days, desc, amount, purpose, method="Tarjeta", motive="", type_="Puntual",
                people="", trip="", project="", invitation=False):
        mine = amount
        if people:
            debt = sum(p["m"] for p in json.loads(people) if p["r"] == "deb")
            mine = round(max(0.0, amount - debt), 2)
        rows.append(lambda uid, d=ago(days): Expense(
            user_id=uid, date=d, description=desc, amount=amount, purpose=purpose, motive=motive,
            type=type_, method=method, is_shared=bool(people), is_invitation=invitation,
            participants=people, personal_share=mine, trip=trip, project_id=project,
            repaid=bool(people) and all(p["repaid"] for p in json.loads(people) if p["r"] == "deb"),
            created_at=datetime.combine(d, datetime.min.time()) + timedelta(hours=12)))

    # Proyectos
    rows.append(lambda uid: Project(id=lisboa, user_id=uid, name="Escapada a Lisboa", created_at=datetime.combine(ago(40), datetime.min.time())))
    rows.append(lambda uid: Project(id=nas, user_id=uid, name="Montar el NAS", created_at=datetime.combine(ago(70), datetime.min.time())))

    # Gastos fijos de cada mes (6 meses)
    for m in range(6):
        base = m * 30
        expense(base + 2, "Alquiler piso", 650.0, "Estancia", "Transferencia", type_="Recurrente")
        expense(base + 4, "Luz y agua", round(58 + (m % 3) * 7.35, 2), "Estancia", "Deposito", type_="Recurrente")
        expense(base + 5, "Abono transporte", 20.0, "Transporte", type_="Recurrente")
        expense(base + 6, "Gimnasio", 34.9, "Deporte/Ejercicio", "Deposito", type_="Recurrente")
        expense(base + 3, "Spotify", 10.99, "Ocio", "Online", type_="Recurrente")
        expense(base + 9, "Mercadona", round(62 + (m * 13) % 40 + 0.45, 2), "Comida")
        expense(base + 19, "Mercadona", round(48 + (m * 7) % 30 + 0.8, 2), "Comida")
        expense(base + 13, "Café con compañeros", round(6.4 + m % 3, 2), "Bebida", motive="Trabajo")

    # Gastos puntuales recientes (mes actual y anterior)
    expense(0, "Menú del día", 12.5, "Comida", motive="Trabajo")
    expense(1, "Cañas con Ana y Luis", 18.6, "Bebida", "Bizum", motive="Salir",
            people=_people(("Ana", 6.2, "deb", False), ("Luis", 6.2, "deb", False)))
    expense(3, "Farmacia", 14.35, "Farmacia")
    expense(5, "Cena cumpleaños Marta", 96.0, "Ocio", motive="Evento",
            people=_people(("Marta", 32.0, "inv", False), ("Pablo", 32.0, "deb", True)))
    expense(7, "Entradas concierto", 64.0, "Ocio", "Online", motive="Salir",
            people=_people(("Laura", 32.0, "deb", False)))
    expense(8, "Zapatillas de running", 79.99, "Deporte/Ejercicio", motive="Caprichos")
    expense(11, "Libro de cocina", 24.9, "Productos", motive="Regalos")
    expense(12, "Taxi aeropuerto", 27.5, "Transporte", motive="Viajes")
    expense(16, "Brunch del domingo", 31.2, "Comida", motive="Salir", invitation=True)
    expense(22, "Crema solar y botiquín", 19.8, "Farmacia")
    expense(26, "Aportación fondo indexado", 150.0, "Ahorro/Inversion", "Transferencia", type_="Recurrente")
    expense(56, "Aportación fondo indexado", 150.0, "Ahorro/Inversion", "Transferencia", type_="Recurrente")

    # Viaje (proyecto) con gastos compartidos
    expense(34, "Vuelos Madrid–Lisboa", 186.0, "Transporte", "Tarjeta", "Viajes", "Viajes", trip="Lisboa",
            project=lisboa, people=_people(("Sara", 93.0, "deb", True)))
    expense(33, "Apartamento 3 noches", 240.0, "Estancia", "Tarjeta", "Viajes", "Viajes", trip="Lisboa",
            project=lisboa, people=_people(("Sara", 120.0, "deb", False)))
    expense(32, "Pastéis de Belém", 11.4, "Comida", "Efectivo", "Viajes", "Viajes", trip="Lisboa", project=lisboa)
    expense(31, "Tranvía 28 y metro", 16.8, "Transporte", "Tarjeta", "Viajes", "Viajes", trip="Lisboa", project=lisboa)
    expense(31, "Cena en Alfama", 58.0, "Comida", "Tarjeta", "Viajes", "Viajes", trip="Lisboa", project=lisboa)

    # Proyecto NAS
    expense(68, "Synology DS224+", 329.0, "Productos", "Online", project=nas)
    expense(66, "2 discos WD Red 4 TB", 196.0, "Productos", "Online", project=nas)
    expense(61, "SAI pequeño", 74.9, "Productos", "Online", project=nas)

    # Ingresos
    for m in range(6):
        rows.append(lambda uid, d=ago(m * 30 + 1): Income(user_id=uid, date=d, description="Nómina", amount=1680.0, category="Salario"))
    rows.append(lambda uid: Income(user_id=uid, date=ago(18), description="Web para una panadería", amount=420.0, category="Freelance"))
    rows.append(lambda uid: Income(user_id=uid, date=ago(75), description="Logo para un club de pádel", amount=180.0, category="Freelance"))
    rows.append(lambda uid: Income(user_id=uid, date=ago(40), description="Venta bici vieja", amount=150.0, category="Venta"))
    rows.append(lambda uid: Income(user_id=uid, date=ago(95), description="Dividendos", amount=23.4, category="Inversion"))

    # Metas
    rows.append(lambda uid: Goal(user_id=uid, name="Fondo de emergencia", target_amount=5000.0, current_amount=3150.0, category="Emergencia", notes="3 meses de gastos"))
    rows.append(lambda uid: Goal(user_id=uid, name="Viaje a Japón", target_amount=2500.0, current_amount=860.0, deadline=ahead(210), category="Viaje"))
    rows.append(lambda uid: Goal(user_id=uid, name="Portátil nuevo", target_amount=1200.0, current_amount=1200.0, category="Compra"))
    rows.append(lambda uid: Goal(user_id=uid, name="Curso de inglés", target_amount=450.0, current_amount=120.0, deadline=ahead(60), category="Educacion"))

    # Suscripciones
    subs = [
        ("Spotify", 10.99, BillingCycle.monthly, 27, "Ocio", "Online"),
        ("Gimnasio", 34.9, BillingCycle.monthly, 24, "Deporte/Ejercicio", "Deposito"),
        ("iCloud 200 GB", 2.99, BillingCycle.monthly, 2, "Productos", "Tarjeta"),
        ("Netflix", 13.99, BillingCycle.monthly, 9, "Ocio", "Tarjeta"),
        ("Seguro del móvil", 36.0, BillingCycle.quarterly, 41, "Productos", "Tarjeta"),
        ("Dominio web", 12.0, BillingCycle.yearly, 140, "Productos", "Online"),
    ]
    for name, amount, cycle, next_in, cat, method in subs:
        rows.append(lambda uid, name=name, amount=amount, cycle=cycle, next_in=next_in, cat=cat, method=method: Subscription(
            user_id=uid, name=name, amount=amount, billing_cycle=cycle, next_billing=ahead(next_in),
            category=cat, method=method, active=True))
    return rows
