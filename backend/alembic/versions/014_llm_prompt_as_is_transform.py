"""014 — дефолтный активный промт feature as_is_transform (LLM2).

Идемпотентно (ON CONFLICT DO NOTHING). Промт редактируется через admin API
(/api/admin/llm/prompts). system — дословно LLM_SYSTEM_PROMPT из
app/transformation/pipeline.py (контракт matches[] не меняется).
max_tokens=2000 (решение владельца L3: transform 2000).
"""

from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None

_SYSTEM = (
    "Ты — эксперт по трансформации BPMN-процессов кухни AS IS -> TO BE (формат v0.3). "
    "Тебе дан список правил трансформации и список задач AS IS, которые не удалось "
    "сопоставить детерминированно. Для каждой задачи выбери ОДНО правило из списка "
    "или null, если ни одно правило не подходит уверенно. "
    "Ответь СТРОГО одним JSON-объектом без пояснений: "
    "{\"matches\": [{\"element_id\": \"...\", \"rule_id\": \"...\" | null, \"confidence\": 0.0}]}. "
    "Не выдумывай правила и element_id. Не угадывай: если сомневаешься — rule_id=null."
)

_TEMPLATE = (
    "Сопоставь нераспознанные задачи AS IS с правилами трансформации.\n\n"
    "Вход (JSON: rules — кандидаты, unmatched_tasks — задачи):\n{input}"
)


def _esc(text: str) -> str:
    return text.replace("'", "''")


def upgrade() -> None:
    op.execute(
        f"""
        INSERT INTO llm_prompts
            (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)
        VALUES
            ('llmprompt_as_is_transform_v1', 'as_is_transform', 1,
             '{_esc(_SYSTEM)}', '{_esc(_TEMPLATE)}', 'active', 2000, 'primary',
             'migration-014', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM llm_prompts WHERE id = 'llmprompt_as_is_transform_v1'")
