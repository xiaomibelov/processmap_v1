# UI — session assignees hotfix

## Что изменено

- Стык sidebar/workspace: sidebar стал фиксированной колонкой с собственной правой границей, без `border-r-0`.
- Hover/active подсветка workspace rows теперь inset внутри sidebar (`px-2` wrapper, `rounded-md` rows), не доходит до разделителя.
- Левый sidebar header и правые content headers используют общий token `--explorer-header-h: 2.5rem`.
- Workspace counter, role и edit icon ограничены внутри строки через `min-w-0`, `truncate`, `shrink-0`.
- В project sessions table добавлена колонка `Исполнители`.
- В assignee cell отображается стек аватаров до двух видимых исполнителей и overflow `+N`; tooltip показывает всех исполнителей.
- Диалог назначения для session assignees переведён на checkbox multi-select.

## Screenshots

PNG-скриншоты не получены в текущем окружении: Playwright MCP был занят чужой browser session, а fallback Docker pull `mcr.microsoft.com/playwright:v1.58.0-noble` застрял на retry слоя `6f3b9906e35d` и был остановлен.

Планируемые файлы:

- `screenshots/sidebar-join-1280-debug.png`
- `screenshots/sidebar-join-1920-debug.png`
- `screenshots/assignee-stack.png`
- `screenshots/assignee-dialog-1280-debug.png`

## Проверка без PNG

- `workspaceSidebarJoinGeometry.source.test.mjs` проверяет единый right-border, отсутствие `border-r-0`, inset highlights и общий header height token.
- `npm run build` прошёл, значит обновлённый shell компилируется в production bundle.

Debug overlay не добавлялся в product code.
