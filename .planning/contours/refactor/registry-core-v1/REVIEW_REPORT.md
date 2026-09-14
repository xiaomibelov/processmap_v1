# REVIEW_REPORT — refactor/registry-core-v1

Дата: 2026-09-14. Reviewer: Agent 3. Объект: коммит `85f97c25` (HEAD ветки `refactor/registry-core-v1`, baseline `2843f4d0` = origin/main).

## Вердикт

**APPROVE_WITH_NITS** — блокеров и major-находок нет. Контур можно merge'ить после явного approve пользователя.

## Проверено (по пунктам задания)

### 1. Byte/HTTP-совместимость экспорта — OK

- `registry_core.csv_bytes` / `xlsx_bytes_for` vs удалённый `routers/_product_action_export_utils.py` и inline-версия PPR на `2843f4d0`: построчная сверка — идентичны (BOM `\ufeff`, `;`, `"`, `\r\n`, utf-8; inlineStr SpreadsheetML; порядок записей zip; sheet names «Process properties»/«Product actions»; widths 16/22 из конфигов совпадают с захардкоженными списками baseline).
- Старые endpoint-хендлеры (PPR:1020–1048, PAR:770–792 на baseline) vs фабрики `make_query_endpoint/make_export_csv_endpoint/make_export_xlsx_endpoint`: идентичны (`paginate=True`, media_type, Content-Disposition, filename-шаблон `export_filename`). operation_id сохраняется через `fn.__name__`; pydantic-модель подставляется в `__annotations__` — FastAPI резолвит body корректно (import app.main OK, route-compat зелёный).
- `product_action_suggestions.py` переведён на ядро: старые вызовы `_csv_bytes(rows, columns)`/`_xlsx_bytes(rows, columns)` корректно адаптированы к новым сигнатурам `(columns, rows)`; sheet/widths совпадают с удалённым utils.

### 2. Guards-эквивалентность — OK

- `build_registry_payload` (registry_core.py:412) vs старые `_registry_payload` обоих роутеров: построчная сверка — идентичны по порядку guards (`require_authenticated_user` → `request_active_org_id` → `require_org_member_for_enterprise`), кодам/сообщениям ошибок (422 workspace_id/project_id/session_id required, 404 not_found, 422 invalid scope/completeness), пагинации и envelope ответа. Порядок вызова `_applied_filters` → `_filter_options` → `_matches_filters` → sort сохранён.
- Параметризация конфигом проверена для обоих реестров: `filter_map`/`filter_option_map` PPR (property_types/groups/sources/processes/element_types) и PAR (product_groups/products/action_types/stages/object_categories/roles) воспроизводят старые inline-ключи; `source_contract_version` ("v1" у PPR, отсутствует у PAR) и source labels/namespaces совпадают со старыми `_source_state`.

### 3. Адаптеры — OK

- `process_properties_registry.py` (531 стр.): мёртвого кода нет; остатки (`_extract_camunda_rows`, `_parse_json_text`, `_compute_usage_counts`, `_enrich_metadata`, GET metadata query/export с xlsxwriter-веткой) неизменны; pydantic-модели `ProcessPropertiesRegistryFilters/QueryIn` — поля и дефолты идентичны baseline.
- `product_actions_registry.py` (358 стр.): аналогично; `_registry_row`, `_session_*`, view-model endpoint без изменений; модели `ProductActionsRegistryFilters/QueryIn` идентичны. Пути/методы POST query/export.\*.csv/export.\*.xlsx и имена функций сохранены.
- Нит: `_completeness` в PPR-адаптере объявлена локально и тем же объектом передана в конфиг — дублирования поведения нет, лишняя локальная ссылка.

### 4. orgs-контур — OK

- Перенесённые в org_service helpers (`_require_org_active_for_writes`, `_user_is_member_of_org`, `_request_org_candidates`) — построчно идентичны старым версиям orgs.py (сверено извлечением из `2843f4d0`).
- `_audit_log_safe` канонизирован в `services/audit.py` — идентичен копиям org_service/project_service (сверено с diff project_service.py: копия удалена, импорт добавлен).
- `projects.py:13`, `sessions_core.py:19`, `services/session_service.py:25` импортируют из org_service существующие имена (проверено grep + import app.main).
- `session_service.create_project_session` теперь зовёт org_service-версию guard вместо `_lm._require_org_active_for_writes` — версии идентичны, поведение не изменилось.
- `delete_org_project_member`: runtime-роутер `routers/org.py:87` и до и после делегировал в org_service (200 `{"ok": true}`); изменение коснулось только legacy-export пути — раскрыто в EXEC_REPORT, HTTP-контракт runtime не затронут.

### 5. Private-импорты analytics.py — OK

`routers/analytics.py:24,27` импортируют `_extract_camunda_rows`, `_text` (PPR) и `_registry_row` (PAR) — все три имени существуют в адаптерах с прежними сигнатурами (analytics_backend_driven 73+3 зелёные по EXEC; import graph поднимается).

### 6. test_registry_core_contract.py — не тривиально-истинный

- CSV: byte-совпадение sha256 с golden ловит BOM/разделители/квотинг/порядок колонок.
- XLSX: канонический sha zip (имена записей + compress_type + несжатые байты) ловит sheet name, widths, cell XML; raw-sha golden vs summary.json фиксирует самосогласованность.
- Интроспекция конфигов/endpoint-фабрик (sheet names, widths count, filename prefixes, `fn.__module__ == app.services.registry_core`) реально падает при регрессии переноса.
- Дополнительно самостоятельно прогнаны живые API export byte-тесты baseline-контракта: **14 passed** (PPR+PAR: csv BOM/escaping/columns, xlsx workbook/sheet/rows, export filters/guards) — независимая байт-фиксация до рефакторинга.

### 7. Секреты/debug/TODO — чисто

grep по диффу: нет секретов, breakpoint, TODO/FIXME без контура.

## Прогоны (выполнены Reviewer'ом, worktree, venv canonical)

| Проверка | Результат |
|---|---|
| `python -c "import app.main"` | OK, 394 routes |
| `pytest tests/test_route_compatibility.py tests/test_registry_core_contract.py -q` | 11 passed, 4 subtests passed |
| `pytest test_process_properties_registry_api.py test_product_actions_registry_api.py -k "registry_export or csv_export or xlsx_export or export_filters or export_scope_guard"` | 14 passed (18 min — pre-existing медленность, ~65–120 с/тест) |
| `jscpd --min-lines 5` (PPR, PAR, orgs.py, org_service.py) | 11 клонов / 120 dup-строк (5.16%), **все внутри org_service.py**; кросс-файловых PPR↔PAR и orgs↔org_service — 0 |

## Находки

**Blocker:** нет.
**Major:** нет.

**Minor:**
1. `org_service._audit_retention_days`: `int(os.environ.get("AUDIT_RETENTION_DAYS","90"))` → `max(1, _env_int(...,90))` (org_service.py:101). При `AUDIT_RETENTION_DAYS=0` retention теперь минимум 1 день (раньше 0 → возможно удаление всего аудита в cleanup_org_audit); зато некорректное значение больше не роняет вызов. Раскрыто в EXEC_REPORT; риск низкий, приемлемо.
2. Нит: локальная `_completeness` в PPR-адаптере дублируется как `config.completeness` (тот же callable) — косметика.
3. Нит: golden XLSX сравнивается по каноническому sha без zip date_time — реальную побайтовую детерминированность покрывают 14 живых API export-тестов (зелёные).
4. Зафиксировано: полный набор registry API тестов медленный (~18 мин на 14 export-тестов) — pre-existing, в EXEC помечен кандидатом на perf-контур.

## Замечания к процессу

- Дифф контура чистый: 22 файла, нет изменений вне контура (routers/org*.py, docs/openapi.yaml, миграции не тронуты; openapi diff пуст по EXEC, route-compat подтверждает).
- Задача 6 (analytics) корректно вынесена по go/no-go правилу в ANALYTICS_FOLLOWUP_PLAN.md.

## Заключение

Рефакторинг достигает заявленных целей (dedup PPR↔PAR до 0 кросс-клонов, orgs→org_service делегирование, единая реализация экспорта) без изменения HTTP/byte-контрактов. Рекомендация: **merge после явного approve пользователя**; minor #1 учесть в описании PR.
