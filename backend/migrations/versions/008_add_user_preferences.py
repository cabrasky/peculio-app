"""Add account preferences to users (language, theme, weekly goal, onboarding flags).

Revision ID: 008_add_user_preferences
Revises: 007_rename_expense_columns_to_english
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "008_add_user_preferences"
down_revision: Union[str, None] = "007_rename_expense_columns_to_english"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


COLUMNS = (
    sa.Column("locale", sa.String(8), nullable=False, server_default=""),
    sa.Column("theme", sa.String(10), nullable=False, server_default="system"),
    sa.Column("weekly_goal", sa.Float(), nullable=True),
    sa.Column("setup_done", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("mobile_tour_done", sa.Boolean(), nullable=False, server_default=sa.false()),
)


def upgrade() -> None:
    # schema_sync puede haber añadido ya alguna columna en el arranque: solo las que falten
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}
    for column in COLUMNS:
        if column.name not in existing:
            op.add_column("users", column)


def downgrade() -> None:
    for column in ("mobile_tour_done", "setup_done", "weekly_goal", "theme", "locale"):
        op.drop_column("users", column)
