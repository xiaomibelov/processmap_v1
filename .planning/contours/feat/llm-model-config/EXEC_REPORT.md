# EXEC_REPORT — feat/llm-model-config

**Дата**: 2026-08-09
**Ветка**: `feat/llm-model-config` (от origin/main @ e724e151)
**План**: `.planning/contours/feat/llm-model-config/PLAN.md` (approve 2026-08-09)

## Что сделано

Конфигурация LLM-модели ассистента через админку: реестр моделей в БД, admin CRUD,
резолв активной модели в gateway (до провода), per-feature override, поле модели
в apiLlmStatus, вкладка «Модели» в админке.

### Миграция 016 (`backend/alembic/versions/016_llm_models_registry.py`)

- `llm_models`: id, org_id, provider, model_name, display_name, enabled, is_default,
  params (json text), created/updated_by/at; UNIQUE(org_id, model_name).
- `llm_feature_models`: feature, org_id, model_id; UNIQUE(org_id, feature).
- Сид: `llmmodel_deepseek_chat` (deepseek-chat, default, org_default) — поведение
  после миграции побитово не меняется (бывший хардкод).
- Downgrade обратим: DROP обеих таблиц.
- `db_bootstrap.py`: LINEAR += "016", маркер — таблица llm_models.

### Backend

- `llm_store`: CRUD реестра (list/get/create/update/delete/set_default),
  overrides (list/set), `public_model()` (params распарсен), **in-memory кэш
  резолва** (`resolve_model(feature, org)`: override → default → None; TTL 60с,
  инвалидация на каждый write). Пустой реестр/нет таблицы → None.
- `deepseek_questions._deepseek_chat_request`: новый kwarg `model`
  (default "deepseek-chat" — обратная совместимость всех существующих вызовов).
- `gateway.complete()`: резолвит модель через реестр (`resolve_model(feature, org)`
  → fallback `provider["model"]` → env-хардкод) и передаёт в payload `model`.
  Старый путь (пустой реестр) побитово прежний.
- `admin_llm.py`: `/api/admin/llm/models` (GET/POST/PATCH/DELETE),
  `/models/{id}/set-default` (POST), `/api/admin/llm/feature-models` (GET),
  `/feature-models/{feature}` (PUT, пустой model_id = снять). Гарды: guard
  `_platform_admin_context` на каждом handler; 422 при пустом model_name /
  отключении или снятии default; 409 при удалении default. Тест-вызов провайдера
  теперь шлёт `model` из провайдера (до провода).
- `llm_status.py`: ответ += `model {name, display_name, source}`
  (registry | env при пустом реестре) — «работает на: {model}» для панели.

### Frontend

- Вкладка **«Модели»** в разделе LLM админки (`AdminLlmPage`, `?tab=models`):
  таблица реестра (default-пилюля, toggle enabled, set-default, delete),
  форма добавления, блок per-feature override (селекты по LLM_KNOWN_FEATURES).
- API-клиент: `apiAdminLlm*Model*` в `lib/apiModules/adminApi.js`, роуты в
  `apiRoutes.js`, реэкспорт в `features/admin/api/adminApi.js`, i18n ru/en.
- `processmanView.resolveLlmStatusView` += modelName/modelDisplayName/modelSource;
  `ProcessmanAnalysis` показывает строку «Работает на: {model}» из apiLlmStatus.

## Не сделано (по плану)

- Per-user выбор модели, смена модели в UI пользователя.
- Роутинг `model_class` (primary|cheap) — декларативно, как и было.
- Рефактор прочих LLM-вызовов (interview-report, legacy notes) — остаются
  на своих дефолтах (обратная совместимость через default kwarg).

## Тесты

- Backend (`/tmp/pm-backend-venv`, dev-PG на 016):
  - `test_admin_llm_api.py`: +RBAC моделей, CRUD+default-гарды (422/409),
    overrides (PUT/list/снятие/422), кэш-инвалидация резолва; shape MODEL_SHAPE.
  - `test_llm_gateway.py`: +3 теста (default реестра > provider.model;
    override > default; пустой реестр → provider.model побитово).
  - `test_llm_status_api.py`: shape += model; убран запрет подстроки "deepseek"
    (имя модели — осознанный контракт).
  - Целевой прогон: **56 passed** (admin_llm + gateway + status + schema_assistant
    + process_analysis).
  - `test_migration_bootstrap_resilience.py`: ALEMBIC_HEAD синхронизирован "016"
    (migration_state.py + константы теста) — 4/4 passed; db_bootstrap прогоняет
    цепочку до 016 на scratch-БД (миграция применяется через alembic чисто).
  - Полный backend suite: 1029 passed / 29 failed → после фикса head = **26 failed
    ровно как baseline origin/main @ e724e151** (те же 12 файлов: redis/rag/
    sqlite-scope/analytics — окружение, проверено прогоном на чистом main-worktree).
- Frontend: `AdminLlmPage.test.mjs` +2 теста (таблица/toggle/set-default;
  create-form POST + override PUT); `processmanView.test.mjs` — shape view
  с моделью. Целевые: 23/23. Полный suite 2930: **fail 61 = baseline**
  (нормализованный diff с /tmp/b.txt; +1 flaky `property save ... coordinator
  transport hangs` в одном прогоне — 3/3 PASS одиночно, не регрессия).

## Smoke (локально, prod build + preview)

- Backend worktree на :8123 (dev-PG, миграция 016 применена): health OK,
  `GET /api/admin/llm/models` → сид deepseek-chat default;
  `GET /api/llm/status` → `{configured, quota, model:{name:"deepseek-chat",
  display_name:"DeepSeek Chat", source:"registry"}}`.
- `vite build` + `vite preview :5299` (proxy → :8123), Playwright-скриншоты
  вкладки «Модели» (`screenshots/`):
  - `llm-models-tab-models.png` — вкладка с сид-default deepseek-chat;
  - `llm-models-create-form.png` — форма добавления;
  - `llm-models-added.png` — модель deepseek-reasoner добавлена через UI;
  - `llm-models-new-default.png` — set-default переключил пилюлю (ровно один default);
  - `llm-models-restored.png` — default возвращён на deepseek-chat, временная
    модель удалена (реестр чист — только сид).
  - Полный CRUD-цикл пройден через UI (write path: admin API → БД → инвалидация
    кэша резолва).

## CI fix (после PR #707, 2026-08-10)

CI красный по двум джобам — оба разобраны:

1. **spec-drift** — пре-existing баг workflow: `pip install -r backend/requirements.txt
   PyYAML` не ставил `httpx`, а `scripts/dump_openapi.py` требует TestClient →
   `RuntimeError: starlette.testclient requires httpx`. Падало бы и на main.
   Фикс: `.github/workflows/backend-contract.yml` += `httpx==0.27.2` (пин как в
   requirements-dev.txt). Локально `dump_openapi.py` → OK (264 paths/336 ops).
2. **contract (schemathesis fuzz)** — новые GET-ручки отдают доменный 403
   (seed=org_owner, не platform admin), недокументированный в сырой спеке →
   `UndefinedStatusCode`. Фикс по repo-паттерну: `tests/contract/exclusions.yaml`
   spec_gap_status_operations += `admin_llm_list_models`, `admin_llm_list_feature_models`
   (statuses [403]) — как у соседних admin_llm GET'ов.
3. **docs/openapi.yaml** — снапшот обновлён секциями новых эндпоинтов
   (сгенерировано из живой RU-спеки `/api/openapi_ru.json` тем же build_ru_openapi):
   `/api/admin/llm/models` GET/POST, `/models/{model_id}` PATCH/DELETE,
   `/models/{model_id}/set-default` POST, `/feature-models` GET,
   `/feature-models/{feature}` PUT + схемы LlmModelBody/LlmModelPatchBody/
   LlmFeatureModelBody. Коды: 401/403 (admin), 404 (path-param), **409 на delete
   default** (задекларирован в роуте через `responses={...}` — попадает и в живую
   спеку), 422 (валидация), bearerAuth.

Контрактные тесты новых ручек — `test_admin_llm_api.py` (happy path CRUD,
403 non-admin / 401, 404, конфликт is_default: «default ровно один» + 422/409).
Contract fuzz (pr profile) локально: 139 passed + 1 flaky `GET /api/admin/audit`
(в одиночном прогоне PASS, доменно не связан).

## Риски / заметки

- In-memory кэш per-process: при нескольких uvicorn-workers рассинхрон ≤ TTL 60с
  (принято в плане). Инвалидация мгновенна в процессе-писателе.
- Панель квоты: feature mismatch "analysis" vs "process_analysis" — прежняя
  особенность, не трогали.
- Stage: после merge — автодеплой + verify (health, admin вкладка, apiLlmStatus).
