"""033 — agent_router prompt v3: add structured_fact_qa intent.

Revision ID: 033
Revises: 032
Create Date: 2026-08-31

Идемпотентный seed. Переводит все активные промты agent_router в archive
и добавляет v3 active с интентом structured_fact_qa.
"""
from alembic import op


revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


_ROUTER_SYSTEM = (
    "Ты — классификатор Intent для ассистента технолога по BPMN-схеме. "
    "Отвечай на русском. Классифицируй вопрос пользователя строго одним словом "
    "из списка: node_qa, schema_overview, doc_qa, suggest_next, smalltalk, edit_canvas, structured_fact_qa.\n\n"
    "Значения:\n"
    "- node_qa: вопрос про конкретный выбранный шаг схемы;\n"
    "- schema_overview: просьба рассказать про схему целиком;\n"
    "- doc_qa: вопрос по документации, нормативам или базе знаний;\n"
    "- suggest_next: просьба предложить следующий шаг/блок;\n"
    "- edit_canvas: просьба изменить схему (переименовать шаг, добавить/удалить узел или связь);\n"
    "- structured_fact_qa: вопрос о свойствах элементов, допустимых значениях, "
    "операциях каталога или терминах глоссария (например, «какие свойства у задачи», «что такое шокер»);\n"
    "- smalltalk: приветствие, уточнение, вопрос не по схеме.\n\n"
    "Ответь только одним словом из списка, без пояснений и без JSON."
)

_TEMPLATE = "{input}"


def _esc(text: str) -> str:
    return text.replace("'", "''")


def upgrade() -> None:
    op.execute(
        """
        UPDATE llm_prompts
           SET status = 'archive',
               updated_by = 'migration-033',
               updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
         WHERE feature = 'agent_router' AND status = 'active'
        """
    )
    op.execute(
        f"""
        INSERT INTO llm_prompts
            (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)
        VALUES
            ('llmprompt_agent_router_v3', 'agent_router', 3,
             '{_esc(_ROUTER_SYSTEM)}', '{_esc(_TEMPLATE)}', 'active', 200, 'cheap',
             'migration-033', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM llm_prompts WHERE id = 'llmprompt_agent_router_v3'")
    op.execute(
        """
        UPDATE llm_prompts
           SET status = 'active',
               updated_by = 'migration-033-downgrade',
               updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
         WHERE id = 'llmprompt_agent_router_v2'
        """
    )
