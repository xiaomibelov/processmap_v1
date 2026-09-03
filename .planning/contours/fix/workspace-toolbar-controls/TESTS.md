# fix/workspace-toolbar-controls — TESTS

## RED

Команда:

`PATH=/Users/mac/.local/node/bin:$PATH node --test frontend/src/features/explorer/work3TreeState.test.mjs frontend/src/features/explorer/workspaceToolbarControls.source.test.mjs`

Первый запуск падал ожидаемо:

- `work3TreeState.js` не экспортировал `collectExpandableTreeIds`, `getTreeBulkExpansionState`, `buildTreeBulkExpandedMap`.
- В toolbar не было `workspace-tree-bulk-toggle`.
- Bulk handler отсутствовал.
- Project kebab не имел relative positioning anchor.
- `ContextMenu` был absolute и не имел viewport clamping.

## GREEN

Focused bulk/menu:

`PATH=/Users/mac/.local/node/bin:$PATH node --test frontend/src/features/explorer/work3TreeState.test.mjs frontend/src/features/explorer/workspaceToolbarControls.source.test.mjs`

Результат: 14/14 passed.

Workspace/explorer contracts:

`PATH=/Users/mac/.local/node/bin:$PATH node --test frontend/src/features/explorer/workspaceToolbarControls.source.test.mjs frontend/src/features/explorer/workspaceToolbarRestructure.source.test.mjs frontend/src/features/explorer/workspaceAssigneePicker.source.test.mjs frontend/src/features/explorer/workspaceOpenAffordance.source.test.mjs frontend/src/features/explorer/workspaceProjectToolbar.source.test.mjs frontend/src/features/explorer/work3TreeState.test.mjs frontend/src/features/explorer/explorerTreePersistence.test.mjs`

Результат: 36/36 passed.

Explorer suite без известного локального Node 22 blocker:

`PATH=/Users/mac/.local/node/bin:$PATH node --test $(find frontend/src/features/explorer -name '*.test.mjs' ! -name 'SessionCreateModal.test.mjs' -print | sort) frontend/src/components/TextBreadcrumbs.test.mjs`

Результат: 204/204 passed.

Smoke render:

`PATH=/Users/mac/.local/node/bin:$PATH npm run test:smoke -- src/features/explorer/WorkspaceExplorer.smoke.test.jsx`

Результат: 1/1 passed.

Lint:

`PATH=/Users/mac/.local/node/bin:$PATH npm run lint`

Результат: exit 0.

Build:

`PATH=/Users/mac/.local/node/bin:$PATH npm run build`

Результат: exit 0. Существующие warnings: `%VITE_BUILD_ID%`, stale Browserslist, browser externalization for `crypto`/`zlib`, chunks >500kB.

## Массовое раскрытие 100+ строк

Добавлен pure regression в `work3TreeState.test.mjs`:

- fixture: 50 sections + 50 child folders + 100 projects = 200 expandable ids.
- Проверяется линейный сбор ids, отсутствие мутации входной expanded map и итоговое состояние `expanded`.
- Локальный результат: тест прошёл, elapsed около 1-2 ms.

## Kebab меню

Проверено source guard:

- section/folder rows: menu содержит открыть, раскрыть/свернуть, назначение, перемещение, переименование, удаление по правам.
- project rows: menu содержит открыть, назначение, перемещение, переименование, удаление по правам.
- session rows: menu содержит переименование/удаление по правам.
- project row получил relative anchor.
- `ContextMenu` переведён на fixed positioning с viewport clamping.

## Известное

- Полный `node --test frontend/src/features/explorer/*.test.mjs` локально по-прежнему исключает `SessionCreateModal.test.mjs`: существующий Node 22 blocker `TypeError: Cannot set property navigator of #<Object> which has only a getter`.
- В этом контуре backend/API не менялись; `docs/openapi.yaml` не регенерировался.
