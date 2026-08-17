"""020 — seed prompt for agent_router (AGENT-1).

Revision ID: 020
Revises: 019
Create Date: 2026-08-17

Идемпотентный seed: ON CONFLICT DO NOTHING. Промт редактируется через admin API.
feature='agent_router', model_class='cheap', max_tokens=200, status='draft'.
"""
from alembic import op


revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


_SYSTEM = (
    "Ты — классификатор Intent для ассистента технолога по BPMN-схеме. "
    "Отвечай на русском. Классифицируй вопрос пользователя строго одним словом "
    "из списка: node_qa, schema_overview, doc_qa, suggest_next, smalltalk.\n\n"
    "Значения:\n"
    "- node_qa: вопрос про конкретный выбранный шаг схемы;\n"
    "- schema_overview: просьба рассказать про схему целиком;\n"
    "- doc_qa: вопрос по документации, нормативам или базе знаний;\n"
    "- suggest_next: просьба предложить следующий шаг/блок;\n"
    "- smalltalk: приветствие, уточнение, вопрос не по схеме.\n\n"
    "Ответь только одним словом из списка, без пояснений и без JSON."
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
            ('llmprompt_agent_router_v1', 'agent_router', 1,
             '{_esc(_SYSTEM)}', '{_esc(_TEMPLATE)}', 'draft', 200, 'cheap',
             'migration-020', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM llm_prompts WHERE id = 'llmprompt_agent_router_v1'")
