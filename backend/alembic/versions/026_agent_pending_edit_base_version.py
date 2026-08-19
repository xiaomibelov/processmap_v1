"""026 — add base_diagram_state_version to agent_pending_edits.

Revision ID: 026
Revises: 025
Create Date: 2026-08-19

Храним версию схемы на момент предложения правки, чтобы при resume
обнаруживать ручные изменения между предложением и подтверждением.
"""
from alembic import op


revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE agent_pending_edits
        ADD COLUMN IF NOT EXISTS base_diagram_state_version INTEGER NOT NULL DEFAULT 0
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE agent_pending_edits
        DROP COLUMN IF EXISTS base_diagram_state_version
        """
    )
