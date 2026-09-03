# fix/header-and-breadcrumbs — TESTS

## RED

Backend direct project open:

- Добавлен тест `test_project_explorer_returns_full_breadcrumbs_for_direct_open`.
- До backend фикса падал с ошибкой отсутствующего поля `breadcrumbs` у `ProjectPage`.

Frontend source contracts:

- До frontend фикса падали проверки header height, расположения project search/create и источника project breadcrumbs.

## GREEN

Backend:

`PYTHONPATH=backend /tmp/processmap-header-breadcrumbs-venv/bin/python -m unittest backend.tests.test_workspace_access_controls.WorkspaceAccessControlsTest.test_project_explorer_returns_full_breadcrumbs_for_direct_open`

Результат: OK.

`PYTHONPATH=backend /tmp/processmap-header-breadcrumbs-venv/bin/python -m unittest backend.tests.test_workspace_access_controls`

Результат: OK, 10 tests. В выводе есть ожидаемые локальные Redis/Celery warnings, тесты завершились успешно.

`PYTHONPATH=backend /tmp/processmap-header-breadcrumbs-venv/bin/python -m unittest backend.tests.test_workspace_access_controls backend.tests.test_explorer_context_folder_fields`

Результат: OK, 14 tests. В выводе есть ожидаемые локальные Redis/Celery warnings, тесты завершились успешно.

Frontend focused:

`PATH=/Users/mac/.local/node/bin:$PATH node --test frontend/src/components/TextBreadcrumbs.test.mjs frontend/src/features/explorer/workspaceSidebarJoinGeometry.source.test.mjs frontend/src/features/explorer/workspaceProjectBreadcrumb.source.test.mjs frontend/src/features/explorer/workspaceProjectToolbar.source.test.mjs frontend/src/features/explorer/workspaceToolbarRestructure.source.test.mjs`

Результат: 25/25 passed.

Frontend explorer suite без известного локального Node 22 blocker:

`PATH=/Users/mac/.local/node/bin:$PATH node --test $(find frontend/src/features/explorer -name '*.test.mjs' ! -name 'SessionCreateModal.test.mjs' -print | sort) frontend/src/components/TextBreadcrumbs.test.mjs`

Результат: 195/195 passed.

Build:

`PATH=/Users/mac/.local/node/bin:$PATH npm run build`

Результат: exit 0. Остались существующие warnings: `%VITE_BUILD_ID%` undefined, stale browserslist, externalized crypto/zlib, chunks >500kB.

OpenAPI:

`PATH=/tmp/processmap-header-breadcrumbs-venv/bin:/Users/mac/.local/node/bin:$PATH ./scripts/update_openapi.sh`

Результат: exit 0, Redocly lint valid, paths 298, operations 377.

## UI сценарии

Локальный сценарий direct open:

- URL: `/app?workspace=ws_org_default_main&project=46cb886240`.
- Backend JSON содержит `context.organization`, `context.workspace`, `context.folder`.
- Backend JSON содержит `breadcrumbs`: workspace `Main Workspace`, folder `Раздел витрин`, folder `Папка прямого входа`, project `Проект хлебных крошек`.
- UI показывает полный путь: `Default / Main Workspace / Раздел витрин / Папка прямого входа / Проект хлебных крошек`.

Переход workspace -> project:

- Workspace: `workspace-filter-toolbar` содержит counter, search, create actions.
- Project: `project-filter-toolbar` содержит counter, search, `Новая сессия`.
- Search и primary action находятся в context toolbar, не в global header.

## Известное

- Полный `node --test frontend/src/features/explorer/*.test.mjs` локально блокируется существующей проблемой `SessionCreateModal.test.mjs` под Node 22: `TypeError: Cannot set property navigator of #<Object> which has only a getter`.
- Docker daemon на машине не запущен, поэтому docker compose UI/runtime verification не выполнялась. Снимки и direct-open проверка сделаны через локальный uvicorn SQLite runtime.
