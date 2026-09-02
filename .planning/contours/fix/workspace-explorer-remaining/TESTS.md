# fix/workspace-explorer-remaining — TESTS

Дата: 2026-09-02.

## Пройдено

### Backend regression F1/F3

Команда:

```bash
.venv311-test/bin/python -m pytest \
  backend/tests/test_pg_compat_executemany.py \
  backend/tests/test_session_assignees_api.py \
  backend/tests/test_users_preferences.py
```

Результат:

```text
10 passed, 9 warnings in 13.71s
```

Покрытие:

- `backend/tests/test_pg_compat_executemany.py::test_pg_compat_executemany_translates_qmark_sql_for_each_row`
- `backend/tests/test_session_assignees_api.py::SessionAssigneesApiTests::test_get_and_put_session_assignees_accept_multiple_users`
- `backend/tests/test_users_preferences.py::UsersPreferencesTest::test_patch_accepts_expanded_tree_state_scoped_by_org_workspace`

Регрессия F1:

- `PUT /api/sessions/:id/assignees` с двумя `user_ids` возвращает `200`.
- Последующий `GET /api/sessions/:id/assignees` возвращает обоих пользователей.
- `PUT /api/sessions/:id/assignees` с `{"user_ids":[]}` возвращает `200`.
- Последующий `GET` возвращает пустой список.

### Frontend targeted WorkspaceExplorer tests

Команда:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" node --test \
  frontend/src/features/explorer/explorerTreePersistence.test.mjs \
  frontend/src/features/explorer/workspaceSessionAssignees.source.test.mjs \
  frontend/src/features/explorer/workspaceSmartSearch.source.test.mjs \
  frontend/src/features/explorer/workspaceExplorerRemaining.source.test.mjs
```

Результат:

```text
27 passed, 0 failed
```

Покрытие:

- persistence: `explorer.tree.expanded`, legacy fallback `explorer.tree.collapsed`, org/workspace scope, 409 LWW.
- assignment handler: no full tree refetch/reset inside `handleSaveAssignee`.
- toast: fixed overlay, `role="status"`, `aria-live="polite"`, auto-dismiss 3500 ms.
- toolbar IA: search/create actions live in workspace toolbar, not portaled global header.
- search icon: no text glyph `⌕`, local 16px SVG icon.

### Frontend lint

Команда:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm run lint
```

Результат:

```text
eslint src/features/explorer src/lib/api.js --max-warnings=0
exit 0
```

### Frontend build

Команда:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm run build
```

Результат:

```text
vite build
4022 modules transformed
built in 12.36s
exit 0
```

Warnings: existing `VITE_BUILD_ID` placeholder, old Browserslist data, browser-externalized `crypto`/`zlib`, large chunks.

## Полный frontend suite

Команда:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm test
```

Результат:

```text
3235 tests
3148 passed
83 failed
4 skipped
exit 1
```

Первые видимые failures из вывода:

- `frontend/src/App.leave-navigation-guard.test.mjs`: `app guards popstate and project/session navigation with same leave confirmation`.
- `frontend/src/features/process/processman/processmanView.test.mjs`: `cleanAgentError: HTML-тело nginx заменяется на чистый S6-текст`.
- `frontend/src/styles/dark-theme-contrast.test.mjs`: dark theme source expectation.
- `ERR_MODULE_NOT_FOUND`: import `frontend/src/features/process/bpmn/stage/profiling/panProfiler` without extension in unrelated process-stage test path.

Вывод: полный suite красный по baseline/unrelated областям вне `frontend/src/features/explorer`; targeted WorkspaceExplorer tests, lint и build зелёные.

## UI / Stage Checks

Локальный frontend:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" \
VITE_PORT=5187 \
VITE_HMR_PORT=5187 \
VITE_API_PROXY_TARGET=https://stage.processmap.ru \
npm run dev -- --host 127.0.0.1
```

After screenshots сняты с локального frontend текущей ветки на stage data:

- `screenshots/after-workspace-1280.png`
- `screenshots/after-workspace-1920.png`

Ограничение: end-to-end `PUT /api/sessions/:id/assignees` на stage этой веткой не подтверждался, потому что stage backend ещё не содержит fix `_PgCompatConnection.executemany`; до deploy branch stage продолжит отдавать старый 500.

Console при screenshot содержит unrelated шум:

- `POST /api/auth/refresh` → `401 Unauthorized` bootstrap-path.
- React warning `Maximum update depth exceeded` из `ProcessStage`, не из `WorkspaceExplorer`.

## ui-ux-pro-max

Использован установленный в audit worktree skill `ui-ux-pro-max`.

Auto-detect search results:

- `toast notification`: 0 results in `style`.
- `tree view state`: 0 results in `style`.
- `toolbar layout`: 0 results in `style`.

Повтор с явным `--domain ux`:

- `toast notification`: 1 result. Применено: transient toast, auto-dismiss 3-5s.
- `tree view state`: 5 results. Применено: state preservation, cancellable semantic state updates, accessible native controls.
- `toolbar layout`: 5 results. Применено: stacking/z-index check, fixed-position overlap check, workspace action hierarchy.
- `icons/search --domain icons`: 0 results. Поэтому использован локальный SVG icon component в стиле существующего project icon set.

Checklist quick-reference:

- `toast-dismiss`: passed, 3500 ms.
- `toast-accessibility`: passed, `role="status"` + `aria-live="polite"`, focus не крадётся.
- `content-jumping/layout-shift-avoid`: passed by implementation shape, toast is `position: fixed` and no longer occupies flex layout.
- `state-preservation`: passed by source regression; assignment handler no longer calls reset/refetch.
- `breadcrumb-web` / `nav-hierarchy`: passed; global header keeps tabs/breadcrumbs, workspace-local actions moved to toolbar.
- `form-labels`: passed for search input via `label.sr-only` and `htmlFor`.
- Visual 1280/1920: screenshots attached in `UI.md`.
