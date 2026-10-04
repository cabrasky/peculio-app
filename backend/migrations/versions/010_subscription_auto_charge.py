"""Suscripciones que se apuntan solas (auto_charge) y fin de la regla fija del S&P500.

La inversión mensual era una regla del código (services/recurring.py) que cada día 2
insertaba un gasto de importe fijo. Pasa a ser una suscripción con auto_charge, que el
usuario edita como las demás: se crea aquí para quien ya tuviera gastos de esa regla.

Revision ID: 010_subscription_auto_charge
Revises: 009_admin_support
"""
import os
import uuid
from datetime import date, datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "010_subscription_auto_charge"
down_revision: Union[str, None] = "009_admin_support"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Valores de la regla antigua (se podían cambiar por entorno)
RULE_DAY = int(os.getenv("RECURRING_DAY", "2"))
RULE_AMOUNT = float(os.getenv("RECURRING_AMOUNT", "450"))
RULE_PURPOSE = os.getenv("RECURRING_PURPOSE", "Ahorro/Inversion")
RULE_TYPE = os.getenv("RECURRING_TIPO", "Recurrente")
RULE_METHOD = os.getenv("RECURRING_METHOD", "Transferencia")
RULE_DESCRIPTION = os.getenv("RECURRING_DESCRIPTION", "Inversion S&P500")


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    # create_all / schema_sync pueden haberlo creado ya en el arranque: solo lo que falte
    columns = {c["name"] for c in insp.get_columns("subscriptions")}
    if "auto_charge" not in columns:
        op.add_column("subscriptions", sa.Column("auto_charge", sa.Boolean(), nullable=False, server_default=sa.false()))
    if "last_charged" not in columns:
        op.add_column("subscriptions", sa.Column("last_charged", sa.Date(), nullable=True))

    rows = bind.execute(
        sa.text(
            "SELECT user_id, MAX(date) FROM expenses "
            "WHERE description = :d AND type = :t AND purpose = :p GROUP BY user_id"
        ),
        {"d": RULE_DESCRIPTION, "t": RULE_TYPE, "p": RULE_PURPOSE},
    ).fetchall()
    for user_id, last in rows:
        exists = bind.execute(
            sa.text("SELECT 1 FROM subscriptions WHERE user_id = :u AND name = :n"),
            {"u": user_id, "n": RULE_DESCRIPTION},
        ).first()
        if exists:
            continue
        if isinstance(last, str):  # SQLite devuelve la fecha como texto
            last = date.fromisoformat(last[:10])
        year, month = (last.year + 1, 1) if last.month == 12 else (last.year, last.month + 1)
        bind.execute(
            sa.text(
                "INSERT INTO subscriptions (id, user_id, name, amount, billing_cycle, next_billing, "
                "category, method, notes, active, auto_charge, last_charged, created_at) "
                "VALUES (:id, :u, :n, :a, 'monthly', :nb, :c, :m, '', :t, :t, :last, :now)"
            ),
            {
                "id": str(uuid.uuid4()), "u": user_id, "n": RULE_DESCRIPTION, "a": RULE_AMOUNT,
                "nb": date(year, month, RULE_DAY), "c": RULE_PURPOSE, "m": RULE_METHOD,
                "t": True, "last": last, "now": datetime.utcnow(),
            },
        )


def downgrade() -> None:
    op.drop_column("subscriptions", "last_charged")
    op.drop_column("subscriptions", "auto_charge")
