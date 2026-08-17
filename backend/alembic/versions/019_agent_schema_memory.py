"""agent: долгосрочная память схемы для PROCESSMAN (AGENT-1).

Revision ID: 019
Revises: 018
Create Date: 2026-08-17

Контур docs/agent/AGENT1_PLAN.md (редакция 2).

Таблица agent_schema_memory хранит summary, facts и decisions по сессии,
предрасчитанные фоновым worker'ом. Идемпотентный стиль.
"""
from alembic import op


revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_schema_memory (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL DEFAULT 'org_default',
            session_id TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            facts_json TEXT NOT NULL DEFAULT '{}',
            decisions_json TEXT NOT NULL DEFAULT '{}',
            projection_digest TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            UNIQUE(org_id, session_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_agent_schema_memory_session
        ON agent_schema_memory(org_id, session_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_schema_memory")
