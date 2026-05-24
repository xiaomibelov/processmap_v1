# UI_RUNTIME_ACCEPTANCE_CHECKLIST

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Назначение:** runtime acceptance checklist для Agent 4 после Worker 2 + Worker 3.

## Runtime preflight

- [ ] Открыт свежий runtime `http://clearvestnic.ru:5180`.
- [ ] Source/runtime truth зафиксирован.
- [ ] Открыт путь Analytics → «Реестр действий».
- [ ] Browser screenshot/visual proof сделан после fresh load.
- [ ] Console проверена.

## A. Header

- [ ] Заголовок «Реестр действий с продуктом» виден и остаётся главным header text.
- [ ] Описание находится рядом с заголовком и не перегружает header.
- [ ] «Вернуться» виден без скролла.
- [ ] «Вернуться» визуально читается как navigation action, а не как мелкая utility-кнопка.
- [ ] CSV/XLSX компактны и расположены как secondary utility actions.
- [ ] Export meta не доминирует над title/scope/table.

## B. Scope block

- [ ] Workspace / Проект / Сессия находятся под header.
- [ ] Scope block компактен.
- [ ] Selected state ясно виден.
- [ ] Disabled state не создаёт визуальный шум.
- [ ] Маркеры визуально ближе к Explorer labels: тип/контекст/выбранность читаются как navigation semantics.

## C. Compact metrics row

- [ ] Метрики находятся непосредственно под scope.
- [ ] Все 5 counters видны: Сессий, Строк, Полных, Неполных, После фильтров.
- [ ] Counters ниже по весу, чем title и registry table.
- [ ] «После фильтров» не выше, не шире и не ярче остальных counters.
- [ ] Значения читаемы, но не hero-sized.

## D. Filters row

- [ ] Фильтры расположены горизонтально или responsive grid.
- [ ] Нет awkward vertical left-only stack.
- [ ] Reset action видим и понятен.
- [ ] Фильтры не толкают таблицу неоправданно вниз.

## E. Warning banner

- [ ] Если есть incomplete rows, warning расположен над таблицей.
- [ ] Warning заметен, но не конкурирует с таблицей.

## F. Main registry table

- [ ] Таблица остаётся главным content area.
- [ ] Первый экран ясно ведёт к таблице, а не к sources block.
- [ ] Строки читаемы.
- [ ] Status chips понятны.
- [ ] Таблица визуально не сливается с «Источники данных».

## G. «Источники данных»

- [ ] Section имеет явный заголовок.
- [ ] Section визуально отделён от таблицы spacing/background/border/divider.
- [ ] Section выглядит вторичным относительно таблицы.
- [ ] Workspace/project/session semantics понятнее, чем до rework.
- [ ] «Открыть проект» и «Открыть сессию» читаются как разные действия.

## Fail conditions

- [ ] Любой backend/schema/BPMN/RAG change без явного scope.
- [ ] Fake data.
- [ ] Product Actions durable truth change.
- [ ] Global shell/header redesign.
- [ ] Analytics Hub redesign.
- [ ] Source-only review без browser runtime.

