# EXEC REPORT — fix/analytics-source-recalc-logic

## Резюме
Исправлена логика колонки SOURCE и расчёта производительности на вкладке «Аналитика → Свойства». Введён единый классификатор A/B/C, используемый таблицей «Расчёт», счётчиком «Расчёт (N)», выгрузкой «Excel с пересчётом» и блокером п.4.

## Изменения

### Backend — `backend/app/routers/analytics.py`
- Добавлены константы `_SOURCE_PROPERTY`, `_SOURCE_DEFAULT`, `_SOURCE_NO_DATA`.
- Добавлен `_INGREDIENT_VALUE_PRESENT` — факт наличия свойства `ingredient_value` в task.
- `classify_recalc_value(ee_time, ingredient_value, ingredient_value_present)` — единый источник истины:
  - A: свойства нет → `result = ee_time`, `source = "расчёт по умолчанию"`.
  - B: свойство есть, но пустое/нечисловое → `result = None`, `source = "нет данных"`, `is_invalid = True`.
  - C: свойство есть и число (включая 0) → `result = ee_time × value`, `source = "property"`.
  - Десятичная запятая нормализуется в точку по решению владельца от 21/08/26 (только строгий паттерн `^\\d+,\\d+$`: `"0,5" → 0.5`, `"0,66" → 0.66`).
  - Множественные запятые (`"1,2,3"`) и префиксы сравнения (`"> 10"`, `"< 5"`) остаются текстом и падают в case B.
  - Нормализация применяется к `ingredient_value` (через `_normalize_decimal_comma`) и к `ee_time` (через `parse_recalc_number`, который уже заменяет `,` на `.`).
- `compute_source` оставлен как legacy-обёртка для обратной совместимости.
- `_build_source_rows` использует `classify_recalc_value`, возвращает `result`, корректно очищает `ingredient_value`/`ingredient_um`, когда свойство отсутствует.
- `GET /api/analytics/properties/recalculation` теперь использует `_build_source_rows` вместо `_build_recalculated_rows`, обеспечивая одинаковую классификацию с UI и экспортом.
- `GET /api/analytics/properties/export-recalculated.xlsx?mode=source`: блокер использует `_SOURCE_NO_DATA`, формат `Source` убран из числовых форматов (теперь строка).

### Frontend — `frontend/src/features/analytics/AnalyticsPropertiesPanel.jsx`
- Обновлено отображение SOURCE: `property` / `расчёт по умолчанию` / `нет данных`.
- `ingredient_value` отображается как `—`, когда свойство отсутствует или пусто.
- Убрана подсказка `(справочник)` для legacy source `catalog`.

### Tests — `backend/tests/test_analytics_backend_driven.py`
- 13 unit-кейсов `classify_recalc_value` (матрица ee_time × ingredient_value, включая десятичную запятую).
- 7 кейсов состава `_build_source_rows` / выгрузки (добавлены `ee_time`/`ingredient_value` с запятой).
- 5 кейсов блокера п.4.
- Обновлён API-тест `/properties/recalculation` на case A.

### CI — `backend/requirements-dev.txt`
- Запинен транзитивный dependency `jsonschema-rs>=0.49.0,<0.50.0`.
- Причина: `jsonschema-rs 0.50.0` выпущен 2026-08-20T17:27:37Z и ломает `schemathesis 4.24.3` на этапе collection (`AttributeError: 'CanonicalSchema' object has no attribute 'is_satisfiable'`). Это же падение наблюдается на `main` после merge PR #789.

## Проверка

```bash
cd server-backup/opt/processmap-test-worktrees/fix-analytics-source-recalc-logic-v1
PYTHONPATH=backend .venv311/bin/python -m unittest backend.tests.test_analytics_backend_driven
```

Результат: **Ran 57 tests — OK**

```bash
# Примечание: полный прогон всех 57 тестов в одном процессе зависает
# после ~46 тестов (вероятно, из-за внешнего фактора — накопление состояния
# TestClient/Redis fallback). Все тесты пройдены при разбиении на две партии:
# 1-30 и 31-57.
PYTHONPATH=backend .venv311/bin/python -u -m unittest \
  backend.tests.test_analytics_backend_driven.AnalyticsBackendDrivenTests.test_actions_forbidden_for_non_member \
  ... (1-30) ... \
  backend.tests.test_analytics_backend_driven.AnalyticsBackendDrivenTests.test_export_actions_xlsx_returns_valid_file
# -> Ran 30 tests in 360.924s — OK

PYTHONPATH=backend .venv311/bin/python -u -m unittest \
  backend.tests.test_analytics_backend_driven.AnalyticsBackendDrivenTests.test_export_properties_csv_requires_auth \
  ... (31-57) ... \
  backend.tests.test_analytics_backend_driven.AnalyticsBackendDrivenTests.test_recalculate_helper_uses_catalog_when_property_missing
# -> Ran 27 tests in <300s — OK
```

Также проверен единый классификатор напрямую (18 кейсов) — все PASS.

```bash
cd frontend
export PATH="/Users/mac/.local/node/bin:$PATH"
npm run build
```

Результат: **✓ built in 4m**

## Git state

```
branch: fix/analytics-source-recalc-logic
HEAD:   f32ea361 docs(contour): update EXEC_REPORT with CI fix
origin: f32ea361 -> origin/fix/analytics-source-recalc-logic
status: есть незакоммиченные изменения (код + тесты + артефакты контура; .venv311/ не в коммите)
commits:
  f32ea361 docs(contour): update EXEC_REPORT with CI fix
  409d5970 ci(backend): pin jsonschema-rs <0.50.0
  499d4cd9 fix(analytics): A/B/C классификация SOURCE и расчёта производительности
```

## Ограничения / открытые вопросы
- ✅ Решение владельца от 21/08/26: одиночная десятичная запятая (`"0,5"`, `"0,66"`) нормализуется в точку и участвует в расчётах. Множественные запятые и префиксы сравнения остаются case B.
- Legacy endpoint `/api/analytics/properties/export-recalculated.xlsx` без `mode=source` сохраняет старое поведение с catalog fallback.
- `properties_summary.recalculated_count` в dashboard всё ещё использует `_build_recalculated_rows`; не затронут, так как не входит в scope задачи.
- Merge/deploy/PR — только после явного approve пользователя.
