# TESTS — fix/stage-ai-parse-stream-failover

## Запуск

### Backend (монолит)

```bash
cd server-backup/opt/processmap-test-worktrees/fix-stage-ai-parse-stream-failover
docker run --rm \
  -v "$PWD/backend:/app/backend" \
  -w /app \
  --network processmap_v1_default \
  -e E2_TEST_DATABASE_URL=postgresql://fpc:fpc@postgres:5432/processmap \
  -e DATABASE_URL=postgresql://fpc:fpc@postgres:5432/processmap \
  -e FPC_DB_BACKEND=postgres \
  processmap_v1-api:latest bash -c \
  "pip install --quiet pytest fakeredis httpx psycopg && python -m pytest backend/tests/test_product_actions_suggest_v2.py backend/tests/test_llm_gateway.py -q"
```

Результат:
- `test_product_actions_suggest_v2.py`: 9 passed
- `test_llm_gateway.py`: 18 passed, 1 pre-existing failure

### Agent service

```bash
cd server-backup/opt/processmap-test-worktrees/fix-stage-ai-parse-stream-failover/backend/services/agent
docker run --rm \
  -v "$PWD:/app" \
  -w /app \
  processmap_v1-agent:latest bash -c \
  "pip install --quiet pytest && python -m pytest tests/test_gateway.py tests/test_internal_llm.py tests/test_streaming.py -q"
```

Результат:
- `test_gateway.py`: 4 passed
- `test_internal_llm.py`: 6 passed
- `test_streaming.py`: 3 passed

## Покрытие

### D1 — парсер suggest

| Тест | Что проверяет |
|------|---------------|
| `test_parse_markdown_fenced_response` | Ответ внутри ` ```json ... ``` ` + текст вокруг извлекается корректно. |
| `test_parse_text_around_json_response` | JSON посередине explanatory текста находится. |
| `test_parse_truncated_response_repairs_valid_prefix` | Обрезанный ответ чинится до валидного JSON-префикса. |
| `test_parse_invalid_json_raises_with_raw_content` | При полном отсутствии JSON бросается `ProductActionsAiResponseParseError` с `raw_content`. |
| `test_json_mode_passes_response_format` | `gateway.complete(..., json_mode=True)` передаёт `response_format: json_object` в HTTP-клиент. |

### D2 — failover в agent gateway

| Тест | Что проверяет |
|------|---------------|
| `test_timeout_fails_fast_to_backup_provider` (agent) | Таймаут primary → один вызов, затем backup; `fallback=True`. |
| `test_stream_timeout_fails_fast_to_backup_provider` | Тот же паттерн для `complete_stream`. |

### D3 — таймаут

| Код | Что проверяет |
|-----|---------------|
| `_PRODUCT_ACTIONS_LLM_KWARGS = {"json_mode": True, "timeout_sec": 30}` | suggest использует 30 с вместо 45 с. |

## Pre-existing failures

- `backend/tests/test_llm_gateway.py::test_effective_providers_with_key_prefers_org_then_org_default` — падает с `UniqueViolation` на `(org_default, default-p)` из-за загрязнения dev-БД предыдущими прогонами. Вне скоупа этого контура.
