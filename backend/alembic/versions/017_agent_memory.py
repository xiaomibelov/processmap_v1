"""agent: durable memory for PROCESSMAN chat.

Revision ID: 017
Revises: 016
Create Date: 2026-08-16

Контур feat/agent-0-processman-memory (docs/agent/AGENT0_PLAN.md).

Таблицы:
- agent_conversations: идентификатор диалога (session_id, user_id, org_id).
- agent_turns: реплики диалога с ролями, действиями, usage и client_turn_id
  для защиты от дабл-клика.

Idempotent стиль (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
"""
from alembic import op


revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_conversations (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL DEFAULT 'org_default',
            session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_agent_conversations_session_user
        ON agent_conversations(org_id, session_id, user_id)
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_turns (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
            client_turn_id TEXT,
            org_id TEXT NOT NULL DEFAULT 'org_default',
            session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
            content_json TEXT NOT NULL DEFAULT '{}',
            action TEXT,
            action_payload_json TEXT NOT NULL DEFAULT '{}',
            projection_digest TEXT,
            usage_json TEXT NOT NULL DEFAULT '{}',
            created_at BIGINT NOT NULL,
            UNIQUE(conversation_id, client_turn_id, role)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_agent_turns_conversation_created
        ON agent_turns(conversation_id, created_at)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_agent_turns_session_created
        ON agent_turns(org_id, session_id, created_at)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_turns")
    op.execute("DROP TABLE IF EXISTS agent_conversations")
