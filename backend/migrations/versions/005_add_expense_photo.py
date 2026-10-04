"""add expense photo_type

Revision ID: 005_add_expense_photo
Revises: 004_add_developer_api_keys
"""
from alembic import op
import sqlalchemy as sa

revision: str = "005_add_expense_photo"
down_revision: str = "004_add_developer_api_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("expenses", sa.Column("photo_type", sa.String(16), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("expenses", "photo_type")
