"""023 — RAG hybrid search schema (AGENT-2).

Revision ID: 023
Revises: 022
Create Date: 2026-08-18

Подготовка схемы для гибридного поиска BM25 + vector:
- rag_embeddings: добавляем dimensions, приводим model_id/default к 'local-e5-small'.
- rag_settings: флаги hybrid_enabled, vector_weight, bm25_weight, embedding_model_id.

Idempotent стиль (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
"""
from alembic import op


revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # rag_embeddings: vector_data уже BYTEA, model_id/created_at уже есть.
    op.execute(
        """
        ALTER TABLE rag_embeddings
            ADD COLUMN IF NOT EXISTS dimensions INTEGER,
            ALTER COLUMN model_id SET DEFAULT 'local-e5-small'
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rag_embed_chunk_model
        ON rag_embeddings(chunk_id, model_id)
        """
    )

    op.execute(
        """
        ALTER TABLE rag_settings
            ADD COLUMN IF NOT EXISTS hybrid_enabled INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS vector_weight REAL NOT NULL DEFAULT 0.5,
            ADD COLUMN IF NOT EXISTS bm25_weight REAL NOT NULL DEFAULT 0.5,
            ADD COLUMN IF NOT EXISTS embedding_model_id TEXT NOT NULL DEFAULT 'local-e5-small'
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_rag_embed_chunk_model")
    op.execute("ALTER TABLE rag_embeddings DROP COLUMN IF EXISTS dimensions")
    op.execute("ALTER TABLE rag_settings DROP COLUMN IF EXISTS hybrid_enabled")
    op.execute("ALTER TABLE rag_settings DROP COLUMN IF EXISTS vector_weight")
    op.execute("ALTER TABLE rag_settings DROP COLUMN IF EXISTS bm25_weight")
    op.execute("ALTER TABLE rag_settings DROP COLUMN IF EXISTS embedding_model_id")
