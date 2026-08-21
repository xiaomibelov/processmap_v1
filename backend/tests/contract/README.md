# Contract-тестирование OpenAPI (schemathesis)

Фаззинг **живой** OpenAPI-спеки FastAPI-приложения (`app.main:app`) in-process
через ASGI — без поднятого сервера, БД и внешних зависимостей.

## Запуск

```bash
cd backend
pip install -r requirements-dev.txt

pytest -m contract tests/contract            # PR-режим: 10 примеров/операцию
CONTRACT_PROFILE=nightly pytest -m contract  # nightly: 75 примеров/операцию
CONTRACT_MAX_EXAMPLES=1 pytest -m contract   # ручной оверрайд бюджета (быстрый триаж)
```

В CI: `.github/workflows/backend-contract.yml` (PR — pr-профиль; nightly —
полный бюджет + API-покрытие + drift спеки).

## Что проверяется

| Чек | Смысл |
|---|---|
| `not_a_server_error` | любой HTTP 500 от любого сгенерированного входа = падение. **Не маскируется никогда.** |
| `status_code_conformance` | статус ответа задокументирован в спеке |
| `content_type_conformance` | Content-Type ответа задокументирован |
| `response_schema_conformance` | тело ответа соответствует схеме |

LLM-операции (доменный отказ как `200 {"ok": false}` / `{"error": ...}`) — отдельный
тест `test_contract_llm_envelope_operations` с чеком конверта.

## Устройство

- `contract_support.py` — session-wide SQLite (`PROCESS_DB_PATH` до импорта app),
  seed-данные (org `org_contract_fuzz`, пользователь org_owner, проект, workspace,
  папка, BPMN-сессия), загрузка живой спеки, кастомные чеки, профили бюджета.
- `test_contract_fuzz.py` — два schemathesis-теста (strict + LLM-конверты),
  хуки: `map_case` (подстановка реальных id из seed в path/query), `filter_case`
  (отсекает security-negated кейсы), `@schemathesis.auth()` (Bearer org_owner
  на этапе вызова).
- `exclusions.yaml` — все исключения с обязательным `reason`:
  - `skip_operations` — не фаззятся (SSE-стрим, внешние вызовы, sqlite-env:
    таблицы alembic/pg-only миграций);
  - `method_policy` — фаззятся только GET + whitelist безопасных POST;
  - `domain_error_envelope_operations` — LLM-конверты;
  - `spec_gap_status_operations` — доменные статусы, осознанно не
    задокументированные в спеке (403 admin, 404 not_found, 409 duplicate,
    422 с `detail: str` и т.п.): conformance-чеки для этих статусов off;
  - `spec_gap_content_type_operations` — export-форматы (csv/xlsx/xml/zip),
    не описанные в спеке: content-type чек off.

Баги, найденные фаззингом, сюда **не** маскируются: фикс + регрессионный тест
(`tests/test_contract_fuzz_regressions.py`) + запись в
`.planning/contours/test/contract-openapi/EXEC_REPORT.md`.

## Ограничения окружения (sqlite)

Часть таблиц (recipes, kitchens, dictionaries, operation_catalog,
process_templates, sku_bindings, llm_feature_flags) создаётся alembic-миграциями,
которые работают только на Postgres. В sqlite их нет → такие операции 500-ят
окружением, а не кодом — они в `skip_operations` с reason `sqlite-env`.
