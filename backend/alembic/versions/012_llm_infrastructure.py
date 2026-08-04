"""llm: инфраструктура (providers/prompts/usage/feature_flags).

Revision ID: 012
Revises: 011
Create Date: 2026-08-04

По апрувленному docs/llm/PLAN.md (трек LLM, эпик LLM0). LINEAR в
backend/scripts/db_bootstrap.py расширен значением "012" этим же PR.

Стиль — как 011: идемпотентно (IF NOT EXISTS), без деструктива.
"""
from alembic import op


revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Провайдеры: мульти-провайдер, фолбэк по priority (меньше = раньше).
    # api_key хранится в БД, наружу НЕ отдаётся (has_api_key + last4 в API).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_providers (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL DEFAULT 'org_default',
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 100,
            enabled BOOLEAN NOT NULL DEFAULT true,
            created_by TEXT,
            created_at BIGINT,
            updated_by TEXT,
            updated_at BIGINT
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_providers_org_name
        ON llm_providers(org_id, name)
        """
    )

    # Промты: версионирование, одна active на фичу (enforce в коде, как prompt_registry).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_prompts (
            id TEXT PRIMARY KEY,
            feature TEXT NOT NULL,
            version INTEGER NOT NULL,
            system TEXT NOT NULL DEFAULT '',
            template TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'draft',
            max_tokens INTEGER NOT NULL DEFAULT 2000,
            model_class TEXT NOT NULL DEFAULT 'primary',
            updated_by TEXT,
            updated_at BIGINT
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_prompts_feature_version
        ON llm_prompts(feature, version)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_llm_prompts_feature_status
        ON llm_prompts(feature, status)
        """
    )

    # Учёт токенов: cached=true => 0 токенов (критерий 4 трека).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_usage (
            id BIGSERIAL PRIMARY KEY,
            org_id TEXT,
            feature TEXT NOT NULL,
            model TEXT,
            provider_id TEXT,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            cached BOOLEAN NOT NULL DEFAULT false,
            user_id TEXT,
            project_id TEXT,
            session_id TEXT,
            latency_ms INTEGER,
            status TEXT NOT NULL DEFAULT 'ok',
            ts BIGINT NOT NULL
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_llm_usage_org_feature_ts
        ON llm_usage(org_id, feature, ts)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_llm_usage_feature_ts
        ON llm_usage(feature, ts)
        """
    )

    # Флаги фич + суточные лимиты (L3 принято: 200k/300k/100k).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_feature_flags (
            feature TEXT PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT true,
            daily_token_limit INTEGER NOT NULL DEFAULT 200000,
            updated_by TEXT,
            updated_at BIGINT
        )
        """
    )
    # Стартовые фичи (идемпотентно); лимиты по решению владельца L3.
    op.execute(
        """
        INSERT INTO llm_feature_flags (feature, enabled, daily_token_limit)
        VALUES
            ('process_analysis', true, 200000),
            ('as_is_transform', true, 300000),
            ('schema_assistant', true, 100000)
        ON CONFLICT (feature) DO NOTHING
        """
    )

    # Сид-заглушка провайдера (L1): без ключа, выключен — ключ вносит админ
    # через админку. Секреты в репо не храним.
    op.execute(
        """
        INSERT INTO llm_providers (id, org_id, name, base_url, api_key, model, priority, enabled, created_at)
        VALUES ('llmprov_deepseek_seed', 'org_default', 'deepseek-main',
                'https://api.deepseek.com', '', 'deepseek-chat', 100, false,
                EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS llm_feature_flags")
    op.execute("DROP TABLE IF EXISTS llm_usage")
    op.execute("DROP TABLE IF EXISTS llm_prompts")
    op.execute("DROP TABLE IF EXISTS llm_providers")
