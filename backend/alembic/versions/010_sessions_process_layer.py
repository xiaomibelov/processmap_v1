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
    op.add_column(
        "sessions",
        sa.Column("process_layer", sa.String(20), nullable=False, server_default="as_is"),
    )
    op.add_column(
        "sessions",
        sa.Column("derived_from_session_id", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sessions", "derived_from_session_id")
    op.drop_column("sessions", "process_layer")
