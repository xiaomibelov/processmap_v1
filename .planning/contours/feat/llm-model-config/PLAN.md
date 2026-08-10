# PLAN — feat/llm-model-config: реестр LLM-моделей ассистента через админку

Ветка: `feat/llm-model-config` от `origin/main` @ e724e151. Дата: 2026-08-09.
Тип: feat (Planner → approve → Executor). RAG: недоступен (invalid_user) — first principles.

## Ключевая находка разведки

Инфраструктура наполовину готова: `llm_providers.model` (миграция 012) + admin CRUD
провайдеров + UI-вкладки LLM уже существуют, но **модель до провода не доходит**:
`_deepseek_chat_request` (`backend/app/ai/deepseek_questions.py:785`) шлёт
`"model": "deepseek-chat"` хардкодом, `gateway.complete()` (`backend/app/ai/gateway.py:143-151`)
не передаёт `provider.model`. Env-fallback — `gateway.py:47` (`deepseek-chat`).
Решение строим поверх существующих паттернов (admin_llm.py, llm_store.py, миграции 012–015),
новых парадигм не вводим.

## Scope

### 1. Миграция 016 `llm_model_registry` (обратимая)

`backend/alembic/versions/016_llm_model_registry.py` + LINEAR в `backend/scripts/db_bootstrap.py:30`:

- **`llm_models`**: `id TEXT PK`, `org_id TEXT NOT NULL` (как `llm_providers`),
  `provider TEXT NOT NULL` (имя провайдера = `llm_providers.name` — связь по имени,
  credentials не дублируем), `model_name TEXT NOT NULL`, `display_name TEXT NOT NULL`,
  `enabled INTEGER NOT NULL DEFAULT 1`, `is_default INTEGER NOT NULL DEFAULT 0`,
  `params TEXT NOT NULL DEFAULT '{}'` (json: temperature, max_tokens — null/отсутствие
  = дефолты call-site, ничего не ломаем), `created_at`, `updated_at`.
  Unique (org_id, provider, model_name). Индекс (org_id, enabled).
- **`llm_feature_models`**: `org_id TEXT NOT NULL`, `feature TEXT NOT NULL`,
  `model_id TEXT NOT NULL REFERENCES llm_models(id) ON DELETE CASCADE`,
  PK (org_id, feature) — per-feature override.
- **Сид** (idempotent, `ON CONFLICT DO NOTHING`): для каждого org_id, где есть
  провайдер `deepseek` (и для `org_default` в любом случае): default-запись
  `provider='deepseek', model_name='deepseek-chat', display_name='DeepSeek Chat',
  enabled=1, is_default=1, params='{}'` — ровно текущее поведение.
- **Downgrade**: DROP обеих таблиц (данные только реестра, продуктовых нет).

### 2. Store + резолв + кэш (backend)

- `backend/app/ai/llm_store.py`: CRUD `list_models/get_model/create_model/update_model/
  set_default_model/delete_model` (транзакционно: set_default сбрасывает прочие
  is_default в org) + `list_feature_overrides/set_feature_override/delete_feature_override`.
- `backend/app/ai/model_resolver.py` (новый, ~80 строк):
  `resolve_model(org_id, feature) -> {provider, model_name, params} | None`:
  override(feature) → default-запись → None (пустая таблица).
  **In-memory кэш** per-process: `{(org_id): (version, data)}` + глобальный счётчик
  версий; инвалидация — bump при любом write из admin API (token-economy: 0 запросов
  к БД на LLM-вызов при неизменном реестре).
- `backend/app/ai/gateway.py`: `complete()` после выбора provider-chain звеном —
  резолв модели: `resolver` → если row.provider совпал с именем звена цепочки —
  `model=row.model_name`, merge `params` (temperature/max_tokens поверх дефолтов
  payload); иначе `provider["model"]` (чинит игнор колонки 012 — bug-fix в scope);
  иначе `"deepseek-chat"`. Передать model в `_deepseek_chat_request`
  (новый kwargs `model="deepseek-chat"` по умолчанию — обратная совместимость
  всех прочих вызовов: interview/notes/analysis).
- Тест-call провайдера `admin_llm.py:105` — передавать `provider.model` (та же точка).

### 3. Admin API `/api/admin/llm/models` (backend/app/routers/admin_llm.py)

Паттерн = providers CRUD, guard `_platform_admin_context` (только platform_admin):
- `GET /api/admin/llm/models?org_id=` — список (+ effective: пометка default/overrides);
- `POST /api/admin/llm/models` (201; валидация: provider/model_name/display_name
  обязательны, params — dict, неизвестные ключи params → 422; provider должен
  существовать в `llm_providers` этого org → иначе 422);
- `PATCH /api/admin/llm/models/{id}` (display_name/enabled/params; is_default только
  через set-default);
- `POST /api/admin/llm/models/{id}/set-default`;
- `DELETE /api/admin/llm/models/{id}` (default не удалить → 409);
- `GET/PUT/DELETE /api/admin/llm/model-overrides/{feature}` — per-feature override
  (feature ∈ seeded flags: schema_assistant/process_analysis/as_is_transform).
- Каждый write → `model_resolver.invalidate(org_id)`.

### 4. apiLlmStatus — поле модели

`backend/app/routers/llm_status.py`: `+ "model": {"name": str|None, "display_name": str|None,
"source": "registry"|"provider"|"env"|null}` через resolver (та же кэш-линия, 0 лишних запросов).
Обратная совместимость: существующие поля не меняются.

### 5. Админка UI — вкладка «Модели»

- `frontend/src/lib/apiRoutes.js` (+7 роутов), `apiModules/adminApi.js` (обёртки).
- `AdminLlmPage.jsx`: 5-я вкладка `?tab=models` → новый `features/admin/llm/LlmModelsPanel.jsx`:
  таблица (display_name, provider, model_name, статусы enabled/default/overrides),
  switch enabled, кнопка «Сделать default», форма добавления (provider select из
  `apiAdminLlmListProviders` + model_name + display_name + temperature/max_tokens),
  per-feature override — select модели напротив каждого feature-флага.
  i18n — в существующий `features/admin/llm/i18n.js` (там admin-only, ок).
- В шапке вкладок LLM-раздела — строка «Активная модель: {display_name}» из apiLlmStatus.

### 6. Тесты

- `backend/tests/test_llm_model_registry.py`: миграция-ап/даун (sqlite), сид,
  резолв (default/override/пустая таблица→None), кэш-инвалидация (без БД-hit на 2-й резолв).
- `backend/tests/test_admin_llm_models_api.py`: CRUD + set-default + гарды
  (401/403), 422 на несуществующий provider, 409 на delete default.
- `backend/tests/test_llm_gateway.py` (+кейсы): model из реестра уходит в payload;
  params merge; пустой реестр → provider.model → env-хардкод (побитовая совместимость).
- `frontend`: `AdminLlmPage.test.mjs` (+вкладка models), source-тест роутов/клиента.
- Прогоны: pytest backend/tests (затронутые файлы + полный backend suite),
  `node --test` frontend (suite = baseline 61 fail), ручной smoke: админка → добавить
  модель → set-default → apiLlmStatus показывает её.

## Не делаем (по ТЗ)

- Per-user выбор модели; смену модели в UI пользователя.
- Роутинг по `llm_prompts.model_class` (primary/cheap) — отдельный контур.
- Рефактор interview/notes/analysis под реестр (они продолжают на call-site дефолтах).

## Риски / решения

- **Двойной источник модели** (`llm_providers.model` vs реестр): приоритет реестра
  зафиксирован выше; колонка провайдера — fallback, не удаляется (обратная совместимость).
- **Org-scope**: реестр per-org как провайдеры; org без записей = текущее поведение.
- **Мультипроцессность** (uvicorn workers): in-memory версия per-process; рассинхрон
  ≤ TTL 60с — допустимо по ТЗ (кэш + инвалидация при update в том же процессе;
  чужие процессы догоняют по TTL). Зафиксировать в EXEC_REPORT.

## Порядок выполнения (Executor)

1. Миграция 016 + bootstrap + тест миграции.
2. llm_store CRUD + resolver + кэш + тесты.
3. gateway/deepseek_questions wiring + gateway-тесты.
4. Admin API + тесты + llm_status поле.
5. Фронт: роуты/клиент/панель/вкладка + тесты.
6. Прогоны, EXEC_REPORT, PR (branch → push → PR → approve → merge → stage verify).
