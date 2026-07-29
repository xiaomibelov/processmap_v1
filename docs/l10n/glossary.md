# Глоссарий UI технолога (L10N)

Терминология интерфейса роли technologist. Источник строк: словарь
`frontend/src/features/technologist/i18n/ru.js`. Идентификаторы
(operation_code, имена параметров, коды findings, HTTP-коды) **не переводятся** —
они часть формата v0.3 и API.

## Основные термины

| # | EN (термин) | RU (интерфейс) | Комментарий |
| --- | --- | --- | --- |
| 1 | Process Template | Шаблон процесса | |
| 2 | Recipe | Рецепт | |
| 3 | Operation Catalog | Каталог операций | |
| 4 | Process Entities | Сущности процесса | |
| 5 | Gateway | Развилка | ранее «Шлюз» — приведено к глоссарию |
| 6 | Draft | Черновик | статус |
| 7 | Published | Опубликован | статус |
| 8 | Pilot | Пилот | статус |
| 9 | Rollout | Раскатка | действие |
| 10 | Retired | Снят с эксплуатации | статус |
| 11 | Dry-run | Проверка схемы | панель «Проверить» |
| 12 | Pre-check | Проверка по кухням | |
| 13 | Outputs | Результаты блока | outputs.* |
| 14 | History | История | вкладка рецепта |
| 15 | Execution Contract | Что проверяется внутри блока | карточка операции (E2) |
| 16 | Version diff | Diff версий | |
| 17 | Audit log | Журнал изменений / Журнал аудита | вкладка / страница |
| 18 | SKU binding | SKU-привязка | |
| 19 | Kitchen | Кухня | |
| 20 | Mismatch report | Отчёт о несоответствиях | импорт BPMN |

## Операции каталога (name_ru, миграция 009 + сид)

| code | name_ru | code | name_ru |
| --- | --- | --- | --- |
| get_from_storage | Выдать из хранилища | start_equipment | Запустить оборудование |
| move | Перенести | set_equipment | Настроить оборудование |
| open_container | Вскрыть контейнер | transfer | Перетарить |
| close_container | Закрыть контейнер | measure_temperature | Измерить температуру |
| open_equipment | Открыть оборудование | check | Проверить |
| close_equipment | Закрыть оборудование | publish_event | Опубликовать событие |
| wait | Выждать | | |

## Категории операций

| code | RU | code | RU |
| --- | --- | --- | --- |
| storage | Хранение | transfer | Перетаривание |
| transport | Транспорт | quality | Качество |
| container | Тара | measurement | Измерения |
| equipment | Оборудование | communication | События |
| control | Управление | | |

## Не переводится (технические идентификаторы)

- operation_code: `move`, `transfer`, `measure_temperature`, …
- имена параметров: `heat_time_sec`, `target_temp_c`, `dish_sku_id`, …
- коды findings: `GATEWAY_CONDITION_UNKNOWN_OUTPUT`, … (рядом — человеко-читаемый message)
- коды действий аудита в API: `publish`, `new_version`, `rollout`, … (в UI — по словарю action.*)
- версии, ID, email, SKU-коды

## Форматирование (L5)

- Даты/время: русская локаль `29.07.2026, 18:10` (Intl.DateTimeFormat("ru-RU")).
- Единицы: из словаря параметров с русскими подписями («90 сек», «75 °C», «20 шт»).
