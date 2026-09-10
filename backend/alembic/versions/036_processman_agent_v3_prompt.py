"""036 — seed prompt v3 for processman_agent (пустая схема).

Revision ID: 036
Revises: 035
Create Date: 2026-09-10

Идемпотентный seed: ON CONFLICT DO NOTHING. Промт редактируется через admin API.
feature='processman_agent', model_class='primary', max_tokens=1200, status='active'.

Отличие от v1/v2 (018/022): явная инструкция для пустой/неполной схемы —
не вызывать actions и не возвращать JSON, отвечать свободным текстом
по-русски. Закрывает N1/M3 аудита llm-agent-audit-v1 (сырой action-JSON
показывался пользователю как free-answer на пустой схеме).

Старые версии архивируются; откат — downgrade() (v1 возвращается в active).
"""
from alembic import op


revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


_SYSTEM = (
    "Ты — ассистент технолога по BPMN-схеме кухонного процесса. "
    "Отвечай на русском, кратко и по делу.\n\n"
    "Тебе доступны три действия на схеме:\n"
    "- suggest-next: предложить следующий блок после указанного шага;\n"
    "- explain-step: объяснить AI-решение для указанного шага;\n"
    "- step-qa: ответить на вопрос по указанному шагу.\n\n"
    "Если пользователь просит выполнить одно из этих действий — верни СТРОГО один "
    "JSON-объект внутри markdown-блока ```json ... ```:\n"
    '{"action": "suggest-next", "after_step_id": "<id шага>"}\n'
    '{"action": "explain-step", "step_id": "<id шага>"}\n'
    '{"action": "step-qa", "step_id": "<id шага>", "question": "<вопрос>"}\n\n'
    "Если просьба не подходит ни под одно действие — отвечай свободным текстом, "
    "без JSON. Не выдумывай id шагов, которых нет в схеме.\n\n"
    "ВАЖНО: если схема в разделе «BPMN-схема» пустая (нет ни одного шага) — "
    "не вызывай действия и не возвращай JSON ни в каком виде. Ответь свободным "
    "текстом по-русски: кратко объясни, что схема пока пустая, и предложи, с "
    "чего начать описание процесса (например, с первой технологической операции)."
)

_TEMPLATE = "{input}"


def _esc(text: str) -> str:
    return text.replace("'", "''")


def upgrade() -> None:
    op.execute(
        """
        UPDATE llm_prompts
           SET status = 'archived',
               updated_by = 'migration-036',
               updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
         WHERE id IN ('llmprompt_processman_agent_v1', 'llmprompt_processman_agent_v2')
        """
    )
    op.execute(
        f"""
        INSERT INTO llm_prompts
            (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)
        VALUES
            ('llmprompt_processman_agent_v3', 'processman_agent', 3,
             '{_esc(_SYSTEM)}', '{_esc(_TEMPLATE)}', 'active', 1200, 'primary',
             'migration-036', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM llm_prompts WHERE id = 'llmprompt_processman_agent_v3'")
    op.execute(
        """
        UPDATE llm_prompts
           SET status = 'active',
               updated_by = 'migration-036-downgrade',
               updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
         WHERE id = 'llmprompt_processman_agent_v1'
        """
    )
