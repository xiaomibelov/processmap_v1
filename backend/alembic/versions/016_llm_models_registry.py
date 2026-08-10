"""llm: реестр моделей (llm_models) + per-feature overrides (llm_feature_models).

Revision ID: 016
Revises: 015
Create Date: 2026-08-09

Контур feat/llm-model-config (.planning/contours/feat/llm-model-config/PLAN.md).
LINEAR в backend/scripts/db_bootstrap.py расширен значением "016" этим же PR.

Реестр моделей — единый источник «какая модель работает»: gateway резолвит
model_name через override фичи → default модели → (пустой реестр) старое
поведение (provider.model / env-хардкод). Сид: текущая захардкоженная
deepseek-chat как default, чтобы после миграции поведение не изменилось.

Стиль — как 012: идемпотентно (IF NOT EXISTS / ON CONFLICT DO NOTHING),
без деструктива в upgrade. Downgrade обратим (DROP обеих таблиц).
"""
from alembic import op


revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Реестр моделей: provider — имя провайдера (связь по имени с llm_providers.name,
    # без FK — провайдеры/модели редактируются независимо).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_models (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL DEFAULT 'org_default',
            provider TEXT NOT NULL DEFAULT '',
            model_name TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            enabled BOOLEAN NOT NULL DEFAULT true,
            is_default BOOLEAN NOT NULL DEFAULT false,
            params TEXT NOT NULL DEFAULT '{}',
            created_by TEXT,
            created_at BIGINT,
            updated_by TEXT,
            updated_at BIGINT
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_models_org_model
        ON llm_models(org_id, model_name)
        """
    )

    # Per-feature override: какая модель обслуживает конкретную фичу.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_feature_models (
            feature TEXT NOT NULL,
            org_id TEXT NOT NULL DEFAULT 'org_default',
            model_id TEXT NOT NULL,
            updated_by TEXT,
            updated_at BIGINT
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_feature_models_org_feature
        ON llm_feature_models(org_id, feature)
        """
    )

    # Сид: текущая захардкоженная модель как default (обратная совместимость).
    op.execute(
        """
        INSERT INTO llm_models
            (id, org_id, provider, model_name, display_name, enabled, is_default,
             params, created_by, created_at, updated_by, updated_at)
        VALUES
            ('llmmodel_deepseek_chat', 'org_default', 'deepseek', 'deepseek-chat',
             'DeepSeek Chat', true, true, '{}',
             'migration-016', EXTRACT(EPOCH FROM NOW())::BIGINT,
             'migration-016', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS llm_feature_models")
    op.execute("DROP TABLE IF EXISTS llm_models")
