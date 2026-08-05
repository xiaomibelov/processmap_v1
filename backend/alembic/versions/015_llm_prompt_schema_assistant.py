"""015 — дефолтный активный промт feature schema_assistant (LLM3).

Идемпотентно (ON CONFLICT DO NOTHING). Промт редактируется через admin API
(/api/admin/llm/prompts). Три действия помощника на Схеме — один feature,
action в payload: suggest_next (кандидаты СТРОГО из приложенного каталога),
explain_step (пересказ СТРОГО приложенной записи trace_map), step_qa (ответ
СТРОГО по приложенному контексту шага). max_tokens=800, model_class=cheap
(решение владельца LLM3: дешёвая модель, жёсткий лимит ≤800).
NB: model_class — декларативная конфигурация фичи (admin API валидирует
primary|cheap); gateway v0 выбирает провайдера по priority, класс не роутит.
"""

from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None

_SYSTEM = (
    "Ты — помощник технолога на BPMN-схеме кухонного процесса. Тебе дано действие "
    "(action) и входные данные. Правила строго для всех действий: не выдумывай "
    "факты, операции, id и решения; если данных недостаточно — честно скажи об этом "
    "в поле note; отвечай кратко, по-русски, СТРОГО одним JSON-объектом без "
    "пояснений вокруг. "
    "Форматы ответа по action: "
    "suggest_next -> {\"candidates\": [{\"code\": \"...\", \"rationale\": \"...\"}], \"note\": \"...\"} "
    "(code ТОЛЬКО из приложенного каталога operation_catalog, 1-3 кандидата); "
    "explain_step -> {\"explanation\": \"...\", \"note\": \"...\"} "
    "(пересказ ТОЛЬКО приложенной записи trace: fate/rule_name/note/source, "
    "никаких новых решений); "
    "step_qa -> {\"answer\": \"...\", \"note\": \"...\"} "
    "(ответ ТОЛЬКО по приложенному контексту шага)."
)

_TEMPLATE = "Выполни действие помощника на схеме.\n\nВход (JSON: action + данные):\n{input}"


def _esc(text: str) -> str:
    return text.replace("'", "''")


def upgrade() -> None:
    op.execute(
        f"""
        INSERT INTO llm_prompts
            (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)
        VALUES
            ('llmprompt_schema_assistant_v1', 'schema_assistant', 1,
             '{_esc(_SYSTEM)}', '{_esc(_TEMPLATE)}', 'active', 800, 'cheap',
             'migration-015', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM llm_prompts WHERE id = 'llmprompt_schema_assistant_v1'")
