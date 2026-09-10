# REVIEW_REPORT — fix/llm-gateway-error-sanitization

- **Reviewer:** Agent 3 (независимая верификация, READ → VERIFY)
- **Ветка:** `fix/llm-gateway-error-sanitization`, HEAD `07893152` (1 коммит поверх `origin/main 3defec22`)
- **Вердикт:** **REQUEST_CHANGES**
- **Дата:** 2026-09-10

## Суть вердикта

Заявленные пути контура закрыты корректно, тесты зелёные, контракт не сломан. Однако
собственный grep обнаружил **два живых пользовательских LLM-endpoint'а, которые утекают
тем же классом инфра-URL** (S1 не закрыт по цели «все LLM-пути»), плюс утверждение
«детали остаются в логах» неверно для не-stream gateway-путей — диагностика потеряна
без компенсирующего логирования.

---

## Блокирующие замечания (REQUEST_CHANGES)

### R1. `POST /api/sessions/{id}/ai/questions` — утекает URL upstream любому авторизованному пользователю

- **Файлы:** `backend/app/ai_questions.py:510` и `backend/app/ai_questions.py:597`
  (`{"error": f"deepseek failed: {e}"}` + `error_message=str(e)`), также `:514`/`:601`.
- **Путь serving:** `routers/sessions.py:148` → `services/session_service.py:943-946`
  (`_lm.ai_questions`) → facade `app/ai_questions.py`. Роут НЕ в `AUTH_PUBLIC_PATHS`
  (проверено `startup/middleware.py:59`), т.е. доступен любому аутентифицированному
  пользователю. Это не админ-эндпоинт — обоснование «админу нужна диагностика» здесь
  неприменимо.
- **Механика утечки:** этот путь идёт НЕ через gateway, а напрямую:
  `deepseek_questions._deepseek_chat_json` → `llm_http_client._deepseek_chat_request`
  → `r.raise_for_status()` бросает `requests.HTTPError` с текстом
  `403 Client Error: … for url: https://<base_url>/v1/chat/completions`.
  Динамический пруф в контейнере `processmap_v1-api` (read-only mount):
  ```
  HTTPError text: 403 Client Error: None for url: https://vvchat.vkusvill.ru/red-mad-router/v1/chat/completions
  formatted as served: deepseek failed: 403 Client Error: None for url: https://vvchat.vkusvill.ru/red-mad-router/v1/chat/completions
  ```
  `ReadTimeout` аналогично тащит `HTTPSConnectionPool(host='vvchat.vkusvill.ru', …)`.
- **Требуемая правка:** применить `sanitize_llm_error("error", …)` (или тот же
  generic-текст) к тексту ошибки в обоих `except`-блоках; сырой текст — в
  `logger.warning`. Добавить тест в `test_llm_error_sanitization.py` на этот endpoint.

### R2. `POST /api/llm/session-title/questions` — та же утечка

- **Файл:** `backend/app/_legacy_main.py:3758` — `return {"error": f"deepseek failed: {e}"}`.
- **Путь serving:** endpoint определён на legacy-app, который сам не является ASGI-целью
  (`docker-entrypoint.sh:50` → `uvicorn backend.app.main:app`), НО он отдаётся через
  system-router: `routers/system.py:13` (`_SYSTEM_EXACT`) → `routers/_shared.py build_router`
  → `iter_legacy_routes()`. Проверено: путь в белом списке системного роутера, serving — есть.
- **Требуемая правка:** аналогично R1.

### R3. Утверждение «детали остаются в логах» неверно для gateway-путей — диагностика потеряна

- **Файлы:** `backend/app/ai/gateway.py:190→228` (last_error → sanitize → `_finish`,
  без единого `logger.*`); `backend/services/agent/gateway/gateway.py:205→240` и
  `:456→475` — то же.
- **Evidence:** `grep -n "last_error\|logger\."` — в обоих gateway ни одного логирования
  `last_error` ни до, ни после патча. `llm_usage` пишет только `status="error"`.
  Итог: сырые детали сбоя (класс ошибки, текст провайдера) после патча **нигде не
  сохраняются** — ни пользователю (верно), ни в логи (диагностический регресс).
  CHANGES.md («Детали ошибки сохраняются в серверных логах…») и docstring
  `error_sanitize.py` («там всё сохраняется») этому противоречат.
- **Требуемая правка:** добавить `logger.warning("llm gateway chain failed: %s", last_error)`
  (и в stream-ветку сервиса) до санитизации; поправить формулировку в CHANGES.md.

---

## Проверенные пункты (подтверждено)

1. **git/diff** — патч минимальный, 16 файлов, всё в контуре; лишних изменений нет.
   Serving-цель: `uvicorn backend.app.main:app` (Dockerfile entrypoint), код = worktree.
2. **Единый helper + копия** — копия оправдана: `backend/services/agent/tests/test_no_monolith_imports.py`
   реально существует и запрещает `app`/`backend` imports (AST-проверка всех .py сервиса).
   Тела `sanitize_llm_error` и `GENERIC_LLM_ERROR` в обоих файлах идентичны
   (`diff` показывает расхождение только в docstring — осознанно). Guard пройден: 2 passed.
3. **Заявленные пути закрыты** — собственный grep подтверждает:
   - монолит: `gateway.py` (complete/цепочка), `agent/chat.py:197`,
     `ai/process_analysis.py`, `ai/schema_assistant.py::_not_ok` (LLM3),
     `ai/llm_internal_client.py::_error_result` — все санитизируют `status="error"`;
   - сервис: `gateway/gateway.py` (complete + complete_stream), `memory/chat.py`
     (`_gateway_error_out`, обе stream-ветки), `routers/agent_stream.py` catch-all —
     закрыты, сырый текст в stream-ветках остаётся в `logger.warning`.
   - транзитивно закрыты: `product_actions_ai.py` (gateway error уже generic +
     собственный `_safe_error_message` редактит api_key/base_url),
     `agent_analysis/processor.py` (использует gateway `complete`).
   - `deepseek_questions.py:1296` `str(exc)` — только в `_report_debug_log`, re-raise. OK.
4. **Контракт** — HTTP 200 + `ok=false`, формат `[error] …` сохранён
   (тестом `test_chat_endpoint_error_sanitized`: `body["message"] == f"[error] {GENERIC_LLM_ERROR}"`).
   Generic-текст адекватный, на русском (соответствует захардкоженным текстам модулей).
   Non-error статусы (`disabled`, `no_provider`) не тронуты — тестами подтверждено.
5. **Admin «Проверить» — обоснование ПРИНЯТО.** `routers/admin_llm.py:168` gated
   `_platform_admin_context` (platform admin, 403 иначе); тот же админ видит `base_url`
   провайдера в `GET /api/admin/llm/providers` (`mask_provider`, строка 96). URL в ошибке
   = его собственный сконфигурированный `base_url`; диагностика 401/403/таймаута ему же и
   нужна. Прецедент существовал (`verify_llm_settings`-паттерн, `routers/admin.py:919-927`).
6. **Тесты — перезапущены независимо** (docker run --rm, read-only mount, стек не мутировал):
   - монолит `test_llm_error_sanitization.py` (sqlite): **8 passed**;
   - монолит `test_admin_llm_api.py` (postgres, dev-БД): **19 passed** (включая расширенный
     `test_no_secret_in_any_llm_endpoint` — покрывает инфра-формы ключа: `https://{key}@`,
     `http://{key}@`, `Bearer {key}`, `://{key}`, середина ключа; sanctioned `key_last4`
     не изменён);
   - agent-сервис `test_error_sanitization.py`: **4 passed**;
   - agent-сервис полный suite: **144 passed** (2 deselected — `test_measurement_baseline`,
     пре-существующий дрейф, подтверждён исполнителем прогоном на чистом main);
   - agent `test_no_monolith_imports.py`: **2 passed**.
7. **Артефакты** — CHANGES.md/TESTS.md согласованы с кодом по закрытым пунктам;
   STATE.json `head=0f00d09d` ≠ фактический `07893152`, но
   `git diff 0f00d09d 07893152` показывает расхождение **только в самой строке head**
   STATE.json — код идентичен. Косметика, не блокирует (исправить при следующем amend).

## Информационно (вне обязательных правок)

- **Path-report generation** (`_legacy_main.py:1548,1555`): `f"deepseek failed: {error}"`
  пишется в `report_versions.error_message` в БД. Эти роуты на serving-app не
  смонтированы (в `routers/` нет `paths/{path_id}/reports`; system-router покрывает
  только exact `/api/llm/session-title/questions` + auth/invite/settings-префиксы) —
  утечка недостижима из текущего runtime. Рекомендую зафиксировать в S1-followup,
  чтобы не потерялось при реанимации legacy-роутов.
- `routers/agent_resume.py:156,159` (`str(exc)` в SSE error) — доменные конфликты
  ревизий/статусов, не LLM-провайдер. Вне контура.

## Список правок для исполнителя (не вносил — ревью только)

1. `backend/app/ai_questions.py:510,597` (+`:514,:601`) — sanitize текста ошибки
   (`sanitize_llm_error("error", …)` из `app.ai.error_sanitize`), сырой текст → `logger.warning`;
   тест на утечку в ответе `/api/sessions/{id}/ai/questions`.
2. `backend/app/_legacy_main.py:3758` — sanitize, тот же helper (legacy-модуль может
   импортировать `app.*` — ограничение только для services/agent).
3. `backend/app/ai/gateway.py` и `backend/services/agent/gateway/gateway.py` — добавить
   `logger.warning` с сырым `last_error` в ветках полного отказа цепочки; привести
   формулировки в CHANGES.md/docstring в соответствие.
4. STATE.json: обновить `head` при финальном amend.
