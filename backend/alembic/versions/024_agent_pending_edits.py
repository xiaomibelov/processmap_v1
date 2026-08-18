"""024 — agent_pending_edits table for AGENT-3 (canvas editing HITL).

Revision ID: 024
Revises: 023
Create Date: 2026-08-18

Таблица хранит предложенные агентом правки схемы, ожидающие подтверждения
человека (interrupt/state machine руками).

Idempotent стиль (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
"""
from alembic import op


revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_pending_edits (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL DEFAULT 'org_default',
            session_id TEXT NOT NULL,
            turn_id TEXT NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
            edit_plan_json TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'rejected', 'expired', 'conflict_rev')),
            expires_at BIGINT NOT NULL,
            created_at BIGINT NOT NULL,
            resumed_by_user_id TEXT,
            resumed_at BIGINT
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_agent_pending_edits_session_status
        ON agent_pending_edits(org_id, session_id, status)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_agent_pending_edits_turn
        ON agent_pending_edits(org_id, session_id, turn_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_pending_edits")
