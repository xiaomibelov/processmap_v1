# AGENT acceptance fixes — приёмочный протокол

Контур: `fix/agent-acceptance`  
Цель: закрыть три дефекта из e2e-приёмки AGENT-1/3 на processmap.ru.

## Исправления в коде

### Баг A — FK violation при rename
- **Файл:** `backend/services/agent/memory/chat.py`
- **Что изменилось:** `_persist_assistant_turn` возвращает реальный
  `assistant_turn_id`; `create_pending_edit` получает именно его, а не
  фиктивный `stream_id`.
- **Тесты:** `backend/services/agent/tests/test_edit_stream.py`
  - `test_stream_edit_canvas_creates_pending_edit_with_real_turn_id`
  - `test_stream_edit_reject_updates_status`
  - `test_stream_edit_confirm_applies_plan`

### Баг B — «невидимый ключ» / org-скоуп провайдеров
- **Файлы:**
  - `backend/app/ai/llm_store.py` — `effective_providers_with_key`
  - `backend/services/agent/gateway/llm_store.py` — `effective_providers_with_key`
  - `backend/app/ai/gateway.py` — `_provider_chain`, fallback-флаг
  - `backend/services/agent/gateway/gateway.py` — `_provider_chain`, fallback-флаг
  - `backend/app/routers/llm_status.py` — `effective_provider`
- **Что изменилось:**
  - Цепочка провайдеров: org сессии → `org_default` fallback → env.
  - `/api/llm/status` показывает `effective_provider` и его `source`.
- **Тесты:**
  - `backend/tests/test_llm_gateway.py::test_org_default_fallback_for_org_without_provider`
  - `backend/tests/test_llm_status_api.py::test_configured_true_org_fallback_from_org_default`
  - `backend/services/agent/tests/test_gateway.py`

### Баг C — кэш только у роутера
- **Файлы:**
  - `backend/tests/test_llm_schema_assistant.py`
  - `backend/services/agent/tests/test_internal_llm.py`
  - `docs/agent/REQUEST_FLOW.md`
- **Что изменилось:**
  - Добавлен тест, что повторный `suggest-next` на неизменной схеме даёт
    `cached=true`.
  - Добавлен тест, что `cache_digest` доезжает до сервисного gateway.
  - Зафиксировано: `processman_agent` не кэшируется by design.

## Приёмка на приёмочном окружении

Проверяемый критерий → артефакт → вердикт.

| Критерий | Артефакт | Вердикт | Дата |
|---|---|---|---|
| Свободный вопрос → SSE осмысленный ответ | Тело SSE, `llm_usage.model=deepseek-chat` | TBD | |
| «Объяснить шаг» — регрессия | Ответ агента | TBD | |
| Router cache — повторный вопрос → cached=true | `llm_usage.cached=true`, 0 токенов | TBD | |
| Rename → карточка confirm → Reject | `agent_pending_edits.status=rejected` | TBD | |
| Rename → карточка confirm → Confirm | Шаг переименован в canvas | TBD | |
| Org без ключа + org_default с ключом → ответ есть | `llm_usage` с provider_id org_default | TBD | |
| V2-оверлеи отображаются | Скриншот | TBD | |
| Canvas-правки руками работают | Ручной smoke-test | TBD | |

## Контур `fix/admin-llm-org-scope`

Цель: дать platform-admin в `/admin/llm` явно выбирать org-скоуп провайдера
(текущая org / `org_default` общий), чтобы ключ переставал «привязываться
не к той организации».

### Изменения в коде

- **Backend:**
  - `backend/app/routers/admin_llm.py` — `POST/PATCH /api/admin/llm/providers`
    принимают `org_id`; `GET /api/admin/llm/providers` возвращает провайдеры
    текущей org + `org_default`; `audit_log` на создание и смену скоупа.
  - `backend/app/ai/llm_store.py` — `list_providers_by_orgs(org_ids)`,
    `update_provider` разрешает менять `org_id`.
- **Frontend:**
  - `frontend/src/features/admin/llm/LlmProvidersPanel.jsx` — селект
    «Org-скоуп» с загрузкой списка org через `apiAdminListOrgs` / fallback
    на `useAuth().orgs`.
  - `frontend/src/lib/apiModules/adminApi.js` — `org_id` пробрасывается в
    `createProvider` / `patchProvider`.
  - `frontend/src/features/admin/llm/i18n/ru.js` и `en.js` — строки
    `providers.form.orgScope`, `providers.orgOption.orgDefault`.
  - `frontend/src/features/admin/pages/AdminLlmPage.test.mjs` — моки
    `/api/auth/me` и `/api/admin/orgs`, `AuthProvider`.
- **Тесты:** `backend/tests/test_admin_llm_api.py` — 3 новых теста
  (explicit org_id, patch org_id + audit_log, list включает org_default).

### Приёмка на stage

| Критерий | Артефакт | Вердикт | Дата |
|---|---|---|---|
| В `/admin/llm` при создании провайдера есть селект org-скоупа (текущая org / org_default) | Скриншот / DOM | TBD | |
| Platform-admin создаёт провайдер VVPROXY для `org_default` через UI, ключ вводит владелец | Провайдер в списке с `org_id=org_default` | TBD | |
| Свободный вопрос в сессии `org_default` → SSE-ответ | Тело SSE, `llm_usage` | TBD | |
| `llm_usage.provider_id` указывает на org_default-провайдера | Запись `llm_usage` | TBD | |
| Router cache — повторный тот же вопрос → `cached=true`, 0 токенов | `llm_usage.cached=true` | TBD | |
| Регрессия `/admin/llm`: список, редактирование, тест провайдера работают | Ручной smoke-test | TBD | |

## Контур `fix/agent-org-context`

Цель: устранить `MonolithError projection 404` на stage для пользователей из
не-дефолтной org путём сквозного прокидывания `X-Org-Id`
(браузер → agent-сервис → монолит).

### Изменения в коде

- **Frontend:**
  - `frontend/src/lib/api.js` — `apiAgentStream` и `apiAgentResume` теперь
    ставят заголовок `X-Org-Id` из `getActiveOrgId()` (ручной `fetch`, не через
    `apiFetch`).
- **Backend (agent service):**
  - `backend/services/agent/runners/monolith_client.py` — все публичные
    функции принимают `org_id` keyword-only и передают `X-Org-Id` в монолит.
  - `backend/services/agent/runners/action_runners.py` — `run_suggest_next`,
    `run_explain_step`, `run_step_qa` и `_post_llm3` принимают и пробрасывают
    `org_id`.
  - `backend/services/agent/memory/context.py` и `schema_memory.py` —
    `get_projection(..., org_id=oid)`.
  - `backend/services/agent/memory/chat.py` — `org_id` протянут через
    `_run_action`, ветки `node_qa` / `suggest_next` / `doc_qa` / свободный ответ
    / `edit_canvas`, а также через `run_turn_stream`.
  - `backend/services/agent/edit/validator.py`, `planner.py`, `applier.py`,
    `routers/agent_resume.py` — `org_id` доезжает до `get_operation_catalog`,
    `create_bpmn_version_snapshot`, `get_session_graph`, `patch_session`,
    `get_session`.
- **Тесты:**
  - `backend/services/agent/tests/test_monolith_client.py` — инвариант:
    `_headers` содержит `X-Org-Id` и параметризованная проверка всех
    публичных функций `monolith_client`.
  - `frontend/src/lib/api.agent.test.mjs` — `apiAgentStream`/`apiAgentResume`
    отправляют `X-Org-Id`.

### Приёмка на stage

| Критерий | Артефакт | Вердикт | Дата |
|---|---|---|---|
| Пользователь из не-дефолтной org открывает сессию этой org | URL + DOM | TBD | |
| Свободный вопрос PROCESSMAN → `POST /agent/stream` 200/SSE, ответ осмысленный | Тело SSE, нет `MonolithError projection 404` в логах agent-сервиса | TBD | |
| «Переименовать шаг» → карточка pending edit появляется | DOM карточки + `agent_pending_edits` | TBD | |
| Confirm pending edit → `POST /agent/resume` 200/SSE, изменение применено | Canvas + PATCH /sessions/{id} без 404/409 | TBD | |
| Reject pending edit → статус `rejected` | `agent_pending_edits.status=rejected` | TBD | |

## Контур `feat/agent-2-schema-context`

Цель: устранить «схема пуста» для AS IS-сессий, у которых истина в `bpmn_xml`,
а `nodes/edges` пусты; обеспечить текущую схему в контексте сервисного агента.

### Изменения в коде

- **Backend (монолит):**
  - `backend/app/ai/process_projection.py` — `build_process_projection` строит
    projection из `bpmn_xml`, если `nodes/edges` пусты; digest считается по
    steps/edges/schema.
  - `backend/app/rag_tasks.py` — Celery-task `index_session_bpmn_xml` для
    переиндексации `bpmn_xml` сессии (самодостаточный, без импортов из
    `backend/app/tasks.py`).
  - `backend/app/storage.py` — после `SessionStorage.save()` ставится
    `.delay()` задача на индексацию (локальный импорт, ошибки enqueue
    не ломают сохранение).
  - `backend/app/routers/rag.py` — `POST /api/rag/index-all` (admin/org-admin)
    для bulk-переиндексации всех сессий org с `bpmn_xml`; в метаданные
    `bpmn_xml` пишется `projection_digest`.
  - `backend/app/celery_app.py` — регистрация `rag_tasks` для worker.

- **Backend (agent service):**
  - `backend/services/agent/memory/context.py` — `load_context` fallback:
    если проекция пуста, подменяет `steps` из top-3 RAG-чанков текущей сессии
    (`source_type=bpmn_xml`, `session_id`-фильтр), пересчитывает digest.
  - `backend/services/agent/memory/chat.py` — `_search_rag_prioritized` для
    `doc_qa`/`schema_overview`: сначала поиск по текущей сессии, потом по
    глобальному корпусу; `rag_context_chunks` подмешиваются в prompt
    `_build_user_prompt` и `schema_overview`.

- **Тесты:**
  - `backend/tests/test_process_projection.py` — XML-сессия, session-state
    регрессия, digest стабилен.
  - `backend/tests/test_rag_tasks.py` — rag_tasks importable и не зависит от
    `backend/app/tasks.py`.
  - `backend/tests/test_rag_api.py` — `projection_digest` в метаданных,
    `POST /api/rag/index-all`.
  - `backend/services/agent/tests/test_context.py` — fallback на RAG при пустой
    проекции.
  - `backend/services/agent/tests/test_branches.py` — `doc_qa` ищет сначала
    текущую сессию.

### Приёмка на stage

| Критерий | Артефакт | Вердикт | Дата |
|---|---|---|---|
| AS IS сессия с шагом «Процедить»: свободный вопрос «что тут?» → ответ описывает шаг и соседей | Тело SSE / JSON ответа | TBD | |
| Rename «Процедить 1234» → карточка confirm с правильным узлом → Reject → без ошибки | `agent_pending_edits.status=rejected`, DOM | TBD | |
| Session-state сессия отвечает как раньше | Регрессионный чат | TBD | |
| Router cache жив, 0 LLM-вызовов на открытие/history | `llm_usage` count | TBD | |
| После bulk `/api/rag/index-all` все AS IS сессии org имеют `rag_sources.last_indexed_at` | SQL-выборка | TBD | |
| Изменение XML сессии → через ≤30 сек чанки переиндексированы (worker log) | `rag_sources.last_indexed_at` обновился | TBD | |

## Известные ограничения

- `test_status_404_foreign_user` падает на локальной dev-БД (возвращает 200
  вместо 404). Это предсуществующая особенность/баг, не в scope данного контура.
- Прямые INSERT в `llm_providers` на боевой/приёмочной БД запрещены;
  провайдер и промпты настраиваются только через `/admin/llm`.
- Гибридный поиск (BM25 ⊕ vector) и embedding-sidecar — вне scope данного
  контура, будут реализованы следующим PR (PR-2 по `AGENT2_PLAN.md`).
