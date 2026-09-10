# Тесты контура fix/llm-gateway-error-sanitization

## Добавлено

- `backend/tests/test_llm_error_sanitization.py` (монолит, 8 тестов):
  - `test_gateway_http_error_sanitized` — mock `requests.HTTPError` с URL роутера → `gateway.complete` отдаёт generic;
  - `test_gateway_timeout_error_sanitized` — `ReadTimeout` с `host='…'` → generic;
  - `test_gateway_non_error_statuses_unchanged` — `no_provider` без изменений (контракт);
  - `test_internal_client_connectivity_error_sanitized` — недоступность agent-svc → generic;
  - `test_chat_endpoint_error_sanitized` — `/api/sessions/{id}/agent/chat` не содержит URL/host/путь роутера (regex-список `INFRA_FRAGMENTS`);
  - `test_chat_endpoint_disabled_status_unchanged` — статус `disabled` без изменений;
  - `test_schema_assistant_error_sanitized` — `/llm/suggest-next` (LLM3) sanitized;
  - `test_process_analysis_error_sanitized` — `/llm/analysis` (LLM1) sanitized.
- `backend/services/agent/tests/test_error_sanitization.py` (agent-сервис, 4 теста):
  - gateway `complete` / `complete_stream` (SSE error-событие, provider_id/model сохраняются) sanitized;
  - `memory.chat._gateway_error_out` sanitized; non-error статус без изменений.
- `backend/tests/test_admin_llm_api.py::test_no_secret_in_any_llm_endpoint` — расширен
  инфра-формами утечки ключа: `https://{key}@`, `http://{key}@`, `Bearer {key}`, `://{key}`,
  середина ключа. Существующие ассерты (включая sanctioned `key_last4`) не изменены.

## Команды прогона

Изолированный docker-run поверх образов существующего локального стека
(общий стек НЕ мутировался: `--rm`, read-only mount кода, никаких restart/build):

```bash
# монолит (sqlite-изоляция из conftest)
docker run --rm -e FPC_DB_BACKEND=sqlite -e DATABASE_URL= -e CELERY_TASK_ALWAYS_EAGER=1 \
  -v "$PWD/backend:/app/backend" -w /app/backend processmap_v1-api \
  sh -c "pip install -q -r requirements-dev.txt; python -m pytest <tests> -q"

# тесты, требующие dev-Postgres (сеть compose-стека, dev-БД)
docker run --rm --network processmap_v1_default \
  -e E2_TEST_DATABASE_URL=postgresql://fpc:fpc@processmap_v1-postgres-1:5432/processmap \
  -e DATABASE_URL=postgresql://fpc:fpc@processmap_v1-postgres-1:5432/processmap \
  -e FPC_DB_BACKEND=postgres -v "$PWD/backend:/app/backend" -w /app/backend \
  processmap_v1-api sh -c "pip install -q -r requirements-dev.txt; python -m pytest <tests> -q"

# agent-сервис
docker run --rm -v "$PWD/backend/services/agent:/app" -w /app processmap_v1-agent \
  sh -c "pip install -q pytest==9.1.1 fakeredis; python -m pytest tests -q"
```

## RED → GREEN

RED (до фикса, код тестов на чистом origin/main через `git stash`):
- монолит: **6 failed** (`gateway_http_error`, `gateway_timeout_error`, `internal_client_connectivity_error`,
  `chat_endpoint_error`, `schema_assistant_error`, `process_analysis_error`) — все ровно на ассертах
  утечки URL (`assert 'deepseek: HTTPError: … https://vvchat.vkusvill.ru/red-mad-router/…' == generic`);
  2 passed (non-error статусы).
- agent-сервис: **3 failed** (`gateway_complete_error`, `gateway_stream_error`, `gateway_error_out`) по той же причине.

GREEN (после фикса):
- монолит: `test_llm_error_sanitization.py` — **8 passed**.
- agent-сервис: `tests/test_error_sanitization.py` — **4 passed**.

## Итерация 2 — REQUEST_CHANGES ревью (R1–R3)

Добавлено (TDD, RED→GREEN):
- `test_ai_questions_error_sanitized` — `POST /api/sessions/{id}/ai/questions` (strict): HTTPError с URL → generic.
- `test_ai_questions_node_step_error_sanitized` — та же ветка `node_step` (`generate_llm_questions_for_node`).
- `test_session_title_questions_error_sanitized` — `POST /api/llm/session-title/questions` (system-router).
- `test_gateway_logs_raw_error` (монолит, caplog) — полный отказ цепочки логирует сырой `last_error` с URL.
- `test_gateway_logs_raw_error` + `test_gateway_stream_logs_raw_error` (agent-сервис, caplog) — то же для complete/complete_stream.

RED (патч откачен точечно через `git stash push <файл>`):
- монолит: **4 failed** (`ai_questions` strict, `ai_questions` node_step, `session_title`,
  `gateway_logs_raw_error`) — все ровно на ассертах утечки URL / отсутствия raw-лога.
- agent-сервис: **2 failed** (`logs_raw` × 2 — caplog пуст).

GREEN (после правок R1–R3):
- монолит: `test_llm_error_sanitization.py` — **12 passed**.
- agent-сервис: `tests/test_error_sanitization.py` — **6 passed**.

## Регрессия (после фикса)

| Набор | Результат |
|---|---|
| `test_agent_chat_contract.py test_agent_chat_integration.py test_llm_provider_resolution.py test_product_actions_ai_suggest.py` | 48 passed |
| `test_ai_execution_log_foundation.py test_ai_prompt_registry_foundation.py test_ai_questions_timeout.py test_agent_memory.py test_agent_projection.py` | 23 passed |
| `test_llm_process_analysis.py test_llm_schema_assistant.py` (sqlite) | 20 passed (11 errors у `test_llm_status_api.py` — требует Postgres, перегнан отдельно) |
| `test_llm_status_api.py` (postgres) | passed (в составе набора ниже) |
| `test_admin_llm_api.py` (postgres, dev-БД) | **19 passed** (включая расширенный `test_no_secret_in_any_llm_endpoint`) |
| agent-сервис `tests` (полный suite) | **144 passed, 1 skipped** |

## Регрессия итерации 2 (после R1–R3)

| Набор | Результат |
|---|---|
| `test_ai_questions_runtime_logging.py test_ai_questions_step_sync.py test_ai_questions_timeout.py test_session_title_questions.py test_llm_provider_resolution.py test_llm_schema_assistant.py test_llm_process_analysis.py` | **36 passed** |
| `test_agent_chat_contract.py test_agent_chat_integration.py` | **9 passed** |
| agent-сервис `tests` (полный suite, deselect пре-существующего `test_measurement_baseline`) | **146 passed, 1 skipped** |

## Пре-существующие падения НЕ по контуру (подтверждены прогоном на чистом origin/main через `git stash`)

- `backend/tests/test_deepseek_retry.py` — 3 failed (`test_does_not_retry_on_unauthorized_http_error`,
  `test_retries_on_chunked_encoding_error_then_succeeds`, `test_retries_on_read_timeout_then_succeeds`);
  дрейф версий requests/urllib3 в образе.
- `backend/services/agent/tests/test_measurement_baseline.py::test_baseline_measurement` — TypeError:
  тестовый `_primary_promptbuilder_patch` не принимает kwarg `conversation_summary`, который production
  `PromptBuilder.build` передаёт (дрейф теста и кода на main).
- `backend/tests/test_process_analysis_session_api.py` — 6 failed и на чистом main (зависимость от
  состояния dev-БД/сидов, вне контура).
