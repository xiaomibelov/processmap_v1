# TESTS: fix/project-kebab-menu

## Добавленный тест

### `frontend/e2e/explorer-project-kebab-menu.spec.mjs`

- **Статус:** passed
- **Запуск:**
  ```bash
  cd frontend
  export PATH="/Users/mac/.local/node/bin:$PATH"
  E2E_APP_BASE_URL=http://127.0.0.1:5178 npx playwright test e2e/explorer-project-kebab-menu.spec.mjs --project=chromium
  ```
- **Что проверяет:**
  1. ExplorerPane рендерит строку проекта (`data-testid="project-row-{id}"`).
  2. Кнопка «···» с `aria-label="Действия с проектом"` видима.
  3. После наведения на строку и клика по kebab появляется контекстное меню.
  4. Меню содержит пункт «Открыть».

## Существующие тесты explorer

### `node --test src/features/explorer/*.test.mjs`

- **Статус:** 152 passed / 1 failed
- **Результат по существующим тестам:**
  - `explorerAdaptive.source.test.mjs` — passed
  - `workspaceOpenAffordance.source.test.mjs` — passed
  - `workspaceAssigneePicker.source.test.mjs` — passed
  - `workspaceContextStatusControls.source.test.mjs` — passed
  - `workspaceFolderMove.source.test.mjs` — passed
  - `workspaceProjectMove.source.test.mjs` — passed
  - `workspaceProjectBreadcrumb.source.test.mjs` — passed
  - `workspaceSectionHeaderCleanup.source.test.mjs` — passed
  - `workspaceSmartSearch.source.test.mjs` — passed
  - `workspaceSortableColumns.source.test.mjs` — passed
  - `workspaceSubprocessTreeView.source.test.mjs` — passed
  - `work3TreeState.js` tests — passed
  - `explorerColumnVisibility.js` tests — passed
  - остальные explorer unit/source tests — passed

### Предупреждения / pre-existing failures

- `SessionCreateModal.test.mjs` падает с `TypeError: Cannot set property navigator of #<Object> which has only a getter`. Это известная несовместимость теста с Node.js v22, не связанная с данным патчем.

## Регрессии

Не обнаружены. Поведение меню у папок/сессий/разделов не изменено.
