"""agent: summary + observability indexes for PROCESSMAN conversations.

Revision ID: 028
Revises: 027
Create Date: 2026-08-23

Контур feat/agent-observability.

- Колонка agent_conversations.summary для фонового саммари закрытых диалогов.
- Индекс по updated_at для вычисляемого статуса active/closed по 24ч.
- Вспомогательный индекс llm_usage(session_id) для агрегации токенов диалога.
- Seed-промпт и флаг фичи agent_summary (draft, лимит 50k токенов/сутки).
"""
from alembic import op


revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE agent_conversations
        ADD COLUMN IF NOT EXISTS summary TEXT
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_agent_conversations_updated_at
        ON agent_conversations(updated_at)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_llm_usage_session_id
        ON llm_usage(session_id)
        """
    )
    # Seed-промпт для дешёвого саммари закрытых диалогов.
    op.execute(
        """
        INSERT INTO llm_prompts (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)
        VALUES (
            'llmprompt_agent_summary_v1',
            'agent_summary',
            1,
            'Ты summarizer диалога пользователя с агентом PROCESSMAN. Напиши краткое саммари на русском языке в 3–5 предложений: о чём спрашивали, что агент сделал, какие правки были отклонены, какие вопросы остались открытыми. Не упоминай технические идентификаторы. Ответь только текстом саммари.',
            'Суммаризируй следующий диалог. Ответь только текстом саммари.\n\nДиалог:\n{input}',
            'draft',
            400,
            'cheap',
            'migration_028',
            EXTRACT(EPOCH FROM NOW())::BIGINT
        )
        ON CONFLICT (id) DO NOTHING
        """
    )
    # Флаг фичи с разумным суточным лимитом.
    op.execute(
        """
        INSERT INTO llm_feature_flags (feature, enabled, daily_token_limit, updated_by, updated_at)
        VALUES ('agent_summary', true, 50000, 'migration_028', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT (feature) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_llm_usage_session_id")
    op.execute("DROP INDEX IF EXISTS idx_agent_conversations_updated_at")
    op.execute("ALTER TABLE agent_conversations DROP COLUMN IF EXISTS summary")
