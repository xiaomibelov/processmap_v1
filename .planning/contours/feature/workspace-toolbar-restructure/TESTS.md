# feature/workspace-toolbar-restructure — TESTS

Дата: 2026-09-03.

## Automated

Backend preferences:

```bash
.venv311-test/bin/python -m pytest backend/tests/test_users_preferences.py -q
```

Result: `9 passed, 6 warnings`.

Frontend target/source:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" node --test \
  frontend/src/features/explorer/explorerStatusFilters.test.mjs \
  frontend/src/features/explorer/workspaceToolbarRestructure.source.test.mjs \
  frontend/src/features/explorer/workspaceExplorerRemaining.source.test.mjs \
  frontend/src/features/explorer/workspaceSmartSearch.source.test.mjs \
  frontend/src/components/navZonePartA.source.test.mjs \
  frontend/src/features/explorer/workspaceAssigneePicker.source.test.mjs
```

Result: `30 passed`.

Smoke render:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm --prefix frontend run test:smoke -- src/features/explorer/WorkspaceExplorer.smoke.test.jsx
```

Result: `1 passed`.

Lint:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm --prefix frontend run lint
```

Result: passed.

Build:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm --prefix frontend run build
```

Result: passed. Existing warnings only: `%VITE_BUILD_ID%`, stale Browserslist data, browser externalization for `crypto`/`zlib`, chunk size.

Full frontend suite note:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm --prefix frontend test
```

Observed before final targeted run: unrelated existing failures outside this contour (`App.leave-navigation-guard`, `processmanView`, missing `panProfiler`, dark-theme source guard). Latest targeted contour checks are green.

## ui-ux-pro-max

Commands:

```bash
python3 .../scripts/search.py "toast notification" --domain ux -n 8
python3 .../scripts/search.py "tree view state" --domain ux -n 8
python3 .../scripts/search.py "toolbar layout" --domain ux -n 8
python3 .../scripts/search.py "search" --domain icons -n 8
```

Results used:

- `toast notification`: 1 result, auto-dismiss 3–5 seconds.
- `tree view state`: 2 results, active state and deep linking.
- `toolbar layout`: 8 results, including content jumping, z-index, overflow clipping.
- `search` icons: 1 result, outline magnifying-glass for search input.

Pre-delivery checklist applied:

- No layout shift from adding toolbar controls; toolbar height stable at 53px on 1280/1920.
- Popover is not clipped by toolbar overflow.
- Icon-only status settings button has `aria-label`.
- Active tabs/chips remain visually distinguishable.
- No extra fourth header row introduced.

## Manual / Visual

- 1280 screenshot: `evidence/after-1280.png`.
- 1920 screenshot: `evidence/after-1920.png`.
- Hidden status state: `evidence/after-hidden-status-menu-1280.png`.

Checks:

- Старый `workspace-explorer-toolbar` отсутствует в DOM.
- Новый `workspace-filter-toolbar` содержит chips, counter, search, create actions.
- Breadcrumbs содержат `Роботизация производств / DK`.
- Sidebar больше не содержит block `ORGANIZATION / Роботизация производств`.
- Скрытие активного filter сбрасывает `statusFilter` на `all` по source-test guard.
- Hidden status preferences scoped by `orgId::workspaceId`.
