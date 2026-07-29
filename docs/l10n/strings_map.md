# Карта строк UI технолога (L10N, L1)

Инвентаризация пользовательских строк по экранам роли technologist.
Источник истины после L10N — словарь `frontend/src/features/technologist/i18n/ru.js`
(здесь — выжимка по ключевым строкам; полное покрытие = ключи словаря).
EN-столбец — как было до трека, RU — как стало.

## Каталог операций (`catalog/Catalog.jsx`)

| Было (EN) | Стало (RU) | Ключ словаря |
| --- | --- | --- |
| Operation Catalog | Каталог операций | catalog.title |
| Browse available operations for process templates. | Доступные операции для шаблонов процессов. | catalog.subtitle |
| Loading operations… | Загружаем операции… | catalog.loading |
| You have read-only access… | У вас доступ к каталогу операций только на чтение. | catalog.readOnly |
| Available Operations | Доступные операции | catalog.available |
| Operation Details | Карточка операции | catalog.details |
| Code: / Category: | Код: / Категория: | catalog.code / catalog.category |
| Parameters: | Параметры: | catalog.parameters |
| Allowed Outputs: | Допустимые результаты: | catalog.allowedOutputs |
| Execution contract | Что проверяется внутри блока | catalog.contract |
| Preconditions/Postconditions/Included checks | Предусловия/Постусловия/Включённые проверки | catalog.preconditions/postconditions/checks |
| Resource Requirements: | Требования к ресурсам: | catalog.resources |
| success/error (тип результата) | успех/ошибка | catalog.outputSuccess/outputError |
| Move / Transfer / Measure Temperature… (name из БД) | Перенести / Перетарить / Измерить температуру… | name_ru в operation_catalog (миграция 009) |
| QUALITY / CONTAINER / TRANSPORT… | Качество / Тара / Транспорт… | category.* |

## Конструктор (`constructor/Constructor.jsx`, `CheckPanel.jsx`)

| Было | Стало | Ключ |
| --- | --- | --- |
| Конструктор процессов (RU, хардкод) | то же, из словаря | ctor.title |
| Новый/Клонировать/Сохранить/Открыть/Связать/Проверить | без изменений, из словаря | ctor.new/clone/save/open/connect/check |
| Опубликовать / Новый черновик / Скачать BPMN | без изменений, из словаря | ctor.publish/newDraft/downloadBpmn |
| Шаблон / Сущности / Блок / Поток (вкладки) | без изменений, из словаря | ctor.tab* |
| Шлюз «исключающий» / «параллельный» | **Развилка** «исключающая» / «параллельная» (глоссарий) | STRUCTURAL_BLOCKS |
| Сухой прогон (dry-run) | Проверка схемы | check.dryRun |
| Pre-check по кухням | Проверка по кухням | check.precheck |
| warning (по умолчанию) / strict | с предупреждениями (по умолчанию) / строгий | check.modeWarning/modeStrict |
| Обновить pre-check | Обновить проверку по кухням | check.precheckRun |
| код finding крупно первым | message первым, **код мелким** (критерий 4) | верстка CheckPanel |
| статусы версий raw (published/retired) | Опубликован / Снят с эксплуатации | status.* |
| Ошибка / Предупреждение / OK / Заблокировано | из словаря | check.severity*/verdict* |

## Рецепты (`recipes/Recipes.jsx`)

| Было | Стало | Ключ |
| --- | --- | --- |
| Рецепты / Список рецептов / Новый / Новый рецепт | из словаря | recipes.title/list/new/formNew |
| Рецепт (draft) — статус сырым кодом | Рецепт (Черновик) — статус локализован | recipes.formEdit + status.* |
| Параметры / История (вкладки) | из словаря | recipes.tabParams/tabHistory |
| Сохранить / Опубликовать / Новая версия / Клонировать на SKU | из словаря | recipes.save/publish/newVersion/clone |
| — не задано — / — выберите шаблон — | из словаря | recipes.notSet/templateSelect |
| published/draft в бейджах списка | Опубликован/Черновик | status.* |
| нет в рецепте: … | из словаря | recipes.analysisMissing |

## Пилоты (`pilots/Pilots.jsx`)

| Было | Стало | Ключ |
| --- | --- | --- |
| Пилоты SKU-привязок / Привязки | из словаря | pilots.title/list |
| Выведен (retired) | Снят с эксплуатации (глоссарий) | status.retired |
| Критерии не заданы / Раскатать / Раскатываем… | из словаря | pilots.noCriteria/rollout/rollingOut |
| Не удалось раскатать | из словаря | pilots.rolloutFailed |
| min_orders не выполнен: 14/20 (из API, уже RU) | без изменений | backend compute_progress |

## Аудит (`audit/AuditHistory.jsx`, `VersionDiff.jsx`, `AuditPage.jsx`)

| Было | Стало | Ключ |
| --- | --- | --- |
| Журнал аудита | Журнал изменений / Аудит действий | audit.title/pageTitle |
| Фильтры: recipe / process_template сырыми | Рецепт / Шаблон процесса | entityType.* |
| Фильтры: recipe.create / publish сырыми | Создание рецепта / Публикация / Новая версия / Раскатка | action.* |
| дата `2026-07-29 14:02` | `29.07.2026, 18:10` (русская локаль, L5) | formatTs (Intl ru-RU) |
| пользователь удалён/внешний | из словаря | audit.deletedUser |
| От версии / До версии / параметры не отличаются | из словаря | diff.* |

## Импорт и трансформация (`import/ImportBpmn.jsx`, `transform/TransformReview.jsx`)

| Было | Стало | Ключ |
| --- | --- | --- |
| Импорт BPMN-шаблона | Импорт BPMN (AS IS) | import.title |
| узлов/потоков/ошибок/предупреждений | из словаря | import.nodes/flows/errors/warnings |
| Замечания / Предпросмотр графа | из словаря | import.findings/preview |
| Трансформация AS IS → TO BE (draft) | AI-трансформация AS IS → TO BE / TO BE (черновик) | transform.title/toBeDraft |
| Принять / Отклонить / Открыть в конструкторе | из словаря | transform.accept/reject/toConstructor |
| draft узлов / ошибок валидатора | узлов черновика / ошибок валидатора | transform.draftNodes/validatorErrors |
| Открытые вопросы | из словаря | transform.openQuestions |

## Бэкенд-сообщения (L4)

| Было (EN) | Стало (RU) | Где |
| --- | --- | --- |
| Not authenticated | Требуется аутентификация | все technologist-роутеры |
| Template not found | Шаблон процесса не найден | process_templates |
| recipe not found | Рецепт не найден | sku_bindings |
| sku_binding not found | SKU-привязка не найдена | sku_bindings |
| kitchen not found: X | Кухня не найдена: X | sku_bindings |
| Empty BPMN payload | Пустой BPMN-файл | process_templates, transformation |
| mode must be 'strict' or 'warning' | mode должен быть 'strict' или 'warning' | process_templates |
| ui_model is required | Требуется ui_model | process_templates |
| invalid_status (без message) | + message: «пилот можно запустить только из статуса "Черновик"» и т.п. | sku_bindings |
| heat_time_sec=1000 вне диапазона 10–600 сек | уже было RU (E5) | recipes |
| min_orders не выполнен: 14/20 | уже было RU (E9) | sku_bindings |

## Намеренно не локализовано

operation_code, имена параметров, коды findings/действий в API, версии, ID, email, SKU, BPMN/XML, AS IS / TO BE (термины методологии), JSON-схемы в карточке операции (технический просмотр).
