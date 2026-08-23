"""027 — product-action suggestions + RAG-readiness state machine.

Revision ID: 027
Revises: 026
Create Date: 2026-08-23

Храним AI-предложения product-actions для вкладок анализа и флаг готовности
сессии к индексации RAG.
"""
from alembic import op


revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS session_product_action_suggestions (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'pending',
            source TEXT NOT NULL DEFAULT 'llm',
            original_llm_output TEXT NOT NULL DEFAULT '{}',
            action TEXT NOT NULL DEFAULT '{}',
            binding TEXT NOT NULL DEFAULT '{}',
            edited_by_user INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0,
            CONSTRAINT chk_session_product_action_suggestions_status
                CHECK (status IN ('pending', 'approved', 'rejected'))
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_session_product_action_suggestions_session_status
        ON session_product_action_suggestions(session_id, status)
        """
    )
    op.execute(
        """
        ALTER TABLE sessions
        ADD COLUMN IF NOT EXISTS rag_readiness_status TEXT NOT NULL DEFAULT 'not_ready'
        """
    )
    op.execute(
        """
        ALTER TABLE sessions
        ADD COLUMN IF NOT EXISTS rag_queued_at INTEGER
        """
    )
    op.execute(
        """
        ALTER TABLE sessions
        ADD COLUMN IF NOT EXISTS rag_indexed_at INTEGER
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE sessions
        DROP COLUMN IF EXISTS rag_readiness_status
        """
    )
    op.execute(
        """
        ALTER TABLE sessions
        DROP COLUMN IF EXISTS rag_queued_at
        """
    )
    op.execute(
        """
        ALTER TABLE sessions
        DROP COLUMN IF EXISTS rag_indexed_at
        """
    )
    op.execute("DROP INDEX IF EXISTS idx_session_product_action_suggestions_session_status")
    op.execute("DROP TABLE IF EXISTS session_product_action_suggestions")
