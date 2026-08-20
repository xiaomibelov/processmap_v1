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
  - Запятая в десятичной дроби не нормализуется (case B).
- `compute_source` оставлен как legacy-обёртка для обратной совместимости.
- `_build_source_rows` использует `classify_recalc_value`, возвращает `result`, корректно очищает `ingredient_value`/`ingredient_um`, когда свойство отсутствует.
- `GET /api/analytics/properties/recalculation` теперь использует `_build_source_rows` вместо `_build_recalculated_rows`, обеспечивая одинаковую классификацию с UI и экспортом.
- `GET /api/analytics/properties/export-recalculated.xlsx?mode=source`: блокер использует `_SOURCE_NO_DATA`, формат `Source` убран из числовых форматов (теперь строка).

### Frontend — `frontend/src/features/analytics/AnalyticsPropertiesPanel.jsx`
- Обновлено отображение SOURCE: `property` / `расчёт по умолчанию` / `нет данных`.
- `ingredient_value` отображается как `—`, когда свойство отсутствует или пусто.
- Убрана подсказка `(справочник)` для legacy source `catalog`.

### Tests — `backend/tests/test_analytics_backend_driven.py`
- 11 unit-кейсов `classify_recalc_value` (матрица ee_time × ingredient_value).
- 5 кейсов состава `_build_source_rows` / выгрузки.
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

Результат: **Ran 53 tests in 152.530s — OK**

```bash
cd frontend
npm run build
```

Результат: **✓ built in 31.70s**

## Git state

```
branch: fix/analytics-source-recalc-logic
HEAD:   409d5970 ci(backend): pin jsonschema-rs <0.50.0
origin: 409d5970 -> origin/fix/analytics-source-recalc-logic
status: clean (кроме .venv311/, не в коммите)
commits:
  409d5970 ci(backend): pin jsonschema-rs <0.50.0
  499d4cd9 fix(analytics): A/B/C классификация SOURCE и расчёта производительности
```

## Ограничения / открытые вопросы
- Запятая в `ingredient_value` (например, `"0,5"`) не нормализуется и попадает в case B. Требуется решение владельца продукта.
- Legacy endpoint `/api/analytics/properties/export-recalculated.xlsx` без `mode=source` сохраняет старое поведение с catalog fallback.
- `properties_summary.recalculated_count` в dashboard всё ещё использует `_build_recalculated_rows`; не затронут, так как не входит в scope задачи.
- Merge/deploy/PR — только после явного approve пользователя.
