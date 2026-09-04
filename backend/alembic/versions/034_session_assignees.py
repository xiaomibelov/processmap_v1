"""034 — session assignees (many-to-many).

Revision ID: 034
Revises: 033
Create Date: 2026-08-31

Contour feature/session-assignees:
- linking table session_assignees(session_id, user_id, assigned_by, assigned_at);
- indexes by session_id and user_id.

Идемпотентно (IF NOT EXISTS), без деструктива.
"""
from alembic import op
import sqlalchemy as sa


revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS session_assignees (
            session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            assigned_by TEXT NOT NULL,
            assigned_at INTEGER NOT NULL,
            PRIMARY KEY (session_id, user_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_session_assignees_session
        ON session_assignees(session_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_session_assignees_user
        ON session_assignees(user_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_session_assignees_user")
    op.execute("DROP INDEX IF EXISTS idx_session_assignees_session")
    op.execute("DROP TABLE IF EXISTS session_assignees")
