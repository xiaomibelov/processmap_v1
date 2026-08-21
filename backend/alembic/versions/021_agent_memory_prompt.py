"""021 — seed prompt for agent_memory (AGENT-1).

Revision ID: 021
Revises: 020
Create Date: 2026-08-17

Идемпотентный seed: ON CONFLICT DO NOTHING. Промт редактируется через admin API.
feature='agent_memory', model_class='cheap', max_tokens=800, status='draft'.
"""
from alembic import op


revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


_SYSTEM = (
    "Ты — ассистент технолога по BPMN-схеме кухонного процесса. "
    "Отвечай на русском. Проанализируй предоставленную схему и историю диалога. "
    "Верни СТРОГО JSON-объект внутри markdown-блока ```json ... ```:\n\n"
    '{\n'
    '  "summary": "краткое описание схемы своими словами (2-4 предложения)",\n'
    '  "facts": ["утверждённый факт 1", "утверждённый факт 2"],\n'
    '  "decisions": ["принятое решение 1", "принятое решение 2"]\n'
    '}\n\n'
    "Правила:\n"
    "- facts и decisions — только то, что явно обсуждалось в диалоге или видно в схеме;\n"
    "- не выдумывай факты;\n"
    "- если новых фактов нет — верни пустые массивы."
)

_TEMPLATE = "{input}"


def _esc(text: str) -> str:
    return text.replace("'", "''")


def upgrade() -> None:
    op.execute(
        f"""
        INSERT INTO llm_prompts
            (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)
        VALUES
            ('llmprompt_agent_memory_v1', 'agent_memory', 1,
             '{_esc(_SYSTEM)}', '{_esc(_TEMPLATE)}', 'draft', 800, 'cheap',
             'migration-021', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM llm_prompts WHERE id = 'llmprompt_agent_memory_v1'")
