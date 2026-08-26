"""030 — product_actions_suggest prompt v2 (action-centric output).

Revision ID: 030
Revises: 029
Create Date: 2026-08-26

Переводим вывод рекомендаций действий с продуктом с товароцентричных карточек
на действиецентричные строки: обязательное поле action_text + 4 лейблированных
тега (action_type, action_stage, action_object, action_method).

Идемпотентно (ON CONFLICT DO NOTHING). Секретов нет.
"""
from alembic import op


revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


_SYSTEM = ""

_TEMPLATE = """Ты помогаешь составить список физических действий сотрудника с продуктом/ингредиентом/полуфабрикатом/блюдом/тарой/упаковкой по шагам пищевого процесса.

Для каждого действия верни:
- action_text: глагольная формулировка физического действия (например, "Перелить суп из контейнера в гастроёмкость").
- tags: { action_type, action_stage, action_object, action_method }.
- product_name, product_group: из контекста проекта/шага; если неизвестно — пустая строка.
- step_id, bpmn_element_id, step_label, role, confidence, reason.

Формат:
{
  "suggestions": [
    {
      "action_text": "",
      "tags": { "action_type": "", "action_stage": "", "action_object": "", "action_method": "" },
      "product_name": "",
      "product_group": "",
      "step_id": "",
      "bpmn_element_id": "",
      "step_label": "",
      "role": "",
      "confidence": 0.0,
      "reason": ""
    }
  ],
  "warnings": []
}

Примеры:
- action_text: "Перелить суп из контейнера в гастроёмкость"
  tags: { action_type: "перетаривание", action_stage: "до разогрева", action_object: "суп", action_method: "перелить" }
- action_text: "Надрезать упаковку рыбы ножом"
  tags: { action_type: "вскрытие", action_stage: "до разогрева", action_object: "упаковка рыбы", action_method: "надрез ножом" }
- action_text: "Нарезать куриную грудку ножом"
  tags: { action_type: "нарезка", action_stage: "подготовка", action_object: "куриная грудка", action_method: "нарезать ножом" }

Правила:
- action_text — обязательно, не более 120 символов.
- Все 4 тега обязательны; если неизвестно — пустая строка и низкая confidence.
- Предлагай только физические действия сотрудников с продуктом, ингредиентом, полуфабрикатом, готовым блюдом, тарой, контейнером или упаковкой.
- Игнорируй чисто информационные, системные, организационные и согласовательные шаги, если в них нет физического действия с продуктом/тарой/упаковкой.
- Не придумывай товары, группы товаров или методы, если в шаге нет продуктового контекста.
- Не повторяй уже утверждённые product_actions без явной новой детали.
- Return only valid JSON object matching schema. No markdown, no comments, no trailing commas.

{input}"""


def _esc(text: str) -> str:
    return text.replace("'", "''")


def upgrade() -> None:
    op.execute(
        """
        UPDATE llm_prompts
           SET status = 'archived',
               updated_by = 'migration-030',
               updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
         WHERE id = 'llmprompt_product_actions_suggest_v1'
        """
    )
    op.execute(
        f"""
        INSERT INTO llm_prompts
            (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)
        VALUES
            ('llmprompt_product_actions_suggest_v2', 'product_actions_suggest', 2,
             '{_esc(_SYSTEM)}', '{_esc(_TEMPLATE)}', 'active', 4000, 'primary',
             'migration-030', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM llm_prompts WHERE id = 'llmprompt_product_actions_suggest_v2'")
    op.execute(
        """
        UPDATE llm_prompts
           SET status = 'active',
               updated_by = 'migration-030-downgrade',
               updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
         WHERE id = 'llmprompt_product_actions_suggest_v1'
        """
    )
