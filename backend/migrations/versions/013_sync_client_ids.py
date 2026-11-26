"""Idempotent client identifiers for expense and income writes.

Revision ID: 013_sync_client_ids
Revises: 012_weekly_excluded
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013_sync_client_ids"
down_revision: Union[str, None] = "012_weekly_excluded"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("expenses", "incomes"):
        inspector = sa.inspect(op.get_bind())
        if "client_id" not in {c["name"] for c in inspector.get_columns(table)}:
            op.add_column(table, sa.Column("client_id", sa.String(64), nullable=True))
        index_name = f"uq_{table}_user_client_id"
        if index_name not in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}:
            op.create_index(index_name, table, ["user_id", "client_id"], unique=True)


def downgrade() -> None:
    for table in ("incomes", "expenses"):
        op.drop_index(f"uq_{table}_user_client_id", table_name=table)
        op.drop_column(table, "client_id")
