# PR — fix/stage-json-mode-provider-capability (итерация 4)

**Ветка:** `fix/stage-json-mode-provider-capability`
**База:** `main` (после merge PR #838)
**Тип:** fix
**Заголовок:** `fix(llm): json_mode зависит от capability провайдера; repair-retry для non-json_mode`

## Root cause

После итераций 1–3 на stage осталось два режима отказа `suggest`:

1. **Сессия «ВЫВЫВ» (~19:38)** — `AI_RESPONSE_PARSE_ERROR`. Провайдер VVPROXY (`claude-opus-4-6`) не поддерживает OpenAI-style `response_format: json_object`; модель возвращает prose/markdown, парсер падает.
2. **Сессия «еkеkе` (~18:11)** — пустой список предложений от deepseek-main. `json_mode` работает (валидный JSON), но список пуст.

Главный дефект: шлюз не учитывал per-provider capability `supports_json_mode` и передавал `response_format` всем провайдерам, запрошенным через `json_mode=True`.

## Что изменено

### Capability-aware json_mode

- `backend/alembic/versions/031_llm_provider_capabilities.py` — добавляет `llm_providers.capabilities TEXT NOT NULL DEFAULT '{}'`.
- `backend/app/ai/llm_store.py`:
  - `_parse_capabilities`, `provider_capabilities`, `provider_supports_json_mode`.
  - Default `supports_json_mode: true` для обратной совместимости.
  - `create_provider` / `update_provider` / `mask_provider` поддерживают `capabilities`.
- `backend/app/routers/admin_llm.py` — `LlmProviderBody` / `LlmProviderPatchBody` принимают `capabilities`.
- `backend/app/ai/gateway.py`:
  - `json_mode_used = json_mode and provider_supports_json_mode(provider)`.
  - `response_format: json_object` передаётся только при `json_mode_used=True`.
  - Возвращает `json_mode_used` в результате.
  - `prompt_override` позволяет caller подменить system/template/max_tokens.
- `backend/services/agent/gateway/gateway.py` и `backend/services/agent/gateway/llm_store.py` — синхронизированы с монолитом.
- `backend/app/ai/llm_internal_client.py` и `backend/services/agent/routers/internal_llm.py` — проброс `json_mode` и `prompt_override` в agent-сервис.

### Repair-retry для non-json_mode провайдеров

- `backend/app/ai/product_actions_suggest.py` — добавлен константный `PRODUCT_ACTIONS_SUGGEST_REPAIR_PROMPT_TEMPLATE`.
- `backend/app/routers/product_actions_ai.py::_call_product_actions_llm`:
  - При `ProductActionsAiResponseParseError` и `json_mode_used=False` делает один повторный вызов с `prompt_override`.
  - При неудаче repair — `AI_RESPONSE_PARSE_ERROR` с диагностикой и `raw_content` первого ответа.
  - При `json_mode_used=True` repair не делается (провайдер обязан вернуть валидный JSON).

## Тесты

- `backend/tests/test_llm_gateway.py` — добавлены:
  - `test_gateway_skips_json_mode_for_provider_without_capability`
  - `test_gateway_uses_json_mode_when_provider_supports_it`
  - `test_gateway_defaults_json_mode_to_supported`
- `backend/tests/test_product_actions_ai_suggest.py` — добавлены:
  - `test_repair_retry_succeeds_for_non_json_mode_provider`
  - `test_repair_retry_failure_returns_parse_error_for_non_json_mode_provider`
  - `test_no_repair_retry_for_json_mode_provider_parse_error`
- `backend/services/agent/tests/test_internal_llm.py` — добавлен:
  - `test_complete_propagates_json_mode_and_prompt_override`

### Pre-existing

- `backend/tests/test_llm_gateway.py::test_effective_providers_with_key_prefers_org_then_org_default` падает из-за загрязнения dev-БД предыдущими прогонами. Вне скоупа этого контура.

## Результаты прогонов (локально)

- `backend/tests/test_product_actions_suggest_v2.py`: 12 passed.
- `backend/tests/test_product_actions_ai_suggest.py`: 35 passed.
- `backend/tests/test_llm_gateway.py`: 20 passed, 1 pre-existing failed.
- `backend/services/agent/tests/test_internal_llm.py`: 7 passed.
- `backend/services/agent/tests/test_streaming.py` + `test_health.py`: 6 passed.
- `frontend`: `npm run build` green; `node --test src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs`: 4 passed.

## Конфигурация провайдеров

**Текущие приоритеты и capability (рекомендация, не изменение кода):**

- Для org `8b89c83ea810` рекомендуется:
  1. У VVPROXY-провайдера (`vvchat`) установить `capabilities: {"supports_json_mode": false}`.
  2. Поднять приоритет `deepseek-main` выше VVPROXY для фич `product_actions_suggest` и `processman_agent`.
- Это конфигурационное действие выполняется пользователем в `/admin/llm`; код не меняет приоритеты.

## Stage-верификация (после мержа пользователем)

- [ ] Execution log /admin/llm подтверждает матрицу: VVPROXY → parse error (без json_mode), deepseek → валидный JSON.
- [ ] suggest на сессиях «ВЫВЫВ» и «еkеkе` возвращает непустой список валидных предложений с `action_text` и 4 тегами.
- [ ] processman отвечает содержательно; SSE-ошибка (если есть) содержит `provider_id`/`model`.
- [ ] `/admin/llm` показывает capability `supports_json_mode` для каждого провайдера.

## Merge/deploy

- **Merge и deploy выполняет пользователь вручно.**
- После merge требуется проверка на stage и, при необходимости, перестановка приоритетов провайдеров / установка capability.
