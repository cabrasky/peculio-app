"""Pydantic schemas for API request/response validation."""
import datetime as _dt
from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)
    name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: str = ""
    is_admin: bool = False
    is_developer: bool = False
    # Preferencias de cuenta
    locale: str = ""
    theme: str = "system"
    weekly_goal: Optional[float] = None
    weekly_excluded: Optional[list[str]] = None
    setup_done: bool = False
    mobile_tour_done: bool = False
    is_demo: bool = False

    model_config = {"from_attributes": True}


class PreferencesUpdate(BaseModel):
    """Actualización parcial de las preferencias de la cuenta."""
    locale: Optional[Literal["es", "en", "pt"]] = None
    theme: Optional[Literal["system", "light", "dark"]] = None
    weekly_goal: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    # Lista completa de categorías apartadas del objetivo semanal ([] = ninguna)
    weekly_excluded: Optional[list[str]] = Field(default=None, max_length=64)
    setup_done: Optional[bool] = None
    mobile_tour_done: Optional[bool] = None


class AccountDeleteRequest(BaseModel):
    """Baja de la cuenta: hay que escribir el propio email para confirmar."""
    confirm_email: str


class SupportCreate(BaseModel):
    """Nueva consulta de soporte (web o app)."""
    subject: str = Field(min_length=3, max_length=120)
    category: Literal["problem", "question", "suggestion"] = "question"
    body: str = Field(min_length=5, max_length=4000)
    platform: Literal["web", "android"] = "web"
    app_version: str = Field(default="", max_length=32)


class SupportReply(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ApkUploadInit(BaseModel):
    """Empezar a subir un APK desde el panel (luego van los trozos)."""
    filename: str = Field(default="", max_length=255)
    size: int = Field(gt=0)
    version: str = Field(min_length=1, max_length=32, pattern=r"^\d+(\.\d+){0,3}([-+][0-9A-Za-z.]+)?$")
    version_code: Optional[int] = Field(default=None, ge=1, le=2_100_000_000)
    notes: str = Field(default="", max_length=1000)


class ApkUploadComplete(BaseModel):
    serve: bool = False


class ApkBuildUpdate(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=1000)
    version_code: Optional[int] = Field(default=None, ge=1, le=2_100_000_000)


class AdminSetRole(BaseModel):
    is_admin: bool


class UserUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    current_password: str = ""
    new_password: str = Field(min_length=6)


class GoogleAuthRequest(BaseModel):
    code: str
    redirect_uri: str = ""


# ── Password Recovery ─────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=6)


class MessageResponse(BaseModel):
    message: str


# ── Admin / OAuth ─────────────────────────────────────────────────────────────

class OAuthConfigOut(BaseModel):
    provider: str
    client_id: str
    redirect_uri: str
    enabled: bool

    model_config = {"from_attributes": True}


class OAuthConfigUpdate(BaseModel):
    provider: str = "google"
    client_id: str = ""
    client_secret: str = ""
    redirect_uri: str = ""
    enabled: bool = False


# ── SMTP Config ───────────────────────────────────────────────────────────────

class SmtpConfigOut(BaseModel):
    host: str
    port: int
    user: str
    from_email: str
    from_name: str
    password_set: bool = False

    model_config = {"from_attributes": True}


class SmtpConfigUpdate(BaseModel):
    host: str = "mail.cabrasky.net"
    port: int = 587
    user: str = ""
    password: str = ""
    from_email: str = ""
    from_name: str = "Peculio"


class SmtpTestRequest(SmtpConfigUpdate):
    """Configuración del formulario (aún sin guardar). Sin contraseña se usa la guardada."""
    send: bool = False  # además de conectar, enviar el correo de prueba
    to: str = ""        # destinatario de la prueba (por defecto, el admin)


# ── Expenses ──────────────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    date: _dt.date
    description: str
    amount: float = Field(gt=0)
    purpose: str = ""
    motive: str = ""
    type: str = ""
    method: str = ""
    is_shared: bool = False
    is_invitation: bool = False
    debtors: str = ""
    participants: str = ""
    cc_reference: str = ""
    repayment_method: str = ""
    repaid: bool = False
    personal_share: float = Field(default=0.0, ge=0)
    trip: str = ""
    project_id: str = ""


class ExpenseUpdate(BaseModel):
    date: Optional[_dt.date] = None
    description: Optional[str] = None
    amount: Optional[float] = Field(default=None, gt=0)
    purpose: Optional[str] = None
    motive: Optional[str] = None
    type: Optional[str] = None
    method: Optional[str] = None
    is_shared: Optional[bool] = None
    is_invitation: Optional[bool] = None
    debtors: Optional[str] = None
    participants: Optional[str] = None
    cc_reference: Optional[str] = None
    repayment_method: Optional[str] = None
    repaid: Optional[bool] = None
    personal_share: Optional[float] = Field(default=None, ge=0)
    trip: Optional[str] = None
    project_id: Optional[str] = None


class ExpenseOut(BaseModel):
    id: str
    user_id: str
    date: _dt.date
    description: str
    amount: float
    purpose: str
    motive: str
    type: str
    method: str
    is_shared: bool
    is_invitation: bool
    debtors: str
    participants: str | None = None
    cc_reference: str | None = None
    repayment_method: str
    repaid: bool
    personal_share: float
    trip: str
    project_id: str
    has_photo: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Incomes ───────────────────────────────────────────────────────────────────

class IncomeCreate(BaseModel):
    date: _dt.date
    description: str
    amount: float = Field(gt=0)
    category: str = ""
    notes: str = ""


class IncomeUpdate(BaseModel):
    date: Optional[_dt.date] = None
    description: Optional[str] = None
    amount: Optional[float] = Field(default=None, gt=0)
    category: Optional[str] = None
    notes: Optional[str] = None


class IncomeOut(BaseModel):
    id: str
    user_id: str
    date: _dt.date
    description: str
    amount: float
    category: str
    notes: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Goals ─────────────────────────────────────────────────────────────────────

class GoalCreate(BaseModel):
    name: str
    target_amount: float = Field(gt=0)
    current_amount: float = 0.0
    deadline: Optional[_dt.date] = None
    category: str = ""
    notes: str = ""


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = Field(default=None, gt=0)
    current_amount: Optional[float] = Field(default=None, ge=0)
    deadline: Optional[_dt.date] = None
    category: Optional[str] = None
    notes: Optional[str] = None


class GoalOut(BaseModel):
    id: str
    user_id: str
    name: str
    target_amount: float
    current_amount: float
    deadline: Optional[_dt.date]
    category: str
    notes: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Subscriptions ─────────────────────────────────────────────────────────────

class SubscriptionCreate(BaseModel):
    name: str
    amount: float = Field(gt=0)
    billing_cycle: str = "monthly"  # weekly, monthly, quarterly, yearly
    next_billing: _dt.date
    category: str = ""
    method: str = ""
    notes: str = ""
    active: bool = True
    auto_charge: bool = False


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = Field(default=None, gt=0)
    billing_cycle: Optional[str] = None
    next_billing: Optional[_dt.date] = None
    category: Optional[str] = None
    method: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None
    auto_charge: Optional[bool] = None


class SubscriptionOut(BaseModel):
    id: str
    user_id: str
    name: str
    amount: float
    billing_cycle: str
    next_billing: _dt.date
    category: str
    method: str
    notes: str
    active: bool
    auto_charge: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Projects ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    budget: Optional[float] = Field(default=None, ge=0)


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    # Enviar null (o 0) quita el presupuesto; no enviarlo lo deja como está
    budget: Optional[float] = Field(default=None, ge=0)


class CategoryBase(BaseModel):
    kind: str = "expense"
    name: str = ""
    color: str = ""


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class CategoryOut(BaseModel):
    id: str
    kind: str
    name: str
    color: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectOut(BaseModel):
    id: str
    user_id: str
    name: str
    budget: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── API Keys / Developer ──────────────────────────────────────────────────────

class ApiKeyCreate(BaseModel):
    name: str = ""


class ApiKeyCreatedOut(BaseModel):
    id: str
    name: str
    prefix: str
    key: str  # clave completa — solo se devuelve UNA vez, en la creación
    created_at: datetime


class ApiKeyOut(BaseModel):
    id: str
    name: str
    prefix: str
    created_at: datetime
    last_used_at: Optional[datetime] = None
    revoked: bool = False


class DeveloperToggleOut(BaseModel):
    is_developer: bool
