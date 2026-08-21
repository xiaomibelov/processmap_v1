"""sessions: process_layer + derived_from_session_id (W4)

Revision ID: 010
Revises: 009
Create Date: 2026-07-30

Тип сессии процесса: as_is (по умолчанию) | to_be; связь TO BE → AS IS.
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # F1 (инцидент 04.08, docs/deploy/STAGE_DEGRADED_START_ROOT_VERDICT.md):
    # рантайм _ensure_schema добавляет эти колонки вне alembic → миграция
    # обязана быть идемпотентной, иначе stamped-down база умирает на upgrade
    # и entrypoint уходит в хронический degraded-старт.
    conn = op.get_bind()
    cols = {
        str(row[0])
        for row in conn.exec_driver_sql(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions'"
        ).fetchall()
    }
    if "process_layer" not in cols:
        op.add_column(
            "sessions",
            sa.Column("process_layer", sa.String(20), nullable=False, server_default="as_is"),
        )
    if "derived_from_session_id" not in cols:
        op.add_column(
            "sessions",
            sa.Column("derived_from_session_id", sa.String(64), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("sessions", "derived_from_session_id")
    op.drop_column("sessions", "process_layer")
