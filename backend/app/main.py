"""FastAPI application entry point."""
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.database import engine, Base, async_session_factory
from app.schema_sync import run_alembic_upgrade, sync_missing_columns
from app.models.models import User
from app.routers import auth, expenses, incomes, goals, subscriptions, projects, categories, excel, developer, admin, support, apk
from app.services.demo import demo_read_only
from app.services.errors import record_server_error

logger = logging.getLogger(__name__)


async def _run_startup_recurring() -> None:
    """Gastos recurrentes por lógica de aplicación: al arrancar se apuntan los
    cobros automáticos vencidos de todos los usuarios (services/recurring.py)."""
    try:
        async with async_session_factory() as session:
            from app.services.recurring import ensure_recurring_expenses

            await ensure_recurring_expenses(session)
    except Exception:  # no debe impedir que la API arranque
        logger.exception("recurring check at startup failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: asegurar esquema coherente con el modelo SQLAlchemy, en 3 pasos:
    #  1) `alembic upgrade head` si hay alembic.ini — el sistema formal de
    #     migraciones (avanza alembic_version y aplica las versiones pendientes).
    #  2) `Base.metadata.create_all` — idempotente; crea tablas NUEVAS cuya
    #     definición ya existe en el modelo.
    #  3) `sync_missing_columns` — añade columnas que estén en el modelo pero
    #     falten en tablas ya existentes. Causa raíz del 500 de /expenses:
    #     la columna photo_type estaba en el modelo y faltaba en la BD de
    #     prod (la migración alembic nunca se aplicó ahí).
    ok_alembic = run_alembic_upgrade()
    if not ok_alembic:
        logger.warning(
            "alembic sin alembic.ini o sin resultado: usando create_all + sync_missing_columns"
        )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        added = await sync_missing_columns(engine, Base)
        if added:
            logger.info("schema-sync: added %d missing column(s)", added)
    except Exception:
        logger.exception("schema-sync failed (continuing anyway)")

    await _run_startup_recurring()
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="1.1.0",
    lifespan=lifespan,
)

# Cuenta demo pública: solo lectura (se registra antes que el resto para que
# request-id y CORS también envuelvan su 403)
app.middleware("http")(demo_read_only)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request.state.request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", str(uuid.uuid4()))


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException):
    request_id = _request_id(request)
    if exc.status_code >= 500:
        await record_server_error(request, exc.status_code, exc)
    return JSONResponse(
        status_code=exc.status_code,
        headers=exc.headers,
        content={
            "detail": exc.detail,
            "error_code": f"http_{exc.status_code}",
            "request_id": request_id,
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    request_id = _request_id(request)
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Request validation failed",
            "error_code": "validation_error",
            "errors": jsonable_encoder(exc.errors()),
            "request_id": request_id,
        },
    )


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(request: Request, exc: SQLAlchemyError):
    request_id = _request_id(request)
    logger.exception("Database error request_id=%s path=%s", request_id, request.url.path)
    await record_server_error(request, 503, exc)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Database unavailable or schema is out of date. Run migrations and retry.",
            "error_code": "database_error",
            "request_id": request_id,
        },
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    request_id = _request_id(request)
    logger.exception("Unhandled API error request_id=%s path=%s", request_id, request.url.path)
    await record_server_error(request, 500, exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error. Contact support with the request ID.",
            "error_code": "internal_server_error",
            "request_id": request_id,
        },
    )

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, 'https://peculio.cabrasky.net', 'https://suelto.cabrasky.net'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/api")
app.include_router(expenses.router, prefix="/api")
app.include_router(incomes.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(subscriptions.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(excel.router, prefix="/api")
app.include_router(developer.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(support.router, prefix="/api")
app.include_router(apk.public, prefix="/api")
app.include_router(apk.admin_router, prefix="/api")


@app.get("/api/health")
async def health(request: Request):
    try:
        with open("/app/version.txt") as f:
            version = f.read().strip()
    except OSError:
        version = "dev"
    request_id = _request_id(request)
    try:
        async with engine.connect() as connection:
            await connection.execute(text("""
                SELECT id, date, description, amount, purpose, motive, type, method,
                       is_shared, is_invitation, debtors, participants, cc_reference,
                       repayment_method, repaid, personal_share, trip, project_id,
                       photo_type, created_at
                FROM expenses LIMIT 0
            """))
    except SQLAlchemyError:
        logger.exception("Health check detected an invalid expenses schema request_id=%s", request_id)
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "app": settings.app_name,
                "version": version,
                "detail": "Expenses database schema is not ready. Check migration 007.",
                "error_code": "database_schema_error",
                "request_id": request_id,
            },
        )
    return {"status": "ok", "app": settings.app_name, "version": version, "request_id": request_id}
