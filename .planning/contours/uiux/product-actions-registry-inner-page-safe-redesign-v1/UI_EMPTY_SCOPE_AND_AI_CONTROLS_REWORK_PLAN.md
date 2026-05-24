# План rework: empty scope и размещение AI controls

Контур: `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
Run: `20260517T144447Z-92350`  
Текущий статус: `CHANGES_REQUESTED`

## Причина rework

Agent 4 вернул `CHANGES_REQUESTED`, потому что runtime на `:5180` показал два UX-блокера:

- путь `Analytics -> Реестр действий` может открывать пустой workspace scope, где основной registry выглядит сломанным: нет заголовков таблицы, нет AI controls, первичный контент неочевиден;
- в populated project scope AI controls находятся ниже таблицы/пагинации в секции источников, хотя это первичные действия registry и они должны быть рядом с filters/export controls.

Отдельный merge/release blocker: workspace dirty и checkout не canonical. Это не чинится product-code rework, но должно быть классифицировано до любого финального `REVIEW_PASS`.

## Цель

Сделать и доказать понятную иерархию страницы «Реестр действий с продуктом» в двух состояниях:

- empty workspace scope;
- populated project scope.

Основная область registry всегда должна сохранять структуру:

- title/description;
- scope tabs;
- metrics;
- filters/actions;
- AI controls;
- warning/empty state;
- table shell с headers или осознанным empty-state;
- pagination, если есть rows.

Секция `Источники данных` остается вторичной и не содержит primary registry controls.

## Границы

Входит:

- локальная правка UI hierarchy страницы registry;
- empty-state/table-shell поведение без fake data;
- перенос AI controls в primary actions area;
- сохранение компактности CSV/XLSX/export controls;
- документация acceptance/hygiene для reviewer.

Не входит:

- app shell/header/sidebar redesign;
- Analytics Hub redesign;
- backend/schema/Product Actions durable truth/BPMN/RAG changes;
- package install;
- fake data;
- broad refactor;
- unrelated Diagram/Product Actions AI work.

## Разделение работы

### Worker 2: UI implementation

Самостоятельно исправляет rendering registry page:

- empty workspace scope не выглядит как broken blank content;
- table headers или deliberate empty-state shell остаются видимыми;
- filters/actions и AI controls видимы в primary area;
- AI controls вынесены из secondary sources section;
- exports остаются compact utility actions;
- `Вернуться` остается ясным navigation action;
- data flow и shell не меняются;
- при product-code изменениях обновляется version row до следующей canonical version.

### Worker 3: UX/spec + hygiene lane

Самостоятельно готовит acceptance/spec и hygiene classification:

- критерии для empty workspace scope;
- критерии для populated project scope;
- критерии AI controls placement;
- критерии separation секции источников;
- классификацию dirty workspace по категориям;
- checklist для Agent 4 runtime review.

Worker 3 не исполняет runtime review и не проверяет реализацию Worker 2.

### Agent 4: final review

Reviewer выдает `REVIEW_PASS` только если:

- оба worker markers есть;
- fresh `:5180` runtime соответствует build-info/version;
- empty workspace и populated project paths проходят браузерную проверку;
- console clean;
- viewing/navigation не делают unsafe `PUT/PATCH/DELETE`;
- branch/workspace hygiene classified and actionable.

## Готовность к выполнению

- `WORKER_2_REWORK_PROMPT.md` и `WORKER_3_REWORK_PROMPT.md` независимы.
- Только reviewer prompt ожидает оба worker markers.
- Для блокировок используются только `EXEC_PART_1_BLOCKED.md` и `EXEC_PART_2_BLOCKED.md`.
- `CHANGES_REQUESTED` является актуальным статусом поверх старых pass reports.
