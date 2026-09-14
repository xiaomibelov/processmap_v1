# ANALYTICS_FOLLOWUP_PLAN — dedup analytics.py self-dup

Контур: `refactor/analytics-dedup-v1` (отдельная ветка от актуального `origin/main`; см. AGENTS.md §2 — доработка вмерженного контура = новая ветка).
Обоснование отделения: go/no-go Задачи 6 PLAN.md `refactor/registry-core-v1` = **NO-GO** (накопленный дифф контура ~1660 строк > порога ~800). Данный план продолжает пункт «analytics self-dup» отдельным bounded-контуром.
Baseline: `backend/app/routers/analytics.py` 1806 стр.; jscpd self-dup = 194 dup-строк (10.74%, зафиксировано в `baseline_jscpd.json` контура `refactor/registry-core-v1`).

## Задача A — общий `_dashboard_payload` (get_dashboard / get_dashboard_path)

`analytics.py:407-435` (`@router.get("/dashboard")`) и `:437-466` (`/{scope}/{scope_id}/dashboard`) — почти побайтовая копия (построение snapshot, extras, meta).
- Ввести `_dashboard_payload(scope_type, scope_id, org_id) -> Dict`, вызывать из обоих хендлеров.
- ОБА роута сохраняются без изменений путей/методов/`operation_id` (HTTP-контракт!).

## Задача B — тонкие helpers для 4 пар properties/actions хендлеров

Пары (baseline-номера сместились после рефакторинга PPR/PAR; private-импорты analytics ↔ роутеров сохранены):
- списочные: `get_properties` `:815-851` / `get_actions` `:898-934`;
- CSV: `export_properties_csv` `:953-972` / `export_actions_csv` `:974-993`;
- XLSX: `export_properties_xlsx` `:1463-1495` / `export_actions_xlsx` `:1496-1522`;
- summary: `get_properties_summary` `:1523-1551` / `get_actions_summary` `:1552-1585`.
- Общие куски: пагинация limit/offset + `_apply_filters` `:665-691` + `_filter_options` `:655-664`, вызов `_csv_response`/`_xlsx_response`, meta-обвязка.
- Решение: общие helpers пагинации/filters/meta. **Хендлеры НЕ сливать в фабрики** (в отличие от registry_core) — размер диффа минимален, читаемость сохраняется.

## Задача C — `_group_recalc_elements` (recalculated vs source rows)

`_build_recalculated_rows` `:1145-1225` и `_build_source_rows` `:1226-1324` — ~50 общих строк группировки по capture_keys.
- Общий `_group_recalc_elements(rows, capture_keys, initial)`.
- **Семантика first-seen / last-write сохраняется построчно** — gate: `test_analytics_backend_driven.py`.

## Задача D — мелкие дубли

- `_sort_items` ×2 — вложенные в `_properties_summary` `:767` и `_actions_summary` `:804` → один module-level helper.
- Ветвление sources по scope в `_properties_rows` `:600-653` и `_actions_rows` `:853-906` → общий `_sources_for_scope(storage, kind, scope_type, scope_id, org_id)` (kind ∈ {properties, actions}); сигнатуры storage-вызовов не менять.
- `_xlsx_response` `:994-1075` vs `_advanced_xlsx_response` `:1597-1779` → общая обвязка workbook (Workbook/Format-инициализация, sheet setup); sheet-специфичное заполнение остаётся в каждой функции. **xlsxwriter-вывод байт-совместим** (golden byte-тест).

## Границы (жёсткие)

- HTTP-контракты: пути, методы, коды, media types, Content-Disposition — без изменений.
- `operation_id`/теги роутов — без изменений → `docs/openapi.yaml` diff после regen должен быть пустым.
- Байты CSV/XLSX экспортов — идентичны golden-снимкам (см. `golden/` + `make_golden.py` контура registry-core-v1).
- Не входит: слияние хендлеров в фабрики, чистка мёртвых импортов, изменения PPR/PAR-роутеров.

## Тесты (gate)

- `backend/tests/test_analytics_backend_driven.py` (1348 стр.) — primary gate.
- `backend/tests/test_analytics_aggregator.py` (141), `backend/tests/test_advanced_calculation.py` (591), `backend/tests/test_project_sessions_summary.py` (201).
- Полный `cd backend && python -m pytest tests/ -q`; фейлы, зафиксированные в `.planning/contours/refactor/registry-core-v1/baseline_failed_tests.txt` (64 строки), не считаются регрессией — сверять по списку.
- Golden byte-тест XLSX до/после (Workbook output deterministic в рамках одной версии xlsxwriter — версию зафиксировать в EXEC_REPORT).

## Приёмка

1. jscpd self-dup analytics.py: **< 5%** (`npx jscpd backend/app/routers/analytics.py --min-lines 5`; baseline 10.74% / 194 строк).
2. Полный backend pytest зелёный (минус baseline-фейлы).
3. `python scripts/dump_openapi.py --out docs/openapi.yaml` → `git diff docs/openapi.yaml` пуст; `npx @redocly/cli lint docs/openapi.yaml` → 0 errors.

## Порядок выполнения

1. Worktree + ветка от актуального `origin/main`; baseline: jscpd self-dup + полный pytest (зафиксировать фейлы как baseline нового контура).
2. Задача A → полный pytest.
3. Задача C → gate `test_analytics_backend_driven.py`.
4. Задача B (по парам, после каждой — pytest).
5. Задача D (sort → sources → xlsx-обвязка с golden byte-тестом).
6. jscpd < 5%, openapi regen + redocly lint, полный pytest.
7. Review (Agent 3), EXEC_REPORT, mirror, PR — merge только после явного approve.
