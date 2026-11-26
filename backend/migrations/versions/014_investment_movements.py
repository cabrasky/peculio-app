"""Separate investment movements from expense/income entries.

Revision ID: 014_investment_movements
Revises: 013_sync_client_ids
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "014_investment_movements"
down_revision: Union[str, None] = "013_sync_client_ids"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "investment_movements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("asset", sa.String(128), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("fee", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cost_basis", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_investment_movements_user_id", "investment_movements", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_investment_movements_user_id", table_name="investment_movements")
    op.drop_table("investment_movements")
