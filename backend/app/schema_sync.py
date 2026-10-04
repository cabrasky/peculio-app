"""Defensive schema self-healing for the peculio backend.

The production database was created via ``Base.metadata.create_all`` at first
boot, which **creates missing tables but never adds missing columns** to
tables that already exist. When the photo feature added ``photo_type`` to the
``expenses`` model, prod had no matching DDL (the alembic migration was never
applied there), so every ``SELECT expenses.*`` failed with
``UndefinedColumnError`` and ``GET /expenses`` returned 500 — which took the
whole mobile data load with it.

This module closes that class of bug at startup:

* :func:`run_alembic_upgrade` — run the real ``alembic upgrade head`` (only
  when an ``alembic.ini`` is present alongside the backend package).
* :func:`sync_missing_columns` — inspect each mapped table and
  ``ALTER TABLE ADD COLUMN IF NOT EXISTS`` for anything present in the model
  but absent in the live DB. Also reconciles the legacy Spanish expense
  columns (``tipo``/``type``, ``ajeno``/``is_shared``, …) into their English
  replacements: rename in place when only the legacy column exists, or
  backfill + drop when both exist (drift from an earlier additive sync).
  Idempotent and safe to re-run on every boot.
"""

from __future__ import annotations

import logging
import os
import subprocess
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    DECIMAL,
    Float,
    Integer,
    Numeric,
    String,
)
from sqlalchemy import text as _text
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql.type_api import TypeEngine

logger = logging.getLogger(__name__)

LEGACY_EXPENSE_COLUMNS = {
    "tipo": "type",
    "ajeno": "is_shared",
    "invitacion": "is_invitation",
    "deudores": "debtors",
    "personas": "participants",
    "ref_cc": "cc_reference",
    "deuda_metodo": "repayment_method",
    "devuelto": "repaid",
    "me_corresponde": "personal_share",
    "viaje": "trip",
}


def _default_literal(t: TypeEngine) -> Optional[str]:
    """Reasonable literal to backfill a NOT NULL column when adding it via DDL.

    Postgres requires a DEFAULT when adding a NOT NULL column to a table that
    already has rows; without one the ALTER fails.
    """
    if isinstance(t, String):
        return "''"
    if isinstance(t, (Integer, Float, DECIMAL, Numeric)):
        return "0"
    if isinstance(t, Boolean):
        return "false"
    if isinstance(t, (Date, DateTime)):
        return "now()"
    return None


def run_alembic_upgrade(
    cwd: Optional[str] = None,
    timeout: int = 90,
    db_url: Optional[str] = None,
) -> bool:
    """Run ``alembic upgrade head`` if ``alembic.ini`` lives under ``cwd``.

    Args:
        cwd: Directory containing ``alembic.ini``. Defaults to the backend
            package root (one level above ``app/``).
        timeout: Subprocess timeout in seconds.
        db_url: Explicit ``postgresql(+asyncpg)://...`` URL. If not given the
            app's configured ``app.config.settings.database_url`` (or the
            ``DATABASE_URL`` env var) is used.

    Returns:
        ``True`` when the subprocess exited cleanly, ``False`` otherwise
        (including when ``alembic.ini`` isn't present).
    """
    cwd = cwd or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ini = os.path.join(cwd, "alembic.ini")
    if not os.path.isfile(ini):
        logger.debug("alembic: no alembic.ini at %s; skipping", ini)
        return False

    if not db_url:
        try:
            from app.config import settings
            db_url = settings.database_url or settings.db_url
        except Exception:
            db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        logger.debug("alembic: no DATABASE_URL configured; running with env defaults")

    env = dict(os.environ)
    if db_url:
        env["DATABASE_URL"] = db_url
        env.setdefault("DATABASE_URL_SYNC", db_url.replace("+asyncpg", ""))

    try:
        proc = subprocess.run(
            [os.environ.get("PYTHON", "python"), "-m", "alembic", "upgrade", "head"],
            cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout,
        )
        out = (proc.stdout or "").strip()
        err = (proc.stderr or "").strip()
        if out or err or proc.returncode:
            logger.warning("alembic upgrade: out=%s err=%s rc=%d", out, err, proc.returncode)
        return proc.returncode == 0
    except Exception:
        logger.exception("alembic upgrade subprocess failed")
        return False


async def sync_missing_columns(engine, base: type[DeclarativeBase]) -> int:
    """Add columns present in ``base.metadata`` but missing in the live DB.

    Works with an ``AsyncEngine`` (pass the app's ``engine`` directly).
    - Idempotent: adds missing columns, and reconciles legacy Spanish expense
      columns (rename in place, or backfill + drop when both old and new exist).
    - Any DDL failure is logged but does not raise, so a single bad table
      never blocks boot.

    Returns the number of columns added.
    """
    def _columns(sync_engine):
        from sqlalchemy import inspect as _sa_inspect
        return {c["name"] for c in _sa_inspect(sync_engine).get_columns("expenses")}

    async with engine.connect() as conn:
        live_expense_columns = await conn.run_sync(_columns)

    reconciled = 0
    for old_name, new_name in LEGACY_EXPENSE_COLUMNS.items():
        has_old = old_name in live_expense_columns
        has_new = new_name in live_expense_columns
        if not has_old:
            # Already reconciled on a previous boot (only the English column
            # remains); nothing to migrate.
            continue
        try:
            async with engine.begin() as conn:
                if not has_new:
                    # Only the legacy column exists → rename in place (keeps data).
                    await conn.execute(_text(
                        f'ALTER TABLE "expenses" RENAME COLUMN "{old_name}" TO "{new_name}"'
                    ))
                else:
                    # Both exist (drift from an earlier additive-only sync): copy
                    # the legacy values into the English column and drop the legacy
                    # one. The English column is what the model reads, and the
                    # legacy column still holds the original data for rows written
                    # before the rename.
                    await conn.execute(_text(
                        f'UPDATE "expenses" SET "{new_name}" = "{old_name}" '
                        f'WHERE "{old_name}" IS NOT NULL'
                    ))
                    await conn.execute(_text(
                        f'ALTER TABLE "expenses" DROP COLUMN "{old_name}"'
                    ))
            live_expense_columns.discard(old_name)
            live_expense_columns.add(new_name)
            reconciled += 1
        except Exception:
            logger.exception(
                "schema-sync: cannot reconcile expenses.%s -> %s", old_name, new_name,
            )

    if reconciled:
        logger.info("schema-sync: reconciled %d legacy expense column(s)", reconciled)

    def _introspect(sync_engine):
        """Single sync pass: return {table_name: [missing_col_objects]}."""
        from sqlalchemy import inspect as _sa_inspect
        insp = _sa_inspect(sync_engine)
        todo: dict = {}
        for table in base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue  # create_all handles new tables; only patch existing ones
            live = {c["name"] for c in insp.get_columns(table.name)}
            miss = [c for c in table.columns if c.name not in live]
            if miss:
                todo[table.name] = miss
        return todo

    # Introspect inside an async-safe sync bridge (avoids MissingGreenlet).
    async with engine.connect() as conn:
        todo = await conn.run_sync(_introspect)

    dialect = engine.sync_engine.dialect
    fixed = 0

    for table_name, missing in todo.items():
        for col in missing:
            try:
                ddl = col.type.compile(dialect)
            except Exception:
                logger.warning(
                    "schema-sync: cannot compile type for %s.%s; skipping",
                    table_name, col.name,
                )
                continue

            default_piece = ""
            try:
                svd = getattr(col, "server_default", None)
                if svd is not None and hasattr(svd, "arg"):
                    arg = svd.arg
                    if isinstance(arg, str) and not (arg.startswith('"') or arg.startswith("(")):
                        arg = "'" + arg.replace("'", "''") + "'"
                    default_piece = f" DEFAULT {arg}"
                elif not col.nullable:
                    lit = _default_literal(col.type)
                    if lit is not None:
                        default_piece = f" DEFAULT {lit}"
            except Exception:
                default_piece = ""

            stmt = _text(
                f'ALTER TABLE "{table_name}" '
                f'ADD COLUMN IF NOT EXISTS "{col.name}" {ddl}{default_piece}'
            )
            try:
                async with engine.begin() as conn:
                    await conn.execute(stmt)
            except Exception as e:
                logger.warning(
                    "schema-sync: ALTER on %s.%s failed: %s", table_name, col.name, e,
                )
                continue

            logger.warning(
                "schema-sync: added missing column %s.%s (%s%s)",
                table_name, col.name, ddl, default_piece,
            )
            fixed += 1

    if fixed:
        logger.info("schema-sync: added %d missing column(s) in total", fixed)
    return fixed
