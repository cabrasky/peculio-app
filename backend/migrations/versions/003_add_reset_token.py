"""Add reset_token/reset_token_expires to users and smtp_config table

Revision ID: 003_add_reset_token
Revises:
Create Date: 2026-07-28 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "003_add_reset_token"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # User reset token fields
    op.add_column("users", sa.Column("reset_token", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("reset_token_expires", sa.DateTime(), nullable=True))
    op.create_index("ix_users_reset_token", "users", ["reset_token"])

    # SMTP config table
    op.create_table(
        "smtp_config",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("host", sa.String(255), nullable=True, server_default="mail.cabrasky.net"),
        sa.Column("port", sa.Integer(), nullable=True, server_default="587"),
        sa.Column("user", sa.String(255), nullable=True, server_default=""),
        sa.Column("password", sa.String(255), nullable=True, server_default=""),
        sa.Column("from_email", sa.String(255), nullable=True, server_default=""),
        sa.Column("from_name", sa.String(255), nullable=True, server_default="Gastos App"),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("smtp_config")
    op.drop_index("ix_users_reset_token", table_name="users")
    op.drop_column("users", "reset_token_expires")
    op.drop_column("users", "reset_token")
