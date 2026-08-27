# PR: fix/product-actions-suggest-single-object

## Заголовок PR (русский)

fix(ai): парсер `product_actions.suggest` принимает одиночный объект от LLM

## Описание

Модуль `ai.product_actions.suggest` падает с `AI_RESPONSE_PARSE_ERROR`, когда LLM возвращает одно действие как верхнеуровневый JSON-объект вместо массива `suggestions`. Это особенно часто при `scope=selected_step`.

## Изменения

- `backend/app/ai/product_actions_suggest.py`
  - `_looks_like_single_suggestion` — новая функция, распознающая одиночный dict-предложение по сигнатуре (`action_text` + теги).
  - `_extract_suggestions_array` — оборачивает одиночный объект в список.
  - `_looks_like_suggestions_payload` — признаёт одиночный объект как валидный payload.
  - `PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4` — добавлена инструкция «всегда возвращай массив suggestions» + few-shot с одним элементом.

- `backend/tests/test_product_actions_suggest_v2.py`
  - `test_parse_single_object_response` — одиночный объект → 1 suggestion.
  - `test_parse_single_object_with_incomplete_tags` — одиночный объект с неполными тегами → `missing_fields`.
  - `test_parse_random_dict_still_raises` — произвольный dict всё ещё вызывает parse error.

- `backend/tests/fixtures/llm_suggest/single_object_raw.txt`
  - Golden-фикстура реального raw-ответа со stage.

## Проверка

```bash
# unit-тесты парсера
docker compose -p fix-suggest-test run --rm --no-deps api \
  sh -c "cd /app && PYTHONPATH=backend python -m unittest tests.test_product_actions_suggest_v2 -v"
```

Ожидаемый результат: **18/18 OK**.

## Out of scope

- Фронтенд не передаёт `selected_step_id` в `apiSuggestProductActions`, поэтому selected-step-фильтрация сейчас не используется. `steps_count: 98` в захваченном raw — весь процесс, а не выбранный шаг. Зафиксировано в `VERDICT.md` как отдельный кандидат на оптимизацию.
- Изменения конфигов провайдеров (strategy-B) — не трогаем.
- БД — не трогаем.

## Что проверить на stage после merge

1. Открыть сессию `240167273b`.
2. Вкладка «Действия с продуктом» → «Сгенерировать».
3. Убедиться, что предложения рендерятся (нет `AI_RESPONSE_PARSE_ERROR`).
4. Execution log: `ok: true`, `provider: deepseek-main`.
