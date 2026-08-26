# TESTS — fix/stage-json-mode-provider-capability (итерация 4)

## Запуск

### Backend (монолит)

```bash
cd processmap_v1_main_clone
.venv/bin/pytest backend/tests/test_product_actions_suggest_v2.py -q
.venv/bin/pytest backend/tests/test_product_actions_ai_suggest.py -q
.venv/bin/pytest backend/tests/test_llm_gateway.py -q
```

### Agent service

```bash
cd processmap_v1_main_clone/backend/services/agent
../../.venv/bin/python -m pytest tests/test_internal_llm.py tests/test_streaming.py tests/test_health.py -q
```

### Frontend

```bash
cd processmap_v1_main_clone/frontend
npm run build
node --test src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs
```

## Результаты (локально, 26.08)

| Suite | Результат | Примечание |
|-------|-----------|------------|
| `backend/tests/test_product_actions_suggest_v2.py` | 12 passed | — |
| `backend/tests/test_product_actions_ai_suggest.py` | 35 passed | — |
| `backend/tests/test_llm_gateway.py` | 20 passed, 1 failed | Pre-existing `test_effective_providers_with_key_prefers_org_then_org_default` — загрязнение dev-БД |
| `backend/services/agent/tests/test_internal_llm.py` | 7 passed | — |
| `backend/services/agent/tests/test_streaming.py` + `test_health.py` | 6 passed | — |
| `frontend` build | green | warnings по chunk size — pre-existing |
| `productActionSuggestionsPanel.error.test.mjs` | 4 passed | — |

## Покрытие

### D5 — capability-aware json_mode

| Тест | Что проверяет |
|------|---------------|
| `test_gateway_skips_json_mode_for_provider_without_capability` | Провайдер с `supports_json_mode=false` не получает `response_format`. |
| `test_gateway_uses_json_mode_when_provider_supports_it` | Провайдер с `supports_json_mode=true` получает `response_format: json_object`. |
| `test_gateway_defaults_json_mode_to_supported` | При отсутствии capabilities default = true. |
| `test_complete_propagates_json_mode_and_prompt_override` | Agent-сервис получает `json_mode` и `prompt_override` от монолита. |

### Repair-retry

| Тест | Что проверяет |
|------|---------------|
| `test_repair_retry_succeeds_for_non_json_mode_provider` | Non-json_mode провайдер → prose → repair-retry → валидный результат. |
| `test_repair_retry_failure_returns_parse_error_for_non_json_mode_provider` | Repair не справился → `AI_RESPONSE_PARSE_ERROR`. |
| `test_no_repair_retry_for_json_mode_provider_parse_error` | Json_mode провайдер → сразу parse error, без лишнего вызова. |

### Регрессионное покрытие

- `test_product_actions_ai_suggest.py` сохраняет существующие проверки: endpoint, batch, draft, rate limit, provider error, parse error diagnostics, selected step filter, duplicate detection, execution log sanitization.
- `test_product_actions_suggest_v2.py` сохраняет проверки v4 prompt, normalization, markdown fences, truncated JSON repair.

## Pre-existing failures

- `backend/tests/test_llm_gateway.py::test_effective_providers_with_key_prefers_org_then_org_default` — `UniqueViolation` на `(org_default, default-p)` из-за загрязнения dev-БД предыдущими прогонами. Вне скоупа этого контура.
