# PR — fix/stage-ai-parse-stream-failover (итерация 2)

**Ветка:** `fix/stage-ai-parse-stream-failover`  
**База:** `main` (`ecd12b51`, merge PR #835)  
**Тип:** fix  
**Заголовок:** `fix(llm): толерантный парсер suggest, failover processman, таймаут 30с`

## Root cause (итерация 2)

После мержа PR #835 на stage:

1. **suggest → `AI_RESPONSE_PARSE_ERROR`** (D1). Парсер `backend/app/ai/product_actions_suggest.py::parse_product_actions_suggestions` использовал слабый `_extract_json_candidate` из `deepseek_questions.py`: не справлялся с markdown-обёртками, текстом вокруг JSON, обрезанным JSON при `max_tokens`. После failover на `deepseek-main` ответ мог приходить в «грязном» виде — и падал с parse error.
2. **processman → ошибка в SSE** (D2). Агентский gateway (`backend/services/agent/gateway/`) — копия монолитного gateway — не получил фикс #835. При таймауте VVPROXY streaming-клиент делал 2 retry (~90 с) вместо быстрого failover на backup-провайдера.
3. **suggest ~1,5 мин** (D3). После #835 retry убран, но per-attempt таймаут остался 45 с: VVPROXY таймаутится 45 с + deepseek генерирует ~45 с ≈ 90 с.

## Что изменено

### D1 — толерантный парсер + structured output

- `backend/app/ai/product_actions_suggest.py`:
  - Новый `_extract_json_candidate_robust`: strip fences, первый валидный JSON-блок, repair обрезанного JSON.
  - `parse_product_actions_suggestions` использует его и сохраняет больше контекста в `raw_content`.
- `backend/app/ai/llm_http_client.py`:
  - Параметр `response_format` для провайдеров, поддерживающих `json_object`.
- `backend/app/ai/gateway.py`:
  - Параметр `json_mode`; при `json_mode=True` отправляет `response_format: {"type": "json_object"}`.
- `backend/app/ai/llm_internal_client.py` + `backend/services/agent/routers/internal_llm.py`:
  - Проброс `json_mode` в agent-service.
- `backend/app/routers/product_actions_ai.py`:
  - `_PRODUCT_ACTIONS_LLM_KWARGS = {"json_mode": True, "timeout_sec": 30}`; используется в `_call_product_actions_llm`.

### D2 — failover в агентском gateway

- `backend/services/agent/gateway/llm_http_client.py`:
  - `_deepseek_chat_request` и `_deepseek_chat_request_stream` получили `retry_on_timeout` (default `True`).
  - `_deepseek_chat_request` получил `response_format`.
- `backend/services/agent/gateway/gateway.py`:
  - `complete()` и `complete_stream()` передают `retry_on_timeout=False`.
  - При `Timeout`/`ConnectionError` — сразу failover на следующего провайдера (как в #835).
  - `json_mode` прокинут в оба метода.

### D3 — латентность

- `backend/app/routers/product_actions_ai.py`:
  - `timeout_sec` для suggest снижен с 45 до 30 с (равно processman и дефолту gateway).
- В PR.md задокументирована рекомендация по конфигу шлюза: для org `8b89c83ea810` поднять приоритет `deepseek-main` над VVPROXY для фич `product_actions_suggest`/`processman_agent`, чтобы первичный вызов шёл сразу к работающему провайдеру.

## Тесты

- `backend/tests/test_product_actions_suggest_v2.py` — 9 passed:
  - `test_parse_markdown_fenced_response`
  - `test_parse_text_around_json_response`
  - `test_parse_truncated_response_repairs_valid_prefix`
  - `test_parse_invalid_json_raises_with_raw_content`
- `backend/tests/test_llm_gateway.py`:
  - `test_timeout_fails_fast_to_backup_provider` ✅
  - `test_json_mode_passes_response_format` ✅
- `backend/services/agent/tests/test_gateway.py` — 4 passed:
  - `test_timeout_fails_fast_to_backup_provider` ✅
  - `test_stream_timeout_fails_fast_to_backup_provider` ✅
- `backend/services/agent/tests/test_internal_llm.py` — 6 passed ✅
- `backend/services/agent/tests/test_streaming.py` — 3 passed ✅

### Pre-existing

- `backend/tests/test_llm_gateway.py::test_effective_providers_with_key_prefers_org_then_org_default` падает из-за загрязнения org_default в dev-БД (создаёт `default-p`, который не удалился в предыдущих прогонах). Не относится к этому контуру.
- `frontend/src/features/process/analysis/...NotesPanel.advanced-badge-semantics.test.mjs` — pre-existing, не трогаем.

## Stage-верификация (после мержа пользователем)

- [ ] suggest генерирует предложения без `AI_RESPONSE_PARSE_ERROR`.
- [ ] processman отвечает содержательно на вопрос по шагу.
- [ ] Execution log /admin/llm показывает provider/model; fallback на deepseek при необходимости.
- [ ] suggest отвечает предсказуемо (цель ≤ 60 с после снижения таймаута; лучше — после перестановки приоритетов в шлюзе).

## Merge/deploy

- **Merge и deploy выполняет пользователь вручно.**
- После merge требуется проверка на stage.
