# fix/workspace-explorer-remaining — PLAN

Дата: 2026-09-02.
Ветка: `fix/workspace-explorer-remaining`.
Baseline: `origin/main` (`d8abc4a1c45fa31d3b6c68ebd1a1b21fc761aabc`).
Основание: audit artifacts `audit/workspace-explorer-remaining/REPORT.md` и `BACKLOG.md`.

Примечание по baseline: PR #894 на момент старта был `OPEN`, не merged. Так как #894 содержит audit-артефакты, а product code должен чиниться поверх актуального `main`, worktree создан от `origin/main`.

## Scope

F1. `PUT /api/sessions/:id/assignees` 500:

- Добавить `executemany` в `_PgCompatConnection`, чтобы Postgres compat поддерживал SQLite-like API, используемый repository-слоем.
- Проверить остальные usage: `rg "executemany\\("` нашёл product-вызов только в `backend/app/domains/storage/canvas_session/repository.py`; `backend/scripts/sqlite_to_postgres.py` использует реальный cursor и вне compat.
- Добавить regression test для compat.
- Расширить API-test assignees: non-empty `user_ids` сохраняются, empty `user_ids` снимает всех.

F2. Сброс дерева при назначении:

- Убрать full `load({ resetInlineChildren: true })` из веток назначения responsible/executor.
- Добавить точечный optimistic patch только в затронутую строку текущей page cache и `childItemsByFolder`.
- Rollback восстанавливает прежнюю page cache и tree state.
- Ветка `session_assignees` уже обновляла только session cache; сохранено поведение без refetch.

F3. Персистентность свёрнутости:

- Ввести явный preference key `explorer.tree.expanded`.
- Scope значения: `Record<orgId::workspaceId, string[]>`.
- Legacy `explorer.tree.collapsed` читается как fallback, потому что исторически там уже лежали expanded ids.
- Следующая запись мигрирует пользователя на `explorer.tree.expanded` и удаляет legacy unscoped entry того же workspace из отправляемого значения.

F4. Toast без layout shift:

- Заменить in-flow success notice на fixed toast overlay.
- Auto-dismiss 3500 ms.
- `role="status"` и `aria-live="polite"`.
- Закрытие по клику.

F5. Workspace toolbar:

- Оставить глобальный header для tabs/breadcrumbs/org-level navigation.
- Перенести поиск, `Создать раздел`, `Создать проект` в локальный toolbar workspace.
- Заменить текстовый glyph `⌕` на локальный SVG icon component `IcoSearch` 16px.

## Затронутые Файлы

- `backend/app/domains/storage/compat/repository.py`
- `backend/app/routers/users_preferences.py`
- `backend/tests/test_pg_compat_executemany.py`
- `backend/tests/test_session_assignees_api.py`
- `backend/tests/test_users_preferences.py`
- `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- `frontend/src/features/explorer/explorerTreePersistence.js`
- `frontend/src/features/explorer/explorerTreePersistence.test.mjs`
- `frontend/src/features/explorer/workspaceExplorerRemaining.source.test.mjs`
- `frontend/src/features/explorer/workspaceSmartSearch.source.test.mjs`

## Acceptance Mapping

- F1: covered by backend tests and compat implementation.
- F2: covered by source regression: assignment handler uses `patchExplorerItemInCaches`, no `load()`/`invalidateQueries` in handler.
- F3: covered by pure persistence tests and backend preference validator test.
- F4: covered by source regression and screenshots; runtime CLS check is expected to be 0 because toast is fixed and outside flex flow.
- F5: covered by source regression, lint/build, and screenshots.
