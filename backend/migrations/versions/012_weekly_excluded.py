"""Categorías apartadas del objetivo semanal (preferencia de cuenta).

Revision ID: 012_weekly_excluded
Revises: 011_project_budget
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "012_weekly_excluded"
down_revision: Union[str, None] = "011_project_budget"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # create_all / schema_sync pueden haberlo creado ya en el arranque: solo lo que falte
    insp = sa.inspect(op.get_bind())
    if "weekly_excluded" not in {c["name"] for c in insp.get_columns("users")}:
        op.add_column("users", sa.Column("weekly_excluded", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "weekly_excluded")
