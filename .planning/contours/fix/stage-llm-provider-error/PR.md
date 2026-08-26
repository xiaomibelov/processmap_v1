# PR — fix/stage-suggest-empty-agent-stream (итерация 3)

**Ветка:** `fix/stage-suggest-empty-agent-stream`  
**База:** `main` (после merge PR #836)  
**Тип:** fix  
**Заголовок:** `fix(llm): suggest не теряет предложения в JSON-обёртках; инструментирование + диагностика agent-сервиса`

## Root cause (итерация 3)

После мержа PR #836 на stage:

1. **suggest → пустой результат** (D4). Парсер `backend/app/ai/product_actions_suggest.py` умел снимать code-fences и чинить обрезанный JSON, но `normalize_product_action_suggestions_response` ожидала только ключ `suggestions`. При `json_mode=True` / `response_format: json_object` LLM может вернуть массив в обёртке `{"actions": [...]}`, `{"items": [...]}`, `{"results": [...]}`, `{"data": [...]}` — и предложения молча терялись. Отсутствовала диагностика: не было видно, сколько шагов ушло, какой провайдер/модель ответил, сколько элементов распарсилось и сколько выжило.
2. **processman всё ещё падает** (D2). Пользователь сообщает, что фикс #836 в `backend/services/agent/` на stage не наблюдается. Возможные причины: stale-образ агент-сервиса или провайдер `processman_agent` всё ещё прибит к VVPROXY `claude-opus-4-6`. Нужна runtime-верификация задеплоенного commit'а и provider/model в SSE-ошибках.
3. **Латентность suggest ~47,5 с** (D3). Primary-провайдер VVPROXY таймаутится 30 с, затем deepseek генерирует. Требуется конфигурационное переключение приоритетов в `/admin/llm` (не код).

## Что изменено

### D4 — парсер обёрток + инструментирование suggest

- `backend/app/ai/product_actions_suggest.py`:
  - `_extract_suggestions_array` извлекает массив предложений из ключей `suggestions`, `actions`, `items`, `results`, `data`.
  - `normalize_product_action_suggestions_response` использует этот экстрактор.
- `backend/app/routers/product_actions_ai.py`:
  - Инструментирование каждого вызова: `steps_sent`, `provider_id`, `model`, `raw_len`, `parsed_count`, `selected_count`, `kept_count`, `drop_reasons`.
  - Диагностика пишется в execution log (`usage`) и возвращается в `diagnostics` успешного ответа.
  - Различимые коды ошибок для пустого результата:
    - `AI_SUGGEST_NO_STEPS` — в сессии нет шагов (ранний возврат без вызова LLM).
    - `AI_SUGGEST_LLM_EMPTY` — LLM вернул пустой список.
    - `AI_SUGGEST_ALL_INVALID` — все предложения отбракованы.
  - Ранний возврат `AI_SUGGEST_NO_STEPS`, если в контексте 0 шагов.
- `frontend/src/features/process/analysis/ProductActionSuggestionsPanel.jsx` + `frontend/src/shared/i18n/ru.js`:
  - Добавлены коды ошибок и человекочитаемые сообщения для новых `AI_SUGGEST_*` кодов.

### D2 — диагностика agent-сервиса

- `backend/services/agent/routers/health.py`:
  - Новый endpoint `/version` с `build_id`, `build_time`, `build_branch`, `build_env`, `git_commit`.
- `backend/services/agent/gateway/gateway.py`:
  - В error-событие `complete_stream()` добавлены `provider_id` и `model` последнего attempted-провайдера.
- `backend/services/agent/memory/chat.py`:
  - При `stream_error` логируется `session_id`, `provider_id`, `model`, `status`, `error`.
  - Error-событие передаёт `provider_id`/`model` в SSE.
- `backend/services/agent/routers/agent_stream.py`:
  - Логирование SSE error-событий с `provider_id`/`model`.
  - Логирование необработанных исключений потока.

### D3 — конфигурация

- Оставлена рекомендация из #836: для org `8b89c83ea810` в `/admin/llm` поднять приоритет `deepseek-main` над VVPROXY для фич `product_actions_suggest` и `processman_agent`. Код не меняет конфигурацию.

## Тесты

- `backend/tests/test_product_actions_suggest_v2.py` — добавлены:
  - `test_parse_actions_wrapper_response`
  - `test_parse_items_wrapper_response`
  - `test_parse_empty_array_response`
- `backend/tests/test_product_actions_ai_suggest.py` — добавлены/обновлены:
  - `test_success_response_includes_diagnostics_block`
  - `test_empty_suggestions_no_steps_returns_distinct_error`
  - `test_empty_suggestions_llm_empty_returns_distinct_error`
  - `test_llm_response_wrapped_in_actions_key_is_parsed`
- `backend/services/agent/tests/test_health.py` — добавлен:
  - `test_version_returns_build_metadata`
- `backend/services/agent/tests/test_streaming.py` — добавлен:
  - `test_stream_gateway_error_includes_provider_and_model`

### Pre-existing

- `backend/tests/test_llm_gateway.py::test_effective_providers_with_key_prefers_org_then_org_default` падает из-за загрязнения dev-БД предыдущими прогонами. Вне скоупа этого контура.
- `frontend/src/features/process/analysis/...NotesPanel.advanced-badge-semantics.test.mjs` — pre-existing, не трогаем.

## Stage-верификация (после мержа пользователем)

- [ ] `/agent/version` (или прямой хит к agent-сервису) возвращает commit из PR #836/итерации 3.
- [ ] suggest на сессии `e9dd18bcbe` возвращает непустой список валидных предложений (скрин + Network + execution log).
- [ ] Execution log /admin/llm для suggest показывает `provider_id`, `model`, `parsed_count`, `kept_count`.
- [ ] processman отвечает содержательно; SSE-ошибка (если есть) содержит `provider_id`/`model`.
- [ ] В /admin/llm «Модули» проверить привязку `product_actions_suggest`/`processman_agent`; при необходимости переставить приоритеты (решение пользователя).

## Merge/deploy

- **Merge и deploy выполняет пользователь вручно.**
- После merge требуется проверка на stage.
