"""Rename expense columns to English.

Revision ID: 007_rename_expense_columns_to_english
Revises: 006_add_expense_photos
"""
from typing import Sequence, Union

from alembic import op


revision: str = "007_rename_expense_columns_to_english"
down_revision: Union[str, None] = "006_add_expense_photos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


RENAMES = (
    ("tipo", "type"),
    ("ajeno", "is_shared"),
    ("invitacion", "is_invitation"),
    ("deudores", "debtors"),
    ("personas", "participants"),
    ("ref_cc", "cc_reference"),
    ("deuda_metodo", "repayment_method"),
    ("devuelto", "repaid"),
    ("me_corresponde", "personal_share"),
    ("viaje", "trip"),
)


def upgrade() -> None:
    for old_name, new_name in RENAMES:
        op.alter_column("expenses", old_name, new_column_name=new_name)


def downgrade() -> None:
    for old_name, new_name in reversed(RENAMES):
        op.alter_column("expenses", new_name, new_column_name=old_name)
