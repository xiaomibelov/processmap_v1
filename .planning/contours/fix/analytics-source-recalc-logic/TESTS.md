# TESTS — fix/analytics-source-recalc-logic

## Unit-тесты классификатора A/B/C (11 кейсов)

Тестируется функция `classify_recalc_value(ee_time, ingredient_value, ingredient_value_present)` (имя может отличаться, логика — нет).

### Матрица ee_time × ingredient_value

| # | ee_time | ingredient_value | present | RESULT | SOURCE | is_invalid | Примечание |
|---|---------|------------------|---------|--------|--------|------------|------------|
| 1 | 5.00    | —                | False   | 5.00   | `расчёт по умолчанию` | False | случай A, «Перемешать» |
| 2 | 720.00  | —                | False   | 720.00 | `расчёт по умолчанию` | False | случай A, «Хранение в Холодильной камере» |
| 3 | 3.00    | ""               | True    | None   | `нет данных` | True | случай B, пустое значение |
| 4 | 3.00    | "   "            | True    | None   | `нет данных` | True | пробелы-only = пустое |
| 5 | 3.00    | "abc"            | True    | None   | `нет данных` | True | случай B, нечисловой текст |
| 6 | 3.00    | "—"              | True    | None   | `нет данных` | True | нормализованный пустой Camunda placeholder |
| 7 | 2.00    | "3"              | True    | 6.00   | `property` | False | случай C, число строкой |
| 8 | 4.00    | 2                | True    | 8.00   | `property` | False | случай C, число int |
| 9 | 2.00    | "0,5"            | True    | 1.00   | `property` | False | случай C, десятичная запятая нормализуется |
| 10 | 5.00    | "0"             | True    | 0.00   | `property` | False | случай C, ноль допустим |
| 11 | 5.00    | "-1"            | True    | -5.00  | `property` | False | случай C, отрицательное число |
| 12 | 3.00    | "1,2,3"          | True    | None   | `нет данных` | True | две запятые — не число |
| 13 | 3.00    | "> 10"           | True    | None   | `нет данных` | True | префикс сравнения — не число |

Дополнительно: `ee_time="0,5"` без `ingredient_value` → RESULT=0.50, SOURCE=`расчёт по умолчанию`; `ee_time="0,5"` × `ingredient_value="0,4"` → RESULT=0.20, SOURCE=`property`.

## Кейсы состава выгрузки `?mode=source` (5 кейсов)

Тестируется `_build_source_rows` / endpoint `GET /api/analytics/properties/export-recalculated.xlsx?mode=source`.

| # | Набор свойств элемента | Ожидаемые колонки | Примечание |
|---|------------------------|-------------------|------------|
| 1 | ee_time + ingredient_value + ingredient_um + ee_operation + ingredient | ee_operation присутствует; ingredient_value и ingredient_um присутствуют | базовый случай C |
| 2 | только ee_time | ee_operation присутствует; ingredient_value и ingredient_um пусты | случай A |
| 3 | ee_time + ingredient_value (пустое) + ingredient_um | ingredient_value и ingredient_um присутствуют (пустые), Source = `нет данных` | случай B |
| 4 | ee_time + ingredient_value + ingredient | ingredient_value присутствует, ingredient_um пуст | частичное заполнение |
| 5 | ee_time + ingredient_um (без ingredient_value) | ingredient_value и ingredient_um пусты | ingredient_um без ingredient_value не выводится |

## Кейсы блокера п.4 (5 кейсов)

Тестируется endpoint `GET /api/analytics/properties/export-recalculated.xlsx?mode=source`.

| # | Элементы | Ожидаемый результат | Примечание |
|---|----------|---------------------|------------|
| 1 | op1: ee_time=3.0, ingredient_value="" | 422, invalid_tasks=[op1] | случай B |
| 2 | op1: ee_time=3.0, ingredient_value="abc" | 422, invalid_tasks=[op1] | случай B, нечисловой текст |
| 3 | op1: ee_time=3.0 (ingredient_value отсутствует) | 200 | случай A, блокер не срабатывает |
| 4 | op1: ee_time=3.0, ingredient_value="2"; op2: ee_time=5.0 (ingredient_value отсутствует) | 200 | смешанный A + C |
| 5 | op1: ingredient_value=""; op2: ee_time=5.0, ingredient_value="abc"; op3: ee_time=1.0 | 422, invalid_tasks=[op1, op2] | несколько B + A |

## Регрессионные точки

- Счётчик «Расчёт (N)» (`GET /api/analytics/properties/recalculation`) возвращает все строки с `ee_time` и корректный `source`/`result` по классификатору A/B/C.
- Производительность на больших схемах (15455 строк) не деградирует: классификация O(n), без дополнительных запросов к БД/кэшу.
- Все три среза (`workspace`, `project`, `session`) возвращают консистентные `source`/`result`.
- Старые endpoint'ы без `mode=source` не затронуты.
- Frontend build проходит без ошибок.
