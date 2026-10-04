"""add expense_photos table (bytes de la foto en claro)

Revision ID: 006_add_expense_photos
Revises: 005_add_expense_photo
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006_add_expense_photos"
down_revision: Union[str, None] = "005_add_expense_photo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "expense_photos",
        sa.Column("expense_id", sa.String(36), sa.ForeignKey("expenses.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("content_type", sa.String(16), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_table("expense_photos")
