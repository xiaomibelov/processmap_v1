# feature/workspace-toolbar-restructure — UI

Дата: 2026-09-03.

## Before

Источник “до” из audit-контура, скопирован в evidence:

- `evidence/before-1280.png`
- `evidence/before-1920.png`

Наблюдение “до”: actions `Поиск / Создать раздел / Создать проект` были отдельным средним рядом между explorer header и filter chips, организация дублировалась в sidebar.

## After

Скриншоты “после” с mock API, без зависимости от stage/backend availability:

- `evidence/after-1280.png`
- `evidence/after-1920.png`
- `evidence/after-hidden-status-menu-1280.png`

DOM proof из Playwright:

- 1280: `oldToolbarCount=0`, `newToolbarCount=1`, `toolbarHeight=53`.
- 1920: `oldToolbarCount=0`, `newToolbarCount=1`, `toolbarHeight=53`.
- Breadcrumbs: `Роботизация производств / DK`.
- Sidebar starts with `Назад`, then `WORKSPACES`; organization block removed.

## Checklist

- Три уровня над таблицей: global topbar, explorer header with tabs/breadcrumbs, workspace toolbar, затем table header.
- Search и create actions находятся справа в `workspace-filter-toolbar`.
- Status chips находятся слева в том же toolbar; counter перед search.
- Menu настройки статусов открывается поверх таблицы, не клиппится родительским overflow.
- При скрытом `Готово` chip отсутствует, checkbox в меню виден как hidden, строки `Готово` остаются в режиме `Все`.
- Search icon остаётся стандартным outline `IcoSearch` 16px из проекта.
