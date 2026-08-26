# TESTS — fix/stage-suggest-empty-agent-stream (итерация 3)

## Запуск

### Backend (монолит)

```bash
cd server-backup/opt/processmap-test-worktrees/fix-stage-suggest-empty-agent-stream
docker run --rm \
  -v "$PWD/backend:/app/backend" \
  -w /app \
  --network processmap_v1_default \
  -e E2_TEST_DATABASE_URL=postgresql://fpc:fpc@postgres:5432/processmap \
  -e DATABASE_URL=postgresql://fpc:fpc@postgres:5432/processmap \
  -e FPC_DB_BACKEND=postgres \
  processmap_v1-api:latest bash -c \
  "pip install --quiet pytest fakeredis httpx psycopg && python -m pytest backend/tests/test_product_actions_suggest_v2.py backend/tests/test_product_actions_ai_suggest.py -q"
```

Ожидаемый результат:
- `test_product_actions_suggest_v2.py`: все тесты passed.
- `test_product_actions_ai_suggest.py`: все тесты passed.

### Agent service

```bash
cd server-backup/opt/processmap-test-worktrees/fix-stage-suggest-empty-agent-stream/backend/services/agent
docker run --rm \
  -v "$PWD:/app" \
  -w /app \
  processmap_v1-agent:latest bash -c \
  "pip install --quiet pytest && python -m pytest tests/test_health.py tests/test_streaming.py -q"
```

Ожидаемый результат:
- `test_health.py`: все тесты passed.
- `test_streaming.py`: все тесты passed.

## Покрытие

### D4 — парсер обёрток и пустой результат

| Тест | Что проверяет |
|------|---------------|
| `test_parse_actions_wrapper_response` | Массив в ключе `actions` извлекается как предложения. |
| `test_parse_items_wrapper_response` | Массив в ключе `items` извлекается как предложения. |
| `test_parse_empty_array_response` | Пустой массив не ломает парсер. |
| `test_success_response_includes_diagnostics_block` | Успешный ответ содержит `diagnostics` с `steps_sent`, `provider_id`, `model`, `raw_len`, `parsed_count`, `kept_count`. |
| `test_empty_suggestions_no_steps_returns_distinct_error` | Если в сессии нет шагов — `AI_SUGGEST_NO_STEPS`, provider не вызывается. |
| `test_empty_suggestions_llm_empty_returns_distinct_error` | Если LLM вернул пустой список — `AI_SUGGEST_LLM_EMPTY` с диагностикой. |
| `test_llm_response_wrapped_in_actions_key_is_parsed` | End-to-end: gateway-ответ обёрнут в `actions` → suggest возвращает валидное предложение. |

### D2 — диагностика agent-сервиса

| Тест | Что проверяет |
|------|---------------|
| `test_version_returns_build_metadata` | `/version` возвращает `build_id`, `build_branch`, `build_time`, `build_env`, `git_commit`. |
| `test_stream_gateway_error_includes_provider_and_model` | SSE error-событие содержит `provider_id` и `model`. |

### Регрессионное покрытие

- `test_product_actions_ai_suggest.py` сохраняет существующие проверки: endpoint, batch, draft, rate limit, provider error, parse error, selected step filter, duplicate detection, execution log sanitization.
- `test_product_actions_suggest_v2.py` сохраняет проверки v4 prompt, normalization, markdown fences, truncated JSON repair.

## Pre-existing failures

- `backend/tests/test_llm_gateway.py::test_effective_providers_with_key_prefers_org_then_org_default` — падает с `UniqueViolation` на `(org_default, default-p)` из-за загрязнения dev-БД предыдущими прогонами. Вне скоупа этого контура.
- `frontend/src/features/process/analysis/...NotesPanel.advanced-badge-semantics.test.mjs` — pre-existing, не трогаем.
