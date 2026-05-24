# RUNTIME_NAVIGATION — uiux/product-actions-registry-ia-layout-rework-v2

## Runtime URL
- Frontend: `http://clearvestnic.ru:5180`
- API health: `http://clearvestnic.ru:8088/health`

## How to open the registry
1. Open `http://clearvestnic.ru:5180`
2. Navigate to workspace dashboard (default landing).
3. Click **"Реестр действий"** in the workspace explorer sidebar (entry point in `WorkspaceExplorer.jsx`).
   - OR navigate directly via URL parameter:
     ```
     http://clearvestnic.ru:5180?surface=product-actions-registry&scope=workspace
     ```
4. The registry screen renders as a full page (`ProductActionsRegistryPage`) when `surface=product-actions-registry` is present.

## Route mechanics
- `frontend/src/app/processMapRouteModel.js` — `readProductActionsRegistryRoute()` reads `?surface=product-actions-registry&scope=...`.
- `ProcessStage.jsx` conditionally renders `<ProductActionsRegistryPage>` when `productActionsRegistryRoute.active === true`.
- The page wrapper is `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx`.
- The main UI is `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` (`ProductActionsRegistryContent`).

## Expected visible elements (target state after Agent 2)
1. **Header** — title "Реестр действий с продуктом" + subtitle.
2. **Scope segmented control** — "Рабочее пространство / Проект / Сессия".
3. **Summary metrics strip** — compact row: Сессии, Строк, Полных, Неполных, После фильтров.
4. **Registry toolbar** — filters (Группа, Товар, Тип, Этап, Категория, Роль, Полнота) + reset + export CSV/XLSX + AI button.
5. **Main registry table** — product actions rows OR contextual empty state inside table area.
6. **Collapsible source section** — "Источники данных" (secondary, collapsed by default when data exists).
7. **No "Вернуться" button** on dedicated registry page route (TopBar back already hidden via `AppShell.jsx`).

## Problematic strings that must disappear
- `workspace` (as user-facing UI copy)
- `frontend`
- `scope` (as user-facing UI copy)
- `Сессии workspace`
- `Workspace будет выбран текущим контекстом приложения.`
- `Сводка строится без загрузки полных данных всех сессий на frontend.`
- `Все сессии в выбранном scope, включая сессии без действий с продуктом.`
- `Загружаю read-only реестр…`
- `Backend-агрегация пока недоступна.`
- `Откройте сессию или выберите проект для preview.`

## Playwright availability
- Playwright CLI version 1.60.0 is installed.
- Chromium browser is **NOT installed** (`/root/.cache/ms-playwright/chromium-1223` missing).
- **Status:** `PLAYWRIGHT_PLANNING_FALLBACK` — Agent 3 must run review after Agent 2 completes implementation.
- Agent 3 should install Chromium if needed: `npx playwright install chromium`.

## Evidence from previous contour
- Previous contour `uiux/product-actions-registry-workspace-ux-redesign-v1` produced screenshots in its directory.
- Review verdict: `CHANGES_REQUESTED` with detailed `REWORK_REQUEST.md`.
- Current code already contains v1 changes (modified `ProductActionsRegistryPanel.jsx`, `TopBar.jsx`, `AppShell.jsx`, `tailwind.css`).
