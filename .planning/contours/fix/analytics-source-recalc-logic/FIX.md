# FIX — fix/analytics-source-recalc-logic

## Контур
`fix/analytics-source-recalc-logic` · branch `fix/analytics-source-recalc-logic` от `origin/main`

## Дефект
На вкладке «Аналитика → Свойства» в секции «Расчёт производительности» и в выгрузке «Excel с пересчётом» (`GET /api/analytics/properties/export-recalculated.xlsx?mode=source`) значение `SOURCE = "нет данных"` проставляется для всех строк, где `ingredient_value` не является числом, в том числе для task, у которых свойство `ingredient_value` вообще отсутствует. Из-за этого блокер п.4 срабатывает почти на любой схеме.

Подтверждено скриншотами от 20/08/26, workspace `910749cc53d1`.

## Нормативная логика (Mikhaylov A.I., 14/07/26, п.2, уточнённая редакция)

Классификация должна жить в **одном месте** и использоваться таблицей, кнопкой «Расчёт (N)», выгрузками и блокером п.4.

| Случай | Условие | RESULT | SOURCE | Блокер |
|--------|---------|--------|--------|--------|
| A | Свойства `ingredient_value` в task нет | `ee_time × 1` | `расчёт по умолчанию` | нет |
| B | Свойство `ingredient_value` есть, но значение пустое или нечисловой текст | пусто | `нет данных` | да |
| C | Свойство `ingredient_value` есть, значение — число (включая `0`) | `ee_time × ingredient_value` | `property` | нет |

Дополнительно:
- Значение из пробелов-only трактуется как пустое (случай B).
- Число строкой (`"2"`) — валидно (случай C).
- Запятая в десятичной дроби (`"0,5"`) **не нормализуется** без подтверждения владельца; при обнаружении фиксируется в отчёте как открытый вопрос.

## Состав выгрузки `?mode=source`

Колонки в порядке:
1. BPMN ID
2. BPMN Name
3. ee_time
4. ee_operation
5. ingredient_value
6. ingredient
7. ingredient_um
8. Source
9. Session ID
10. Session Name
11. Workspace
12. Organization
13. Source URL

`ingredient_value` и `ingredient_um` выводятся **только если** свойство `ingredient_value` присутствует в task. В случае A эти колонки остаются пустыми.

`ee_operation` включать всегда.

## Блокер п.4

При нажатии «Excel с пересчётом», если есть хотя бы одна строка случая B, endpoint возвращает HTTP 422 с JSON:

```json
{
  "error": "В схеме найдены не заполненные значения свойства ingredient_value, заполните значения и повторите операцию",
  "invalid_tasks": [
    {"bpmn_id": "...", "bpmn_name": "...", "ingredient_value": "..."}
  ]
}
```

Frontend показывает Modal с сообщением, списком задач и кнопкой «ОК». Выгрузка не производится.

## Out of scope
- Не менять обычный `export.xlsx` (`GET /api/analytics/properties/export.xlsx`).
- Не менять `export.csv`.
- Не менять `export-advanced-calculation.xlsx`.
- Без редизайна вкладки «Аналитика».
- Без broad refactor.
- No merge / no deploy / no PR без явного approve пользователя.

## Зависимости
- `backend/app/routers/analytics.py` — единый классификатор, `_build_source_rows`, `export_properties_recalculated_xlsx`, `get_properties_recalculation`.
- `frontend/src/features/analytics/AnalyticsPropertiesPanel.jsx` — отображение SOURCE/result.
- `backend/tests/test_analytics_backend_driven.py` — тесты классификатора, состава выгрузки, блокера.

## Файлы
- `backend/app/routers/analytics.py`
- `frontend/src/features/analytics/AnalyticsPropertiesPanel.jsx`
- `backend/tests/test_analytics_backend_driven.py`
