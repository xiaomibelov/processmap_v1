# E6 — покрытие правил валидации R1–R7

Сервис: `backend/app/validation/service.py`, вход `validate_ui_model(ui_model, *, catalog=None, check_reachability=True)`.
Контракт finding (E6.2, совместим с E3): `{severity, code, message (RU), element_id, element_name, recommendation}`.

| Правило | Содержание | Негативный кейс (тест) | Finding code (severity) |
| --- | --- | --- | --- |
| R1 | operation_code каждой задачи — из каталога (БД; без каталога — статический список v0.3) | `test_r1_missing_operation_code` (нет кода); `test_r1_unknown_operation_code` (`cook_soup`); `test_r1_forbidden_operation` (`package_meal`); `test_r1_catalog_drives_allowed_codes` | `UNKNOWN_OPERATION_CODE` (error), `FORBIDDEN_OPERATION` (error) |
| R2 | params по `parameter_schema` каталога: обязательные присутствуют, типы (числовые строки допустимы — camunda-диалект) | `test_r2_missing_required_param`; `test_r2_param_type_mismatch` (`duration_sec="abc"`); `test_r2_numeric_string_accepted` (позитив); `test_r2_without_catalog_no_schema_checks` | `MISSING_REQUIRED_PARAM` (error), `PARAM_TYPE_MISMATCH` (error) |
| R3 | все `*_ref` объявлены в `process_entities` / `recipe_context` | `test_r3_undeclared_ref_warning_and_draft_entity` (+draft entity); `test_r3_declared_ref_ok`, `test_r3_recipe_context_counts_as_declared` (позитивы) | `UNDECLARED_ENTITY_REF` (warning) |
| R4 | move: `object_ref`+`target_ref`; transfer: `source_container_ref`+`target_container_ref` (через схемы каталога = R2; статический страж `STATIC_REQUIRED_PARAMS`, когда запись каталога без схемы) | `test_r4_move_requires_object_and_target`; `test_r4_transfer_requires_source_and_target_container`; `test_r4_static_guard_when_catalog_entry_has_no_schema` | `MISSING_REQUIRED_PARAM` (error) |
| R5 | условия шлюзов — только из объявленных outputs задач (семантика `GATEWAY_CONDITION_UNKNOWN_OUTPUT` из bpmn_import) | `test_r5_gateway_condition_unknown_output` (`${has_sauce == true}`) | `GATEWAY_CONDITION_UNKNOWN_OUTPUT` (error) |
| R6 | каждый узел достижим из старта (link-catch — доп. корни); каждый путь завершается endEvent или link-throw рестартом | `test_r6_unreachable_node`; `test_r6_dead_end_task`; `test_r6_throw_without_link_definition_is_dead_end`; `test_r6_link_throw_is_valid_terminator_and_link_catch_is_root` (позитив на soup); `test_r6_disabled` | `UNREACHABLE_NODE` (error), `DEAD_END` (error) |
| R7 | нет значений-заглушек (`"-"` / null) в params | `test_r7_dash_placeholder`; `test_r7_null_placeholder` | `PLACEHOLDER_VALUE` (error) |

Позитив: `test_positive_acceptance_soup_zero_errors` — acceptance soup
(`tobe_razogrev_supa_rtk_v03.bpmn`, 35 узлов / 36 потоков) → **0 ошибок**
(36 warnings `UNDECLARED_ENTITY_REF` — сущности не объявлены в файле, это
ожидаемо; реальный прогон endpoint'а: `docs/e6/validate_soup_valid.json`).

## Разделение ответственности после рефактора (E6.1)

| Модуль | Что делает |
| --- | --- |
| `app/validation/service.py` | Правила R1–R7 над ui_model (единая точка входа) |
| `app/validation/precheck.py` | E6.4 pre-check: resource_requirements × кухни |
| `app/process_template/bpmn_import.py` | Парсинг XML (включая `event_definitions` для link-событий) + import-специфичные findings: `LEGACY_TASK_TYPE`, `LEGACY_CAMUNDA_PROPERTY`, `LEGACY_FIELD`, `DOLLAR_SUBSTITUTION`, `RECIPE_CONTEXT_PREFIX`, `UNKNOWN_CAMUNDA_PROPERTY`, `EMPTY_DISPLAY_NAME`, `MISSING_PROCESS_METADATA`, `MISSING_RECIPE_CONTEXT`, `MULTIPLE_PROCESSES`, `PLACEHOLDER_VALUE` для не-params camunda-ключей. R1/R3/R5 делегирует сервису (`check_reachability=False` — исторически импорт не проверяет достижимость) |
| `app/transformation/pipeline.py` | `validate_draft_ui_model` — тонкая обёртка над сервисом (`catalog=None`, `check_reachability=False`) |
| frontend `modelUtils.computeReachable` | Клиентская подсветка недостижимых — **та же семантика**, что R6 (startEvent-roots, fallback на узлы без входящих, link-catch корни по `event_definitions` / эвристике «catch без входящих»). Дублирование алгоритма осознанное: клиенту нужна мгновенная подсветка без сети ⚠ |

## Эвристики R6 (документированные упрощения)

- `intermediateCatchEvent` без `event_definitions` (модель собрана вручную в
  конструкторе) и без входящих потоков считается link-catch корнем.
- `intermediateThrowEvent` без `event_definitions` считается link-throw
  (валидный терминатор пути).
- При наличии `event_definitions` (парсер BPMN их записывает) требуется явный
  `linkEventDefinition`.

## Pre-check (E6.4)

- mode `warning` (default, locked decision) → unmet даёт verdict `warning`;
  mode `strict` → `blocked` (E7 будет блокировать publish в strict).
- `measure_temperature` требует equipment `temperature_sensor` ИЛИ capability
  `temperature_measurement` (алиас `CAPABILITY_ALIASES`); аналогично любое
  требование покрывается exact-совпадением `equipment_type_id`, либо
  capability-алиасом, либо capability с тем же именем.
- capabilities_json (Asset Registry v1, свободный JSON; контракт-словарь
  позже): `{"capabilities": ["temperature_measurement", ...]}` — pre-check
  читает только список `capabilities`.
- Реальные выводы API на seeded-кухнях против acceptance soup:
  `precheck_strict.json` (Кухня №3 → blocked), `precheck_warning.json`
  (Кухня №3 → warning), Кухни №1/№2 → ok (№2 — через capability-алиас).
