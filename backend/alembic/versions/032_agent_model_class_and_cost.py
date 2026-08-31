"""032 — model_class + cost-aware routing for LLM calls.

Revision ID: 032
Revises: 031
Create Date: 2026-08-31

Contour feature/agent-model-routing-optimization-v1:
- llm_models.model_class (cheap/primary) + cost per 1k tokens;
- llm_feature_models.model_class, unique on (org_id, feature, model_class);
- llm_usage.cost_usd;
- seed cheap default (deepseek-chat) and primary default (claude-opus-4-6).

Идемпотентно (IF NOT EXISTS / ON CONFLICT DO NOTHING), без деструктива.
"""
from alembic import op
import sqlalchemy as sa


revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return column in [c["name"] for c in insp.get_columns(table)]


def upgrade() -> None:
    # llm_models: model_class + pricing
    if not _has_column("llm_models", "model_class"):
        op.add_column("llm_models", sa.Column("model_class", sa.Text, nullable=False, server_default="primary"))
    if not _has_column("llm_models", "cost_prompt_1k_usd"):
        op.add_column("llm_models", sa.Column("cost_prompt_1k_usd", sa.Numeric(12, 6), nullable=False, server_default="0"))
    if not _has_column("llm_models", "cost_completion_1k_usd"):
        op.add_column("llm_models", sa.Column("cost_completion_1k_usd", sa.Numeric(12, 6), nullable=False, server_default="0"))

    # Existing seed from 016 becomes the cheap default.
    op.execute(
        """
        UPDATE llm_models
        SET model_class = 'cheap',
            cost_prompt_1k_usd = 0.0005,
            cost_completion_1k_usd = 0.002,
            is_default = false
        WHERE id = 'llmmodel_deepseek_chat'
        """
    )
    # Primary default.
    op.execute(
        """
        INSERT INTO llm_models
            (id, org_id, provider, model_name, display_name, enabled, is_default,
             model_class, cost_prompt_1k_usd, cost_completion_1k_usd,
             params, created_by, created_at, updated_by, updated_at)
        VALUES
            ('llmmodel_opus_4_6_primary', 'org_default', 'vvproxy', 'claude-opus-4-6',
             'Claude Opus 4.6', true, true,
             'primary', 0.015, 0.075,
             '{}', 'migration-032', EXTRACT(EPOCH FROM NOW())::BIGINT,
             'migration-032', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT (id) DO NOTHING
        """
    )

    # llm_feature_models: per-class overrides
    if not _has_column("llm_feature_models", "model_class"):
        op.add_column("llm_feature_models", sa.Column("model_class", sa.Text, nullable=False, server_default="primary"))
    # Backfill existing rows as primary overrides.
    op.execute("UPDATE llm_feature_models SET model_class = 'primary' WHERE model_class IS NULL OR model_class = ''")
    # Replace unique index to include model_class.
    op.execute("DROP INDEX IF EXISTS idx_llm_feature_models_org_feature")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_feature_models_org_feature_class
        ON llm_feature_models(org_id, feature, model_class)
        """
    )

    # llm_usage: cost observability
    if not _has_column("llm_usage", "cost_usd"):
        op.add_column("llm_usage", sa.Column("cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_llm_feature_models_org_feature_class")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_feature_models_org_feature
        ON llm_feature_models(org_id, feature)
        """
    )
    op.drop_column("llm_usage", "cost_usd")
    op.drop_column("llm_feature_models", "model_class")
    op.drop_column("llm_models", "cost_completion_1k_usd")
    op.drop_column("llm_models", "cost_prompt_1k_usd")
    op.drop_column("llm_models", "model_class")
