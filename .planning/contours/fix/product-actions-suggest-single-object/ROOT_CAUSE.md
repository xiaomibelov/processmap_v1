# Root cause: `AI_RESPONSE_PARSE_ERROR` при одиночном объекте от LLM

## Контур
`fix/product-actions-suggest-single-object` — продолжение аудита `audit/analysis-llm-raw-capture`.

## Доказательство (захваченный raw)

Пользователь на stage воспроизвёл ошибку для `POST /api/sessions/240167273b/analysis/product-actions/suggest`:

```json
{
  "ok": false,
  "error": "AI_RESPONSE_PARSE_ERROR",
  "module_id": "ai.product_actions.suggest",
  "diagnostics": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "parse_error": "response json does not contain a suggestions array",
    "response_excerpt": "{\n  \"action_text\": \"Поставить емкость\",\n  \"tags\": { ... }, ..."
  }
}
```

Полный raw сохранён в:
- `backend/tests/fixtures/llm_suggest/single_object_raw.txt`
- `.planning/contours/fix/product-actions-suggest-single-object/evidence/single_object_raw.txt`

## Что произошло

Модуль `ai.product_actions.suggest` ожидает от LLM JSON-обёртку:

```json
{
  "suggestions": [ { ... }, { ... } ],
  "warnings": []
}
```

При `scope: "selected_step"` модель иногда возвращает одиночный объект вместо массива:

```json
{
  "action_text": "Поставить емкость",
  "tags": { ... },
  "step_id": "Activity_1ve2y8x",
  ...
}
```

Функция `_extract_suggestions_array` искала ключи `suggestions/actions/items/results/data`. Одиночный объект не содержит ни одного из них → парсер падал с `AI_RESPONSE_PARSE_ERROR`, хотя JSON валиден и семантически корректен.

## Где чинить

- `backend/app/ai/product_actions_suggest.py` — tolerant-парсер.
- Промпт v4 `PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4` — инструкция «всегда массив».
- Golden-фикстуры и регрессионные тесты — `backend/tests/test_product_actions_suggest_v2.py`.

## Out of scope (F4)

В diagnostics захваченного raw видно `steps_count: 98` при `scope: "selected_step"`. В текущем UI `ProductActionSuggestionsPanel.jsx` не передаёт `selected_step_id` в `apiSuggestProductActions`, поэтому selected-step-фильтрация на самом деле не используется. Значение `scope: "selected_step"` в diagnostics — захардкоженная метка в блоке ошибки (`product_actions_ai.py:996-998`), а не реальный scope запроса. Это отдельный кандидат на оптимизацию (контекст/токены) — вынесено в `VERDICT.md`, не чинится в этом контуре.
