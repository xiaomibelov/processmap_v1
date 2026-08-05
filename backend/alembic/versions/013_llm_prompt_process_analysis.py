"""013 — дефолтный активный промт feature process_analysis (LLM1).

Идемпотентно (ON CONFLICT DO NOTHING). Промт дальше редактируется через
admin API (/api/admin/llm/prompts, версии + rollback); активная версия —
max(version) со status='active'. Секретов в миграции нет.
"""

from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None

_SYSTEM = (
    "Ты — аналитик производственных процессов. "
    "Отвечай строго валидным JSON без markdown-ограждений и пояснений."
)

_TEMPLATE = (
    "Проанализируй процесс (JSON: steps — шаги с id/type/name_ru/duration/role, "
    "edges — переходы) и верни ТОЛЬКО JSON вида:\n"
    '{"bottlenecks":[{"step_id":"...","reason":"...","severity":"low|medium|high"}],'
    '"robotization_candidates":[{"step_id":"...","operation_code":"...","rationale":"..."}],'
    '"risks":[{"text":"...","severity":"low|medium|high"}],'
    '"open_questions":[{"text":"..."}]}\n'
    "Правила: step_id — только из списка шагов процесса; operation_code — только из каталога: "
    "get_from_storage, move, hold, open_equipment, close_equipment, set_equipment, "
    "start_equipment, wait, open_container, close_container, transfer, measure_temperature, "
    "check, publish_event. Не уверен — пиши в open_questions, не выдумывай.\n\n"
    "Процесс:\n{input}"
)


def _esc(text: str) -> str:
    return text.replace("'", "''")


def upgrade() -> None:
    op.execute(
        f"""
        INSERT INTO llm_prompts
            (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)
        VALUES
            ('llmprompt_process_analysis_v1', 'process_analysis', 1,
             '{_esc(_SYSTEM)}', '{_esc(_TEMPLATE)}', 'active', 4000, 'primary',
             'migration-013', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM llm_prompts WHERE id = 'llmprompt_process_analysis_v1'")
