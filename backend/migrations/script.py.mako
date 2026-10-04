"""Alembic script template."""
revision: str = "${message}"  # type: ignore
down_revision: str | None = "${down_revision}"  # type: ignore
branch_labels: str | None = "${branch_labels}"  # type: ignore
depends_on: str | None = "${depends_on}"  # type: ignore


from alembic import op
import sqlalchemy as sa
${imports if imports else ""}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
