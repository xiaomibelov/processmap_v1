# feature: реструктурировать тулбар WorkspaceExplorer

## Что изменено

- Удалён отдельный средний ряд `workspace-explorer-toolbar`; поиск и кнопки создания перенесены в единственный `workspace-filter-toolbar` рядом с chips.
- Breadcrumbs explorer header теперь начинаются с организации и workspace: `Организация / Workspace / ...`.
- Блок `ORGANIZATION / Роботизация производств` убран из sidebar; sidebar начинается с `Назад` и `WORKSPACES`.
- Status chips переведены на единую модель фильтрации с показом ancestors/loaded descendants.
- Добавлено меню настройки видимых status chips с preferences `explorer.status_filters.hidden`, scoped by `orgId::workspaceId`.
- Скрытие активного status filter сбрасывает фильтр на `Все`; hidden statuses не участвуют как facets, но строки остаются видимыми в `Все`.
- Backend Preferences API получил whitelist/validation для нового ключа.

## Тесты

- `.venv311-test/bin/python -m pytest backend/tests/test_users_preferences.py -q` — `9 passed`.
- `node --test` target для explorer/source guards — `30 passed`.
- `npm --prefix frontend run test:smoke -- src/features/explorer/WorkspaceExplorer.smoke.test.jsx` — `1 passed`.
- `npm --prefix frontend run lint` — passed.
- `npm --prefix frontend run build` — passed with existing Vite/Browserslist/chunk warnings.

## UI evidence

- `UI.md`: before screenshots from audit contour and after screenshots for 1280/1920.
- Playwright DOM proof: `oldToolbarCount=0`, `newToolbarCount=1`, toolbar height `53px` at 1280 and 1920.

## Notes

- Full `npm --prefix frontend test` still has unrelated existing failures outside this contour; targeted explorer/backend/lint/build checks are green.
- Merge только после explicit approve.
