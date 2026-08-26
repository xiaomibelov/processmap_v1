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

---

# ROOT_CAUSE — итерация 2: fix/stage-ai-parse-stream-failover

## Состояние после PR #835 (факты со stage, 26.08 ~16:14)

- «Анализ LLM» работает (ответ из кэша, 0 токенов).
- **suggest** → `AI_RESPONSE_PARSE_ERROR` («Ответ AI не удалось разобрать»), HTTP 200, ~1,5 мин.
- **processman** (`POST /api/sessions/{id}/agent/stream`, SSE) → внутри потока `Не удалось получить ответ. Ошибка при обращении к LLM`.
- Провайдер по кнопке «Проверить» в `/admin/llm` — жив.

## Дефекты

### D1. suggest: `AI_RESPONSE_PARSE_ERROR`

**Кодовый путь:**
- `backend/app/routers/product_actions_ai.py::_call_product_actions_llm` → `gateway.complete(...)` → `backend/app/ai/product_actions_suggest.py::parse_product_actions_suggestions`.
- Парсер использует `deepseek_questions._extract_json_candidate`, который:
  1. Снимает только одинарные code-fences (` ```json ... ``` `).
  2. Ищет первую пару `{...}` / `[...]` регуляркой без валидации JSON.
  3. Не чинит обрезанный JSON (например, обрыв по `max_tokens` посередине объекта).
  4. Не извлекает JSON из ответа, обёрнутого в пояснительный текст до/после.

**Почему ломается именно сейчас:**
- После #835 промпт v4 требует `action_text` и большего объёма текста; VVPROXY `claude-opus-4-6` таймаутится, срабатывает failover на `deepseek-main`.
- DeepSeek может возвращать markdown-обёртку, текст вокруг JSON или обрезать ответ, если `max_tokens` недостаточно.
- Текущий парсер не восстанавливает такие ответы, поэтому вместо предложений получаем `AI_RESPONSE_PARSE_ERROR`.

**Root cause:** парсер недостаточно толерантен к реальным ответам LLM; отсутствует structured output и repair-retry.

### D2. processman: ошибка в `/agent/stream` (SSE)

**Кодовый путь:**
- `backend/services/agent/routers/agent_stream.py::agent_stream` → `memory.chat.run_turn_stream` → `gateway.complete_stream` (агентский `backend/services/agent/gateway/gateway.py`).
- Агентский gateway — копия монолитного gateway, но **не получил фикс #835**:
  - `_GATEWAY_MAX_ATTEMPTS = 2` retry внутри `_deepseek_chat_request_stream` при `Timeout`/`ConnectionError`.
  - `complete_stream` ловит Exception и переходит к следующему провайдеру, но к этому моменту уже потрачено ~90 с на retry первого провайдера.
  - Отсутствует `retry_on_timeout=False` в `services/agent/gateway/llm_http_client.py`.

**Root cause:** streaming-путь processman не покрыт быстрым failover'ом #835; тот же retry-цикл на таймаутящем VVPROXY приводит к ошибке/обрыву SSE.

### D3. Латентность suggest ~1,5 мин

**Кодовый путь:**
- `product_actions_ai.py::_call_product_actions_llm` передаёт `timeout_sec=45`.
- После #835 retry на timeout убран, но первичный таймаут VVPROXY всё ещё 45 с.
- Fallback-генерация deepseek на том же контексте занимает ещё десятки секунд.
- Итого: ~45 с (VVPROXY timeout) + ~45 с (deepseek generate) ≈ 90 с, что совпадает с наблюдаемым ~1,5 мин.

**Root cause:** слишком долгий пер-аттемпт таймаут на провайдере, который заведомо не справляется с длинным контекстом; отсутствует feature-specific приоритет провайдеров для product-actions/processman.

## Фикс (итерация 2)

### D1
- Толерантный парсер JSON в `backend/app/ai/product_actions_suggest.py` (strip fences, первый валидный блок, repair truncated).
- Structured output: `json_mode=True` для `product_actions_suggest` → `response_format: json_object`.
- Диагностика parse error расширена (больше `raw_content`).

### D2
- `retry_on_timeout=False` в агентском `llm_http_client.py` для `_deepseek_chat_request` и `_deepseek_chat_request_stream`.
- Быстрый failover по `Timeout`/`ConnectionError` в `services/agent/gateway/gateway.py::complete()` и `::complete_stream()`.
- `json_mode` прокинут через `llm_internal_client.py` → `services/agent/routers/internal_llm.py`.

### D3
- `timeout_sec` для suggest снижен с 45 до 30 с.
- В PR.md задокументирована рекомендация переставить приоритеты провайдеров в `/admin/llm` для org 8b89c83ea810 (deepseek-main выше VVPROXY для product-actions/processman).

## Проверка (локальные тесты)

- `backend/tests/test_product_actions_suggest_v2.py`: 9 passed.
- `backend/tests/test_llm_gateway.py`: 18 passed + 1 pre-existing (загрязнение org_default).
- `backend/services/agent/tests/test_gateway.py`: 4 passed.
- `backend/services/agent/tests/test_internal_llm.py`: 6 passed.
- `backend/services/agent/tests/test_streaming.py`: 3 passed.

## Что остаётся проверить на stage (после мержа)

- suggest генерирует без `AI_RESPONSE_PARSE_ERROR`.
- processman отвечает содержательно.
- Execution log показывает provider/model и fallback.
- Время suggest ≤ разумного (≤ 60 с после патча; ещё лучше — после перестановки приоритетов).

---

# ROOT_CAUSE — итерация 3: fix/stage-suggest-empty-agent-stream

## Состояние после PR #836 (факты со stage, 26.08 ~18:11)

- **suggest** отдаёт пустой результат для сессии `e9dd18bcbe` (проект `5c5c831905`, шаги в сессии есть).
- **processman** (`/api/sessions/{id}/agent/stream`) всё ещё падает с ошибкой внутри SSE.
- Пользователь сообщает: фикс #836 в `backend/services/agent/` на stage не наблюдается.

## Дефекты

### D4. suggest → пустой результат

**Кодовый путь:**
- `backend/app/routers/product_actions_ai.py::_call_product_actions_llm` → `gateway.complete(..., json_mode=True)` → `backend/app/ai/product_actions_suggest.py::parse_product_actions_suggestions`.
- Парсер после #836 снимает code-fences и ищет первый валидный JSON, но `normalize_product_action_suggestions_response` ожидала ключ `suggestions`.
- При `response_format: json_object` DeepSeek (и другие провайдеры) могут вернуть объект-обёртку: `{"actions": [...]}`, `{"items": [...]}`, `{"results": [...]}`, `{"data": [...]}`, либо массив напрямую.
- Если обёртка не распознана — `raw_suggestions` пуст, и endpoint возвращает пустой список с сообщением «LLM не предложил действий», хотя шаги есть.
- Отсутствовало инструментирование: в логах/ответе не было видно, сколько шагов ушло в LLM, какой провайдер/модель ответил, какой длины был сырой ответ, сколько элементов распарсилось и сколько выжило после валидации.

**Root cause:** парсер не извлекал массив предложений из альтернативных JSON-обёрток; отсутствовала диагностика, позволяющая за один вызов понять, на каком звене пропали предложения.

### D2 (продолжение). processman: фикс #836 не виден на stage

**Кодовый путь:**
- nginx проксирует `/api/sessions/[^/]+/agent/(chat|history|stream|resume)$` в контейнер `agent:8000`.
- `backend/services/agent/gateway/gateway.py::complete_stream()` уже содержит failover (`retry_on_timeout=False`) после #836.
- Однако на stage агент-сервис возвращает ошибку LLM, как и до #836.

**Гипотезы:**

1. **Deploy gap (проверена по коду, требует подтверждения на stage).**
   - `.github/workflows/deploy-stage.yml` пересобирает и перезапускает `agent` только если в push изменился `backend/services/agent/`.
   - PR #836 менял файлы в `backend/services/agent/`, поэтому workflow должен был пересобрать сервис.
   - Но у пользователя фикс не наблюдается — возможно, stage-окружение использует stale-образ, или workflow запущен вручную с другим ref, или docker compose не пересоздал контейнер.
   - **Действие:** добавлен endpoint `/version` в agent-сервис, чтобы можно было проверить commit/running build без SSH.

2. **Провайдер/модель processman всё ещё таймаутится.**
   - processman использует `processman_agent` feature и `complete_stream()`.
   - Если модуль `processman_agent` во вкладке «Модули» /admin/llm прибит к VVPROXY `claude-opus-4-6`, failover на deepseek сработает, но ответ может занимать десятки секунд и обрываться.
   - **Действие:** в SSE-ошибку и логи добавлены `provider_id` и `model`, чтобы по одному вызову видеть, кто реально отвечал.

**Root cause (предварительный):** либо stale-деплой agent-сервиса, либо провайдер processman не переключён на работающий deepseek-main. Точный вердикт требует проверки `/version` и execution log на stage.

### D3 (продолжение). Латентность suggest

- После #836 таймаут снижен до 30 с; наблюдаемое время ~47,5 с (один таймаут VVPROXY + генерация deepseek).
- Проблема сохраняется, потому что primary-провайдер для org `8b89c83ea810` — VVPROXY `claude-opus-4-6`, который не справляется с длинным контекстом.
- **Рекомендация:** в `/admin/llm` поднять приоритет `deepseek-main` для org `8b89c83ea810` выше VVPROXY. Решение конфигурационное, не кодовое.

## Фикс (итерация 3)

### D4

- `backend/app/ai/product_actions_suggest.py`:
  - `_extract_suggestions_array` извлекает массив из обёрток `suggestions`, `actions`, `items`, `results`, `data`.
  - `normalize_product_action_suggestions_response` использует этот экстрактор.
- `backend/app/routers/product_actions_ai.py`:
  - Инструментирование каждого вызова: `steps_sent`, `provider_id`, `model`, `raw_len`, `parsed_count`, `selected_count`, `kept_count`, `drop_reasons`.
  - Диагностика пишется в `usage` execution log и возвращается в `diagnostics` успешного ответа.
  - Различимые коды ошибок для пустого результата:
    - `AI_SUGGEST_NO_STEPS` — в сессии нет шагов (ранний возврат, без вызова LLM).
    - `AI_SUGGEST_LLM_EMPTY` — LLM вернул пустой список.
    - `AI_SUGGEST_ALL_INVALID` — все предложения отбракованы фильтром/валидацией/дубликатами.
  - Ранний возврат `AI_SUGGEST_NO_STEPS`, если в контексте 0 шагов, чтобы не тратить токены.
- `frontend/src/features/process/analysis/ProductActionSuggestionsPanel.jsx` + `frontend/src/shared/i18n/ru.js`:
  - Добавлены коды ошибок и человекочитаемые сообщения для `AI_SUGGEST_NO_STEPS`, `AI_SUGGEST_LLM_EMPTY`, `AI_SUGGEST_ALL_INVALID`.

### D2

- `backend/services/agent/routers/health.py`:
  - Новый endpoint `/version` с `build_id`, `build_time`, `build_branch`, `build_env`, `git_commit`.
- `backend/services/agent/gateway/gateway.py`:
  - В error-событие `complete_stream()` добавлены `provider_id` и `model` последнего attempted-провайдера.
- `backend/services/agent/memory/chat.py`:
  - При `stream_error` логируется `session_id`, `provider_id`, `model`, `status`, `error`.
  - Error-событие передаёт `provider_id`/`model` дальше в SSE.
- `backend/services/agent/routers/agent_stream.py`:
  - Логирование error-событий SSE с `provider_id`/`model`.
  - Логирование необработанных исключений потока.

### D3

- Оставлена рекомендация из #836: поднять приоритет `deepseek-main` для org `8b89c83ea810` в `/admin/llm`. Код не меняет конфигурацию.

## Что остаётся проверить на stage (после мержа)

- [ ] `/api/sessions/{id}/agent/version` (через nginx → agent) возвращает актуальный commit PR #836/итерации 3.
- [ ] suggest на сессии `e9dd18bcbe` возвращает непустой список валидных предложений.
- [ ] Execution log /admin/llm для suggest показывает `provider_id`, `model`, `parsed_count`, `kept_count`.
- [ ] processman отвечает содержательно; SSE-ошибка (если есть) содержит `provider_id`/`model`.
- [ ] В /admin/llm «Модули» проверить, к какому провайдеру/модели привязаны `product_actions_suggest` и `processman_agent`; при необходимости переставить приоритеты.
