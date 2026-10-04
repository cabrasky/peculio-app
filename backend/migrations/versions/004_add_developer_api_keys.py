"""Add users.is_developer and api_keys table

Revision ID: 004_add_developer_api_keys
Revises: 003_add_reset_token
Create Date: 2026-09-17 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "004_add_developer_api_keys"
down_revision: Union[str, None] = "003_add_reset_token"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # users.is_developer — la tabla api_keys la crea create_all al arrancar
    op.add_column("users", sa.Column("is_developer", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("users", "is_developer")
