"""SQLAlchemy models for gastos-app."""
import enum
import uuid
from datetime import date, datetime
from typing import Optional
from sqlalchemy import String, Float, Date, DateTime, Boolean, Integer, Text, LargeBinary, ForeignKey, Enum as SAEnum, false
from sqlalchemy.orm import Mapped, mapped_column
from app.config import settings
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class BillingCycle(str, enum.Enum):
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    yearly = "yearly"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    google_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=True, default=None)
    avatar_url: Mapped[str] = mapped_column(String(512), default="")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_developer: Mapped[bool] = mapped_column(Boolean, default=False)
    code: Mapped[str] = mapped_column(String(16), unique=True, default=gen_uuid)
    reset_token: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, default=None, index=True)
    reset_token_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Preferencias de cuenta (compartidas entre web y app)
    locale: Mapped[str] = mapped_column(String(8), default="", server_default="")  # "" = aún sin elegir
    theme: Mapped[str] = mapped_column(String(10), default="system", server_default="system")
    weekly_goal: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    setup_done: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    mobile_tour_done: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Suspensión por un admin (None = activa): no puede entrar ni usar la API
    suspended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)

    @property
    def is_demo(self) -> bool:
        """Cuenta demo compartida (ver app/services/demo.py)."""
        return (self.email or "").lower() == settings.demo_email.strip().lower()


class OAuthConfig(Base):
    __tablename__ = "oauth_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    client_id: Mapped[str] = mapped_column(String(500), default="")
    client_secret: Mapped[str] = mapped_column(String(500), default="")
    redirect_uri: Mapped[str] = mapped_column(String(500), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SmtpConfig(Base):
    __tablename__ = "smtp_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    host: Mapped[str] = mapped_column(String(255), default="mail.cabrasky.net")
    port: Mapped[int] = mapped_column(default=587)
    user: Mapped[str] = mapped_column(String(255), default="")
    password: Mapped[str] = mapped_column(String(255), default="")
    from_email: Mapped[str] = mapped_column(String(255), default="")
    from_name: Mapped[str] = mapped_column(String(255), default="Peculio")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    purpose: Mapped[str] = mapped_column(String(64), default="")
    motive: Mapped[str] = mapped_column(String(64), default="")
    type: Mapped[str] = mapped_column(String(32), default="")
    method: Mapped[str] = mapped_column(String(32), default="")
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    is_invitation: Mapped[bool] = mapped_column(Boolean, default=False)
    debtors: Mapped[str] = mapped_column(Text, default="")
    participants: Mapped[str] = mapped_column(Text, default="")
    cc_reference: Mapped[str] = mapped_column(Text, default="")
    repayment_method: Mapped[str] = mapped_column(String(32), default="")
    repaid: Mapped[bool] = mapped_column(Boolean, default=False)
    personal_share: Mapped[float] = mapped_column(Float, default=0.0)
    trip: Mapped[str] = mapped_column(String(128), default="")
    project_id: Mapped[str] = mapped_column(String(36), default="")
    photo_type: Mapped[str] = mapped_column(String(16), default="")  # jpeg/png/webp si hay foto
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    @property
    def has_photo(self) -> bool:
        """La columna photo_type indica si hay foto (los bytes viven en expense_photos)."""
        return bool(self.photo_type)


class ExpensePhoto(Base):
    """Bytes de la foto del ticket de un gasto (en claro, cifrado pendiente)."""

    __tablename__ = "expense_photos"

    expense_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("expenses.id", ondelete="CASCADE"), primary_key=True
    )
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    content_type: Mapped[str] = mapped_column(String(16), default="")


class Income(Base):
    __tablename__ = "incomes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str] = mapped_column(String(64), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_amount: Mapped[float] = mapped_column(Float, nullable=False)
    current_amount: Mapped[float] = mapped_column(Float, default=0.0)
    deadline: Mapped[date] = mapped_column(Date, nullable=True)
    category: Mapped[str] = mapped_column(String(64), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    billing_cycle: Mapped[BillingCycle] = mapped_column(SAEnum(BillingCycle), nullable=False)
    next_billing: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String(64), default="")
    method: Mapped[str] = mapped_column(String(32), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Se apunta sola como gasto al llegar next_billing (services/recurring.py)
    auto_charge: Mapped[bool] = mapped_column(Boolean, default=False)
    # Fecha del último cobro apuntado solo: ese mismo cobro no se repite aunque next_billing retroceda
    last_charged: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Project(Base):
    """Proyecto (p. ej. montaje del NAS) al que se pueden enlazar gastos."""

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Presupuesto del proyecto; nulo = sin presupuesto
    budget: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Category(Base):
    """Categorías propias del usuario (gastos/ingresos); arrancan con las por defecto."""

    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # 'expense' | 'income'
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(9), default="#0d9488")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ApiKey(Base):
    """Clave de API para acceso programático a los datos del usuario.

    La clave completa se genera una sola vez y se devuelve al crearla; en BD
    solo se guarda el hash SHA-256 (irrecuperable por diseño).
    """

    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), default="")
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    prefix: Mapped[str] = mapped_column(String(12), default="")  # 'mb_live_…' para mostrar
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)


class SupportTicket(Base):
    """Consulta de soporte de un usuario: hilo de mensajes con el admin.

    status: open (espera al admin) · answered (espera al usuario) · closed.
    """

    __tablename__ = "support_tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(20), default="question")  # problem | question | suggestion
    status: Mapped[str] = mapped_column(String(12), default="open", index=True)
    platform: Mapped[str] = mapped_column(String(12), default="web")  # web | android
    app_version: Mapped[str] = mapped_column(String(32), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    ticket_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author: Mapped[str] = mapped_column(String(8), nullable=False)  # user | admin
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ServerError(Base):
    """Errores 5xx recientes para el panel de admin (se guardan 30 días).

    En BD y no en memoria: en producción hay varias réplicas del backend.
    Solo metadatos (ruta sin query, tipo y primera línea del mensaje).
    """

    __tablename__ = "server_errors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    method: Mapped[str] = mapped_column(String(8), default="")
    path: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[int] = mapped_column(Integer, default=500)
    request_id: Mapped[str] = mapped_column(String(64), default="")
    error_type: Mapped[str] = mapped_column(String(80), default="")
    message: Mapped[str] = mapped_column(String(300), default="")


class ApkBuild(Base):
    """Una build del APK en el repositorio de versiones.

    El fichero vive en APK_DIR (`file` es la ruta relativa, p. ej.
    builds/peculio-1.2.0-b43-abc1234.apk); aquí van sus datos, las notas y
    cuántas veces se ha descargado. Qué build se sirve está en AppSetting.
    """

    __tablename__ = "apk_builds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    file: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    version: Mapped[str] = mapped_column(String(32), default="")
    version_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    build_number: Mapped[str] = mapped_column(String(32), default="")
    commit: Mapped[str] = mapped_column(String(40), default="")
    source: Mapped[str] = mapped_column(String(10), default="ci")  # ci | upload | legacy
    size: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), default="")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    uploaded_by: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    downloads: Mapped[int] = mapped_column(Integer, default=0)


class AppSetting(Base):
    """Ajustes globales de la app (clave → valor), p. ej. qué build del APK se sirve."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
