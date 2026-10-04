"""Presupuesto por proyecto.

Revision ID: 011_project_budget
Revises: 010_subscription_auto_charge
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "011_project_budget"
down_revision: Union[str, None] = "010_subscription_auto_charge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # create_all / schema_sync pueden haberlo creado ya en el arranque: solo lo que falte
    insp = sa.inspect(op.get_bind())
    if "budget" not in {c["name"] for c in insp.get_columns("projects")}:
        op.add_column("projects", sa.Column("budget", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "budget")
