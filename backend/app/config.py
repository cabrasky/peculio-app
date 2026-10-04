"""Application configuration via environment variables."""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    app_name: str = "peculio-app"
    debug: bool = False

    # Database
    db_host: str = "localhost"
    db_port: int = 5432
    db_user: str = "peculio_user"
    db_password: str = "peculio_password"
    db_name: str = "peculio"
    database_url: Optional[str] = None  # overrides individual fields if set

    @property
    def db_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"

    @property
    def db_url_sync(self) -> str:
        """Synchronous URL for Alembic (sync driver)."""
        return self.db_url.replace("+asyncpg", "")

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24h

    # URLs
    app_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:8121"

    # SMTP
    smtp_host: str = "mail.cabrasky.net"
    smtp_port: int = 587
    smtp_user: str = "peculio@cabrasky.net"
    smtp_password: str = ""
    smtp_from: str = "peculio@cabrasky.net"
    smtp_from_name: str = "Peculio"

    # Cuenta demo compartida (POST /auth/demo)
    demo_enabled: bool = True
    demo_email: str = "demo@peculio.app"

    # Repositorio de APKs de Android (carpeta compartida con nginx, que sirve /apk)
    apk_dir: str = "/data/apk"
    apk_chunk_bytes: int = 896 * 1024          # trozos de subida por debajo del límite del proxy
    apk_max_bytes: int = 200 * 1024 * 1024

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
