"""029 — product_actions_suggest prompt + feature flag for LLM gateway.

Переводим эндпоинт product-actions/suggest с env-DEEPSEEK_API_KEY на
единый LLM gateway (app.ai.gateway). Промт берётся из llm_prompts(feature=
'product_actions_suggest', status='active'), флаг — из llm_feature_flags.

Идемпотентно (ON CONFLICT DO NOTHING). Секретов нет.
"""

from alembic import op

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None

_SYSTEM = ""

# Копия PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4 из
# backend/app/ai/product_actions_suggest.py с добавленным плейсхолдером {input},
# который подставляет gateway._render_messages().
_TEMPLATE = """Ты помогаешь заполнить реестр действий с продуктом для пищевого процесса.

Верни не более 3 предложений. Все строковые поля — не более 60 символов.

Верни только JSON без markdown. Формат:
{
  "suggestions": [
    {
      "step_id": "",
      "bpmn_element_id": "",
      "step_label": "",
      "product_name": "",
      "product_group": "",
      "action_type": "",
      "action_stage": "",
      "action_object": "",
      "action_object_category": "",
      "action_method": "",
      "role": "",
      "confidence": "low|medium|high",
      "reason": ""
    }
  ],
  "warnings": []
}

Правила:
- Предлагай только физические действия сотрудников с продуктом, ингредиентом, полуфабрикатом, готовым блюдом, тарой, контейнером или упаковкой.
- Игнорируй чисто информационные, системные, организационные и согласовательные шаги, если в них нет физического действия с продуктом/тарой/упаковкой.
- Предлагай только действия, которые явно следуют из BPMN/Interview шагов.
- Не придумывай товары, группы товаров или методы, если в шаге нет продуктового контекста.
- Для каждого candidate заполни: product_name, product_group, action_type, action_stage, action_object, action_object_category, action_method, role, step_id, bpmn_element_id, confidence, reason.
- reason должен коротко указывать фразу/шаг, из которого сделан вывод (не более 60 символов).
- confidence: "high" — явно следует из шага, "medium" — вероятно, "low" — предположение.
- Если поле неизвестно, оставь пустую строку и снизь confidence.
- Не повторяй уже сохранённые product_actions; если действие похоже на существующее, всё равно верни его только при явной новой детали.
- Не меняй BPMN и не пиши финальные данные, это только suggestions для review.
- Return only valid JSON object matching schema. No markdown, no comments, no trailing commas.

{input}"""


def _esc(text: str) -> str:
    return text.replace("'", "''")


def upgrade() -> None:
    op.execute(
        f"""
        INSERT INTO llm_prompts
            (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)
        VALUES
            ('llmprompt_product_actions_suggest_v1', 'product_actions_suggest', 1,
             '{_esc(_SYSTEM)}', '{_esc(_TEMPLATE)}', 'active', 4000, 'primary',
             'migration-029', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO llm_feature_flags (feature, enabled, daily_token_limit, updated_by, updated_at)
        VALUES ('product_actions_suggest', true, 200000, 'migration-029', EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT (feature) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM llm_feature_flags WHERE feature = 'product_actions_suggest'")
    op.execute("DELETE FROM llm_prompts WHERE id = 'llmprompt_product_actions_suggest_v1'")
