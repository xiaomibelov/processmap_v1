# feature/workspace-toolbar-restructure — EXEC_REPORT

Дата: 2026-09-03.
Роль: Executor.

## Done

- Реализована структура `global header / workspace toolbar / table header` без отдельного среднего toolbar row.
- `Поиск`, `Создать раздел`, `Проект` перенесены в `workspace-filter-toolbar` справа.
- Breadcrumbs explorer header дополнены организацией и workspace.
- Sidebar очищен от duplicate organization block.
- Status chips вынесены в модель `explorerStatusFilters.js`; фильтрация показывает совпадения с ancestors и loaded descendants.
- Добавлены hidden status preferences scoped by `orgId::workspaceId`; скрытие активного фильтра сбрасывает на `Все`.
- Preferences API backend whitelists and validates `explorer.status_filters.hidden`.
- UI evidence снят на 1280/1920 и для hidden status menu.

## Verification

- Backend preferences: `9 passed`.
- Frontend target/source: `30 passed`.
- WorkspaceExplorer smoke: `1 passed`.
- Frontend lint: passed.
- Frontend build: passed with existing Vite/Browserslist/chunk warnings.
- ui-ux-pro-max search/checklist applied.

## Risks

- Full `npm --prefix frontend test` имеет существующие unrelated failures вне WorkspaceExplorer-контура; зафиксировано в `TESTS.md`.
- Merge/deploy не выполнялись.
