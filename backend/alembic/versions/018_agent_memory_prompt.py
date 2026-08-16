"""018 — seed prompt for processman_agent (AGENT-0).

Revision ID: 018
Revises: 017
Create Date: 2026-08-16

Идемпотентный seed: ON CONFLICT DO NOTHING. Промт редактируется через admin API.
feature='processman_agent', model_class='primary', max_tokens=1200.

Gateway рендерит только один плейсхолдер {input}; весь контекст (projection,
history, message, selected_step_id) собирается в коде run_turn().
"""
from alembic import op


revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


_SYSTEM = (
    "Ты — ассистент технолога по BPMN-схеме кухонного процесса. Отвечай на русском, "
    "кратко и по делу. У тебя есть три возможных действия на схеме:\n"
    "- suggest-next: предложить следующий блок после указанного шага;\n"
    "- explain-step: объяснить AI-решение для указанного шага;\n"
    "- step-qa: ответить на вопрос по указанному шагу.\n\n"
    "Если пользователь просит выполнить одно из этих действий — верни СТРОГО один "
    "JSON-объект внутри markdown-блока ```json ... ```:\n"
    '{"action": "suggest-next", "after_step_id": "<id шага>"}\n'
    '{"action": "explain-step", "step_id": "<id шага>"}\n'
    '{"action": "step-qa", "step_id": "<id шага>", "question": "<вопрос>"}\n\n'
    "Если просьба не подходит ни под одно действие — отвечай свободным текстом, "
    "без JSON. Не выдумывай id шагов, которых нет в схеме."
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
            ('llmprompt_processman_agent_v1', 'processman_agent', 1,
             '{_esc(_SYSTEM)}', '{_esc(_TEMPLATE)}', 'active', 1200, 'primary',
             'migration-018', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM llm_prompts WHERE id = 'llmprompt_processman_agent_v1'")
