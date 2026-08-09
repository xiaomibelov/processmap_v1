# EXEC_REPORT — Contract-тестирование OpenAPI (schemathesis)

Ветка: `test/contract-openapi-schemathesis` (worktree от `origin/main` a090d9d0).
Дата: 2026-08-09.

## Резюме

Внедрён контур contract-фаззинга **живой** OpenAPI-спеки FastAPI-бэкенда
(schemathesis 4.24, in-process ASGI, session-wide SQLite с seed-данными).
Фаззинг нашёл **6 реальных багов продакшн-кода** — все пофикшены с
регрессионными тестами. Финальный прогон contract-suite — зелёный.

## Что сделано

### Этап 1 — contract fuzz suite
- `backend/tests/contract/` — suite из двух schemathesis-тестов:
  - `test_contract_operations` — 126 операций (GET + whitelist безопасных POST),
    строгие чеки: `not_a_server_error` + status/content-type/response-schema
    conformance;
  - `test_contract_llm_envelope_operations` — 9 LLM-операций с чеком
    доменного error-конверта (`200 {"ok": false}` / `{"error": ...}`);
- Auth: Bearer org_owner через `@schemathesis.auth()` (call-time, устойчиво к
  shrink); публичные пути — из `app.auth.AUTH_PUBLIC_PATHS` (единый источник).
- Seed: org/user(org_owner)/project/workspace/folder/BPMN-сессия — реальные id
  подставляются в path/query через `map_case` (работает и в coverage-фазе).
- Исключения — только через `exclusions.yaml` с обязательным `reason`
  (skip / method policy / LLM-конверты / spec-gap statuses / spec-gap
  content-type). 5xx не маскируется нигде.
- Профили бюджета: `pr` (10 примеров/операцию, default), `nightly` (75),
  override `CONTRACT_MAX_EXAMPLES`.

### Этап 2 — покрытие спеки тестами
- `backend/tests/coverage_recorder.py` — pytest-плагин `--api-coverage`
  (перехват httpx Client.send → JSONL; без флага — ноль эффекта).
- `scripts/dump_openapi.py` — дамп живой спеки `app.openapi()` (YAML/JSON).
- `scripts/api_coverage_report.py` — отчёт covered/partial/not-covered по
  операциям и тегам (HTML + JSON).

### Этап 3 — CI
- `.github/workflows/backend-contract.yml`:
  - PR/push: contract pr-профиль + артефакт `contract-operations.json`;
  - `spec-drift` (informational): oasdiff живой спеки против ручного снапшота
    `docs/openapi.yaml`;
  - nightly: полный suite с `--api-coverage` + nightly-профиль фаззинга +
    HTML/JSON отчёты покрытия.

## Найденные и исправленные баги (6)

| # | Эндпоинт | Симптом | Корень | Фикс |
|---|----------|---------|--------|------|
| B1 | `GET /api/projects/{id}` | 500 NameError | `project_service.py` использовал `request_user_meta`, импортирован только под alias | импорт |
| B2 | audit-helper `org_service` | 500 NameError | `request_active_org_id` использовался без импорта | импорт |
| B3 | `GET /api/orgs/{org_id}/audit` | 500 NameError | `ORG_AUDIT_READ_ROLES` использовался без импорта | импорт из `utils/authz` |
| B4 | `GET /api/enterprise/workspace` | 500 AttributeError | роутер звал несуществующий `_lm.get_enterprise_workspace` | прямой вызов legacy-функции с Query-параметрами |
| B5 | `POST /api/sessions` `{"roles": true}` | 500 TypeError | `roles: bool/int/dict` падал в `set(roles)` | валидация → `RequestValidationError` (422 по схеме) |
| B6 | `GET /api/audit-log` при ≥1 событии | 500 AttributeError | `sqlite3.Row` не имеет `.get()` (на pg — dict-like) | нормализация строк `dict(row)` в `audit/reader.py` |

Регрессии: `backend/tests/test_contract_fuzz_regressions.py` — 7 тестов, зелёные.

Спека (spec hygiene, без изменения поведения):
- `/`, `/favicon.ico`, `/metrics` убраны из спеки (`include_in_schema=False`) —
  static/infra, не JSON API;
- `POST /api/auth/login|refresh` — задокументирован 401 (был только 200/422).

## Spec-gap находки (не баги кода; кандидаты на доработку спеки)

Зафиксированы в `exclusions.yaml` с reason, здесь — сводно:
- **Доменные 422 с телом `{"detail": "..."}`** — системный паттерн
  legacy-обработчиков; спека описывает 422 только как `HTTPValidationError`
  (detail: list). Затронуто: reference/options, registry/query ×2, audit-log
  (невалидная дата), note-threads, rag/index, export-advanced/recalculated.xlsx.
- **Незадокументированные доменные статусы**: 403 у admin GET (seed=org_owner),
  404 not_found (folders, explorer, reports/{version_id}, groups, auto-pass,
  export.zip, scope-сущности registry), 409 duplicate-title у create-сессий,
  202 pending (note-threads, auto-pass/precheck), 400 rag_disabled.
- **Export-форматы не описаны**: bpmn (XML), export.zip, registry/export (csv),
  analytics export.csv/.xlsx ×5 — content-type в спеке только JSON.
- Ручной снапшот `docs/openapi.yaml` расходится с живой спекой — drift-джоба
  в CI (informational).

## Ограничения окружения (sqlite, env-only 500)

Таблицы alembic/pg-only миграций (recipes, recipe_params, kitchens,
dictionaries ×4, operation_catalog, process_templates, sku_bindings,
llm_feature_flags) отсутствуют в sqlite → OperationalError 500. Это НЕ баги
кода: 22 операции в `skip_operations` с reason `sqlite-env`. LLM-домен на pg.

## Метрики

- Спека: 259 paths / 329 operations (после spec hygiene).
- Классификация операций: fuzzed=129 strict + 9 LLM-envelope,
  skipped_policy=164 (мутации вне whitelist), skipped_explicit=27
  (SSE, внешние вызовы, sqlite-env) → total=329.
- Прогресс триажа: 157 → 72 → 68 → 12 → 5 → **0 failed**.

## Верификация (git-proof)

- **Contract suite (pr-профиль, 10 примеров/операцию): `138 passed` (9 мин)** —
  129 strict-операций + 9 LLM-конвертов, 0 failed.
- **Основной suite бэкенда: `26 failed, 1025 passed, 1 skipped` (14 мин)**.
  Baseline на чистом `origin/main` (a090d9d0): `54 failed, 915 passed,
  1 skipped, 87 errors`. Улучшение — за счёт `pytest.ini` (testpaths=tests
  исключает services/notifications с конфликтующим app-пакетом — это и были
  87 ошибок коллекции). Все 26 текущих падений воспроизведены на чистом
  `origin/main` тем же venv — pre-existing (pg-зависимые, redis-зависимые
  overlay_cache и др.), новых падений от изменений контура нет.
- Регрессии на баги B1–B6: 7 тестов passed.

## Известные ограничения / follow-up

- Мутирующие операции (POST/PUT/PATCH/DELETE вне whitelist) не фаззятся — нужны
  reset-фикстуры состояния между примерами (см. `method_policy.reason`).
- sqlite-env пропуски закрыть запуском contract-suite против pg (docker) в CI.
- Spec-gap: доработать спеку (доменные 4xx, export content-types) или
  нормализовать ответы; массовая правка хендлеров сознательно вне скоупа.
- spec-drift снапшота `docs/openapi.yaml` — синхронизировать с живой спекой.
