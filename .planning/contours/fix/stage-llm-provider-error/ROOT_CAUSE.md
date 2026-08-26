# ROOT_CAUSE — fix/stage-llm-provider-error

## Симптом

- 26.08 ~12:12 на stage.processmap.ru:
  - Вкладка AI → «Сгенерировать действия» → `AI_PROVIDER_ERROR`.
  - Network: POST `/api/sessions/{id}/analysis/product-actions/suggest` → HTTP 200, длительность ~1,7 мин, тело 0,4 кБ (error-payload).
  - error-events 201 — фронтовое логирование ошибки.
  - Агент processman на схеме тоже возвращает ошибку.
- Таймлайн: ~09:08 генерация работала → пользователь смержил PR #834 (`feature/product-actions-output-v2`) → ~12:12 ошибка.
- Конфигурация шлюза (/admin/llm): действующий провайдер орг 8b89c83ea810 — VVPROXY LLM (`https://vvchat.vkusvill.ru/red-mad-router`, модель `claude-opus-4-6`, приоритет 100); fallback-кандидаты: deepseek-main (org-scoped) и deepseek-main (общий org_default).
- Пользователь проверил провайдера штатной кнопкой «Проверить» в /admin/llm — работает (короткий тестовый вызов).

## Гипотезы

### H1. Провайдер мёртв / ключ недействителен
- **Статус:** опровергнута в базовой форме.
- **Доказательство:** кнопка «Проверить» в /admin/llm проходит успешно. Провайдер жив на коротком запросе.
- **Остаточный нюанс:** тестовый вызов короткий; реальный suggest/processman — длинный контекст. Execution log покажет, какой провайдер/model реально выбран.

### H2. Регрессия из PR #834 в пути suggest
- **Статус:** подтверждена.
- **Доказательство:**
  - В `backend/app/ai/prompt_registry.py` активен `seed_ai_product_actions_suggest_v4`.
  - `PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4` не содержит `action_text` в схеме.
  - `normalize_product_action_suggestion` и `_REQUIRED_FIELDS` в `product_actions_ai.py` требуют `action_text`.
  - Результат: все сгенерированные предложения будут помечены как incomplete (`missing_fields` включает `action_text`). Это UX-регрессия из PR #834.
- **Влияние на AI_PROVIDER_ERROR:** прямого влияния нет, но ослабляет доверие к generation pipeline.

### H3. Таймаут-цепочка + retry на первом провайдере
- **Статус:** главный root cause (подтверждён по коду и наблюдаемой длительности).
- **Доказательство:**
  - `backend/app/routers/product_actions_ai.py::_call_product_actions_llm` передаёт `timeout_sec=45`.
  - `backend/app/ai/gateway.py::complete` использует `_GATEWAY_MAX_ATTEMPTS = 2` retry на провайдера.
  - `backend/app/ai/llm_http_client.py::_deepseek_chat_request` использует `read_timeout = max(10, timeout)`.
  - Итого на одного провайдера: до 2 попыток × 45 сек + backoff ≈ 90+ сек.
  - Наблюдаемая длительность ~1,7 мин ≈ 102 с — совпадает с двумя таймаутами подряд.
  - Fallback на deepseek-main сработает только после исчерпания retry у VVPROXY.
- **Почему VVPROXY таймаутится:**
  - Модель `claude-opus-4-6` либо не существует, либо роутер vvchat не справляется с ней на длинном контексте.
  - Промпт suggest содержит BPMN-схему, шаги, узлы, рёбра и existing_product_actions — большой контекст.

### H4. Конфиг stage сброшен после деплоя
- **Статус:** не подтверждена / не опровергнута.
- **Доказательство:** кнопка «Проверить» работает — базовый конфиг на месте. Нужен execution log для подтверждения model/provider реальных вызовов.

## Обнаруженные дефекты кода (независимо от stage-данных)

1. **Gateway retry при таймауте:** при обрыве/таймауте upstream gateway retry'ит того же провайдера 2 раза вместо быстрого failover. Это объясняет ~1,7 мин.
2. **Frontend не мапит `AI_PROVIDER_ERROR` / `AI_RESPONSE_PARSE_ERROR` / `AI_RATE_LIMIT_EXCEEDED`:**
   - `ProductActionSuggestionsPanel.jsx` `KNOWN_ERROR_CODES` не содержит `AI_PROVIDER_ERROR` и `AI_RESPONSE_PARSE_ERROR`.
   - Пользователь видит raw `AI_PROVIDER_ERROR` вместо человекочитаемого сообщения.
3. **Промпт v4 не содержит `action_text`:** регрессия PR #834 — все сгенерированные действия будут incomplete.

## Фикс

1. **Gateway failover:** при `Timeout`/`ConnectionError` не retry — сразу переходим к следующему провайдеру.
2. **Frontend error mapping:** добавить `AI_PROVIDER_ERROR`, `AI_RESPONSE_PARSE_ERROR`, `AI_RATE_LIMIT_EXCEEDED` в `KNOWN_ERROR_CODES` и i18n.
3. **Промпт v4:** добавить `action_text` и формулировку «глагольное действие».
4. **Диагностика:** в `AI_PROVIDER_ERROR` возвращать provider_id/model (через gateway error result + exception result).

## Что остаётся проверить на stage (после мержа)

- suggest генерирует предложения без `AI_PROVIDER_ERROR`.
- processman отвечает.
- Execution log показывает, через какого провайдера прошли вызовы.
- Время отклика suggest ≤ разумного (с failover — секунды, а не минуты).
