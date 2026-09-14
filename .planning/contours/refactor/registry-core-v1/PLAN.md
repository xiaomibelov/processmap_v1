# PLAN — refactor/registry-core-v1

Контур: `refactor/registry-core-v1` | Тип: refactor/architecture | Baseline: `origin/main` (на момент фиксации `2843f4d0`)
Worktree: `server-backup/opt/processmap-test-worktrees/refactor-registry-core-v1`, ветка `refactor/registry-core-v1`.
Репо: `server-backup/opt/processmap-test`, remote `git@github.com:xiaomibelov/processmap_v1.git`.
Артефакты: `.planning/contours/refactor/registry-core-v1/` (PLAN.md, EXEC_REPORT.md, STATE.json, READY_FOR_REVIEW) + mirror через `./tools/pm-agent-mirror-report.sh`.

## Результаты аудита (актуализированы по baseline origin/main `2843f4d0`)

⚠️ Первичный explore-анализ делался по canonical checkout (`fix/save-single-writer…`, `5722818b`), который расходится с `origin/main`. Авторитетные данные — worktree `refactor-registry-core-v1` (origin/main):
- `routers/_product_action_export_utils.py` **существует** на main: PAR импортирует `_csv_bytes(rows, columns)`/`_xlsx_bytes(rows, columns)` из него (PAR:14); PPR держит свою inline-копию с сигнатурой `(rows)` (модульные `_EXPORT_COLUMNS`). Задача 2 = слить обе в registry_core, удалить дубль (правило единой реализации).
- PPR: 1048 стр. (17 export-колонок), PAR: 792 стр. (22 колонки), orgs.py: 1137 стр., org_service.py: 559 стр., analytics.py: 1806 стр.
- Структурная карта (функции/endpoint'ы) подтверждена для обоих роутеров: ~13 клон-блоков между PPR↔PAR.

**jscpd baseline (--min-lines 5), зафиксирован в `baseline_jscpd.json`:**
- пара PPR↔PAR: 471 dup-строк (25.60%)
- orgs↔org_service: 273 dup-строки (16.10%)
- analytics self: 194 dup-строки (10.74%)
- агрегат 5 файлов: 938 dup-строк (17.56%), 63 клона

**Golden-bytes экспорта** — снимок `golden/` (sha256 CSV/XLSX на фиксированных rows; filename содержит timestamp — сравнивать по шаблону, не по байтам имени). Скрипт: `make_golden.py`.

**Registry-роутеры** (`routers/process_properties_registry.py` 1048 стр., `routers/product_actions_registry.py` 876 стр.):
~13 буквальных клон-блоков, суммарно ~448 строк: нормализация scope/limit/offset, валидация project/session ids с org-guards, `_summary/_metrics/_empty_state/_source_state/_session_summary*/_reconcile/_workspace_title/_with_workspace_titles`, `_registry_payload` (ветвление workspace/project/session + guards `require_authenticated_user` → `request_active_org_id` → `require_org_member_for_enterprise`), экспорт (`_export_filename/_export_cell/_csv_bytes/_column_name/_xlsx_inline_cell/_xlsx_bytes` — inlineStr-XLSX через zipfile, НЕ xlsxwriter), POST query/export endpoint'ы.
Файла `_product_action_export_utils.py` в репо **нет** (упоминание в задаче — устаревшее; обе копии экспорта инлайн). Единственная точка ветвления данных в payload — вызов `list_process_properties_registry_sources` vs `list_product_action_registry_sources`.
Уникальные части (не трогаем структурно): PPR `_extract_camunda_rows`, metadata GET query/export (xlsxwriter!), `_compute_usage_counts`, `_enrich_metadata`; PAR `_registry_row`, `_session_*`-helpers, view-model endpoint.
Тесты: `backend/tests/test_process_properties_registry_api.py` (565 стр.), `test_product_actions_registry_api.py` (475 стр.) — byte-фиксация CSV (BOM, `;`, порядок колонок) и XLSX (распаковка zip, sheet name, строки). Это safety-net.

**orgs.py ↔ org_service.py**: `backend/app/orgs.py` (1137 стр.) — legacy-модуль БЕЗ собственного APIRouter; функции регистрировались в `_legacy_main.py`. Дубли (~174 стр.): list/create/get project, members CRUD, patch_org/member, `_resolved_org_for_cache`, `_invalidate_workspace_cache_for_org`, `_audit_retention_days`. Расхождения клонов: `get_project_storage()` vs `project_repo`, `_ORG_WRITE_ROLES` vs `ORG_WRITE_ROLES` (utils.authz). Внешние импортеры приватных helpers orgs.py: `app/projects.py:13`, `app/sessions_core.py:19` (5–6 helpers). Тонкие роутеры `routers/org*.py` уже вызывают org_service. `test_route_compatibility.py` требует владельца роутов `app.routers.*` (проверить актуальность legacy-регистраций в `_legacy_main.py:314, 5885–5910` на baseline — вероятно уже сняты). Каноническая версия — org_service; в org_service есть lazy-делегаты в `_legacy_main` для invite-функций (логический цикл, import-time цикла нет). Тройной клон `_audit_log_safe`: `services/audit.py` (канон), `org_service.py:51`, `project_service.py:183`.

**analytics.py** (1487 стр., 214 self-dup): пары properties/actions (4 пары хендлеров), два dashboard-хендлера (329/346, почти побайтовая копия), `_build_recalculated_rows` 883–961 / `_build_source_rows` 964–1042 (~50 общих строк), `_xlsx_response` 779–835 vs `_advanced_xlsx_response` 1278–1458, `_sort_items` ×2 (552, 589). Тесты: `test_analytics_backend_driven.py` (739 стр.) и др.

## Задача 1 — `backend/app/services/registry_core.py` (новый модуль)

Единое ядро, параметризованное конфигом реестра:

- **Конфиг-датакласс `RegistryCoreConfig`**: `export_columns`, `filter_map`, `filename_prefix`, `xlsx_sheet_name`, `xlsx_column_widths`, `row_completeness(rows)->(complete,incomplete)` callable, `load_sources(storage, org_id, scope, ...)` callable, `row_extractor` callable, `extra_filter_keys` (для `_filter_options/_applied_filters`).
- **Валидация/нормализация**: `_text`, `_texts`, `_normalize_scope` (ALLOWED_SCOPES workspace/project/session), `_normalize_limit`, `_normalize_offset`, `_load_project_or_404`, `_validate_project_ids`, `_validate_session_ids`, `_visible_project_ids_for_workspace` — переносим как есть (идентичны в обоих файлах).
- **Guards**: оркестрация `require_authenticated_user` → `request_active_org_id` → `require_org_member_for_enterprise` внутри `build_registry_payload(...)` — роутеры не дублируют.
- **Агрегаты**: `_summary`, `_metrics`, `_empty_state`, `_source_state`, `_session_summary`, `_session_summary_totals`, `_reconcile_session_summaries_with_rows`, `_workspace_title`, `_with_workspace_titles`, `_matches_filters`, `_sort_key` — параметризованные конфигом.
- **`build_registry_payload(config, query_in, request)`** — общий `_registry_payload`.
- **Экспорт**: `export_filename(config, scope)`, `export_cell`, `csv_bytes(columns, rows)` (BOM `\ufeff`, `;`, `"`, `\r\n` — byte-совместимо), `xlsx_bytes(config, rows)` (inlineStr SpreadsheetML, sheet name и widths из конфига). **Два XLSX-движка не объединять**: metadata-экспорт PPR (xlsxwriter, GET) остаётся в PPR.
- **Фабрики endpoint'ов**: `make_query_endpoint(config)`, `make_export_csv_endpoint(config)`, `make_export_xlsx_endpoint(config)` — воспроизводят идентичные POST-хендлеры (paginate=True, Response media_type, Content-Disposition).

## Задача 2 — общий экспорт CSV/XLSX

Реализуется в рамках Задачи 1 (`registry_core.csv_bytes` / `registry_core.xlsx_bytes`). Устаревшая ссылка на `_product_action_export_utils` — закрывается созданием единой реализации в registry_core (правило единой реализации AGENTS.md: две копии не остаются).

## Задача 3 — `routers/process_properties_registry.py` → тонкий адаптер

- Создать `RegistryCoreConfig` для property-реестра (16 колонок, filter map, completeness по property_value, sources loader `list_process_properties_registry_sources`, row extractor `_extract_camunda_rows`).
- Удалить все перенесённые helpers/endpoint'ы; оставить: `_extract_camunda_rows` + его приватные зависимости (`_parse_json_text`), `_compute_usage_counts`, `_enrich_metadata`, GET metadata query/export (xlsxwriter-ветка — без изменений), pydantic-модели запросов (импортируются тестами/контрактом — сохранить имена и поля).
- POST query/export.\*.csv/export.\*.xlsx — через фабрики из registry_core.
- Целевой размер файла: ~350–400 строк (с metadata-endpoint'ами).

## Задача 4 — `routers/product_actions_registry.py` → тонкий адаптер

- Аналогично: config для product-actions (22 колонки, `_REQUIRED_BUSINESS_FIELDS`, completeness по missing business fields, sources loader `list_product_action_registry_sources`, row extractor `_registry_row`).
- Остаются уникальные: `_registry_row`, `_session_filter_options/_session_metrics/_session_empty_state/_session_source_state/_step_action_counts`, GET view-model.
- Внимание: `analytics.py` импортирует `_registry_row` и `_extract_camunda_rows`, `_text` из этих роутеров private-импортом — имена/сигнатуры сохраняем (или даём public-алиасы, если придётся перенести глубже).

## Задача 5 — orgs.py ↔ org_service.py

1. Зафиксировать на baseline факт регистраций в `_legacy_main.py:314, 5885–5910`; если ещё есть — удалить (route-compat тест требует владельца `app.routers.*`).
2. Дедупликация **в пользу org_service как канона**:
   - Перенести в org_service недостающие helpers, импортируемые из orgs.py (`_request_org_candidates`, `_user_is_member_of_org`, `_require_org_active_for_writes`, `_resolved_org_for_cache`, `_invalidate_workspace_cache_for_org`) — устранить копии.
   - Перевести `app/projects.py:13` и `app/sessions_core.py:19` на импорты из `services/org_service.py`.
   - Тела продублированных функций в orgs.py (projects CRUD, members CRUD, patch_org/member, audit list/cleanup) заменить на делегирование к org_service. Семантика orgs.py-версий (`get_project_storage`, `_ORG_WRITE_ROLES`) сверяется с service-версиями построчно; расхождения фиксируются в EXEC_REPORT с обоснованием выбора (ориентир: service-версии + fuzz-регрессии B2/B3 из `test_contract_fuzz_regressions.py` должны проходить).
   - Invite-email логика (orgs.py:146–246) и invite-endpoint'ы: если на baseline задействованы через `_legacy_main`-facade — оставить как есть (вне приёмки «174 клон-строк»), перенос только если не расширяет дифф существенно; иначе отдельный контур. Решение фиксируется в STATE.json.
   - `_audit_log_safe`: канон — `services/audit.py`; копии в org_service.py:51 и project_service.py:183 заменить на импорт канона.
3. orgs.py после: остаётся фасадом-совместимостью (re-export) либо удаляется, если импортеров не осталось — по факту baseline.
4. jscpd-проверка пары orgs.py↔org_service.py → ~0 клонов.

## Задача 6 — analytics.py self-dup (bounded, минимальный вариант)

Только если накопленный дифф контура ≤ ~800 строк по состоянию после Задач 1–5; иначе — отдельный PLAN (фиксируется в STATE.json, go/no-go чекпоинт):
1. `get_dashboard`/`get_dashboard_path` (329/346) → общий `_dashboard_payload(scope, scope_id, oid)`; оба роута сохраняются (HTTP-контракт!).
2. `_sort_items` (552, 589) → один helper.
3. `_sources_for_scope(storage, kind, ...)` для 385–398 / 638–651.
4. `_group_recalc_elements(rows, capture_keys, initial)` для 883–961 / 964–1042 (first-seen/last-write семантика сохраняется, тесты `test_analytics_backend_driven.py` — gate).
Не входит: слияние 4 пар хендлеров в фабрики, unified multi-sheet xlsx, чистка мёртвых импортов — отдельный контур.

## Границы (жёсткие)

- HTTP-контракты без изменений: пути, методы, коды ответов, media types, Content-Disposition, байты CSV/XLSX реестровых экспортов.
- operation_id/теги роутов сохраняются (фабрики endpoint'ов получают `name`/summary).
- Не трогаем: xlsxwriter-ветку metadata-экспорта PPR, frontend, миграции.
- jscpd по паре registry-роутеров после: ~0 клонов между ними.

## Тесты и верификация (порядок)

1. **Baseline-fix**: до рефакторинга — зафиксировать golden-bytes: прогон существующих экспорт-тестов, сохранить эталонные байты CSV/XLSX из текущего кода на fixture-сессии (скрипт-снимок в `.planning/contours/refactor/registry-core-v1/golden/`), прогон полного backend pytest — зелёный baseline.
2. Контрактные тесты на оба registry-роутера до/после: существующие `test_*_registry_api.py` + добавить `tests/test_registry_core_contract.py`: оба роутера используют общие helpers registry_core (интроспекция), конфиги неизменны (columns/filter_map/sheet/widths).
3. Тест экспорта: byte-сравнение CSV/XLSX на fixture до/после (golden из п.1).
4. Прогон: `cd backend && python -m pytest tests/ -x -q` (полный набор, 148 файлов тестов).
5. openapi: `python scripts/dump_openapi.py --out docs/openapi.yaml` (§6.1); drift-check: `git diff --stat docs/openapi.yaml` должен быть пустым (или только допустимые операционные изменения — объяснить в отчёте). redocly-конфига в репо нет → `npx @redocly/cli lint docs/openapi.yaml` (0 errors как критерий; предупреждения baseline'ом до изменений).
6. jscpd: `npx jscpd backend/app/routers/process_properties_registry.py backend/app/routers/product_actions_registry.py` и пара orgs↔org_service → до/после сравнение (baseline зафиксировать в PLAN).
7. route-compat: `pytest tests/test_route_compatibility.py tests/test_contract_fuzz_regressions.py -q`.
8. 5-plane proof в EXEC_REPORT: code (ветка/HEAD/diffstat), workspace (worktree), DB (тесты на SQLite-фикстурах, alembic heads == 1), env/compose (локальный pytest, без мутаций docker-окружения; pm-env-lock не требуется — тесты in-process), serving (openapi diff, route table до/после).

## Порядок выполнения

1. Worktree + ветка от `origin/main`; contour scaffolding; baseline-замеры (pytest зелёный, jscpd цифры, golden-bytes).
2. Задача 1 (registry_core.py) — TDD: сначала `test_registry_core_contract.py` + export golden-тест на новом модуле (RED), затем реализация (GREEN).
3. Задачи 3–4 (адаптеры) — по одной, после каждой полный pytest.
4. Задача 5 (orgs) — сверка клонов, перенос, делегирование, чистка импортов.
5. Go/no-go Задачи 6 по размеру диффа.
6. openapi regen + lint + jscpd + полный pytest + route-compat.
7. Review (Agent 3), EXEC_REPORT, mirror, PR (рус.), merge — только после явного approve пользователя.

## Риски

- Расхождение семантики клонов orgs/service (roles-константы, storage vs repo) → построчная сверка + fuzz-регрессии как gate.
- Private-импорты analytics.py из роутеров → сохранить имена `_registry_row`, `_extract_camunda_rows`, `_text`.
- ZipFile-детерминизм XLSX → golden byte-тест до/после обязателен.
- Исторический WIP в canonical checkout (ветка fix/save-single-writer...) — работаем только в новом worktree, main-checkout не трогаем.
