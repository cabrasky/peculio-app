"""Admin panel: suspensión de cuentas, consultas de soporte y errores del servidor.

Revision ID: 009_admin_support
Revises: 008_add_user_preferences
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "009_admin_support"
down_revision: Union[str, None] = "008_add_user_preferences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # create_all / schema_sync pueden haberlo creado ya en el arranque: solo lo que falte
    insp = sa.inspect(op.get_bind())
    if "suspended_at" not in {c["name"] for c in insp.get_columns("users")}:
        op.add_column("users", sa.Column("suspended_at", sa.DateTime(), nullable=True))

    tables = set(insp.get_table_names())
    if "support_tickets" not in tables:
        op.create_table(
            "support_tickets",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), nullable=False, index=True),
            sa.Column("subject", sa.String(120), nullable=False),
            sa.Column("category", sa.String(20), nullable=False, server_default="question"),
            sa.Column("status", sa.String(12), nullable=False, server_default="open", index=True),
            sa.Column("platform", sa.String(12), nullable=False, server_default="web"),
            sa.Column("app_version", sa.String(32), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
    if "support_messages" not in tables:
        op.create_table(
            "support_messages",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("ticket_id", sa.String(36), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("author", sa.String(8), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
    if "server_errors" not in tables:
        op.create_table(
            "server_errors",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, index=True),
            sa.Column("method", sa.String(8), nullable=False, server_default=""),
            sa.Column("path", sa.String(255), nullable=False, server_default=""),
            sa.Column("status", sa.Integer(), nullable=False, server_default="500"),
            sa.Column("request_id", sa.String(64), nullable=False, server_default=""),
            sa.Column("error_type", sa.String(80), nullable=False, server_default=""),
            sa.Column("message", sa.String(300), nullable=False, server_default=""),
        )


def downgrade() -> None:
    op.drop_table("server_errors")
    op.drop_table("support_messages")
    op.drop_table("support_tickets")
    op.drop_column("users", "suspended_at")
