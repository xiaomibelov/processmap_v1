# Agent 2 / Worker Prompt

**Contour:** `feature/process-analytics-hub-and-registry-navigation-v1`  
**Run ID:** `20260517T010715Z-47422`  
**Work Package:** A — UI shell / navigation implementation  
**Language rule:** Write all reports/docs in Russian. Keep code comments in English or Russian as fits the project. Agent prompts stay in English.

---

## Your Mission

Implement the top-level ProcessMap **Analytics Hub** and wire navigation so that:
1. The user clicks **«Аналитика»** (not directly «Реестр действий») to enter analytics.
2. «Реестр действий» becomes a module/card inside the Analytics Hub.
3. The Analytics Hub landing page has title, description, dashboard summary placeholders, and module cards.
4. Existing Product Actions Registry remains reachable from the Hub.
5. Navigation close/back behavior is clear and does not trap the user.
6. Version is bumped to `v1.0.134`.

---

## Mandatory Preflight

Before touching code, run:

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "feature/process-analytics-hub-and-registry-navigation-v1" \
  --query "ProcessMap Analytics Hub implementation Product Actions Registry navigation route model ProcessStage" \
  --format md \
  --top-k 10
```

Save output to `RAG_PREFLIGHT_WORKER_2.md` in the contour directory.

---

## Source Map Instructions

Read these files before implementing:
- `frontend/src/app/processMapRouteModel.js` — understand `PRODUCT_ACTIONS_REGISTRY_SURFACE`, `readProductActionsRegistryRoute`, `buildProductActionsRegistryUrl`.
- `frontend/src/components/ProcessStage.jsx` — understand `productActionsRegistryRoute` state pattern (lines ~915-952 and ~6451-6488).
- `frontend/src/features/explorer/WorkspaceExplorer.jsx` — understand `workspace-product-actions-registry-nav` and `project-product-actions-registry` buttons.
- `frontend/src/components/AppShell.jsx` — understand how `TopBar` props are passed.
- `frontend/src/components/TopBar.jsx` — understand back button rendering.
- `frontend/src/config/appVersion.js` — version ledger format.
- `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` — thin page wrapper pattern.

---

## Implementation Tasks

### 1. Create `ProcessAnalyticsHub.jsx`

Path: `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`

Requirements:
- Export default component `ProcessAnalyticsHub`.
- Props:
  - `workspaceId` (string)
  - `projectId` (string)
  - `projectTitle` (string)
  - `sessionId` (string)
  - `sessionTitle` (string)
  - `onOpenProductActionsRegistry` (function, optional) — call with `{ scope, workspaceId, projectId, sessionId }` to open registry.
  - `onClose` (function, optional) — close the Hub.
- Page wrapper: `<main className="processAnalyticsHubPage" data-testid="process-analytics-hub-page">`.
- Header:
  - Title: `Аналитика`
  - Description: `Сводная аналитика по процессам, действиям, свойствам и источникам данных.`
  - Close button: visible, calls `onClose`. Label: `Закрыть` or `×`.
- Dashboard summary cards row (4 cards, quiet placeholders):
  - `Действия`
  - `Свойства`
  - `Процессы`
  - `Неполные данные`
  - Use real data only if already available safely. If not, show neutral placeholder text (e.g. `—`) without fake numbers.
- Module cards grid (2 or 4 columns, responsive):
  1. **Реестр действий**
     - Description: `Действия с продуктом по процессам, товарам и этапам.`
     - CTA button: `Открыть`
     - onClick: call `onOpenProductActionsRegistry({ scope: "workspace", workspaceId, projectId, sessionId })` (or derive scope from available context).
  2. **Реестр свойств**
     - Description: `Свойства BPMN-элементов и процессных объектов.`
     - Status badge: `Скоро` / `В разработке`
     - No backend calls. No fake data model.
  3. **Дашборды**
     - Description: `Сводки по заполненности, качеству и источникам данных.`
     - Status badge: `Скоро`
  4. **Экспорт** (optional)
     - Description: `Выгрузки CSV/XLSX по выбранным процессам и разделам.`
     - Status badge: `В разработке`
- Use existing CSS custom properties (`var(--analysis-text)`, `var(--analysis-muted)`, `var(--analysis-border-soft)`).
- Do not add heavy new dependencies.

### 2. Create `ProcessAnalyticsHub.test.mjs`

Path: `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs`

Tests must assert:
- Component renders `data-testid="process-analytics-hub-page"`.
- Title "Аналитика" is present.
- Description is present.
- Module card "Реестр действий" is present with "Открыть" button.
- Module card "Реестр свойств" is present with "Скоро" status.
- Module card "Дашборды" is present.
- Close button is present.
- Clicking "Открыть" on "Реестр действий" calls `onOpenProductActionsRegistry`.
- Clicking close calls `onClose`.
- No fake numbers are rendered as real data in summary cards.

### 3. Extend `processMapRouteModel.js`

Add at the top (after `PRODUCT_ACTIONS_REGISTRY_SURFACE`):
```js
export const ANALYTICS_HUB_SURFACE = "analytics";
```

Add functions (follow the exact style of existing registry functions):
- `readAnalyticsHubRoute(locationLike)` — returns `{ active, workspaceId, projectId, sessionId }`.
- `buildAnalyticsHubUrl(routeRaw, options)` — sets `surface=analytics`.
- `buildAnalyticsHubCloseUrl(routeRaw, options)` — removes `surface`, keeps workspace/project/session.

### 4. Wire `ProcessStage.jsx` (bounded, minimal)

Add in the same area as `productActionsRegistryRoute`:
- Import `ProcessAnalyticsHub` and new route helpers.
- `analyticsHubRoute` state with `readAnalyticsHubRoute`.
- `openAnalyticsHub` callback — pushes URL with `?surface=analytics`.
- `closeAnalyticsHub` callback — removes `surface` and returns to workspace.
- Conditional render: when `analyticsHubRoute.active === true`, render `<ProcessAnalyticsHub>` BEFORE the `productActionsRegistryRoute.active` check (or in the appropriate order).
- Pass `onOpenProductActionsRegistry` to `ProcessAnalyticsHub` so it can open registry.
- IMPORTANT: When opening registry FROM analytics hub, the registry's `onClose` should return to analytics hub, not workspace. Implement this by:
  - Option A: Track `previousSurface` in state and use it in `closeProductActionsRegistry`.
  - Option B: Add `return_to=analytics` query param when opening registry from hub, and check it in close.
  - Choose the simpler bounded option.
- Pass `onOpenAnalyticsHub` prop down to `WorkspaceExplorer`.

**Rule:** Keep ProcessStage changes under ~40 lines. Follow existing patterns literally.

### 5. Update `WorkspaceExplorer.jsx`

Replace direct registry navigation buttons with analytics hub navigation:
- Workspace sidebar button (around line 1055):
  - Change `data-testid="workspace-product-actions-registry-nav"` to `data-testid="workspace-analytics-hub-nav"`.
  - Change label to `Аналитика`.
  - Change `onClick` to call `onOpenAnalyticsHub?.({ workspaceId: activeWorkspaceId })`.
  - Keep the small subtitle text appropriate (e.g. `Аналитика и реестры`).
- Project pane button (around line 2590):
  - Change `data-testid="project-product-actions-registry"` to `data-testid="project-analytics-hub"`.
  - Change label to `Аналитика`.
  - Change `onClick` to call `onOpenAnalyticsHub?.({ workspaceId, projectId })`.
- Ensure `onOpenAnalyticsHub` prop is accepted and passed through component tree (WorkspaceExplorer → ProjectPane).

### 6. Update `AppShell.jsx` and `TopBar.jsx`

- `AppShell.jsx`: Detect analytics hub route (`?surface=analytics`) similar to registry route detection. Pass `hideBackButton` or equivalent to `TopBar` when on analytics.
- `TopBar.jsx`: When on analytics surface, either hide the back button or replace it with a passive breadcrumb label. Must not break normal project/session screens.

### 7. CSS

Add scoped CSS classes in `frontend/src/styles/tailwind.css` (or the relevant CSS file):
- `.processAnalyticsHubPage`
- `.processAnalyticsHubHeader`
- `.processAnalyticsHubSummaryCards`
- `.processAnalyticsHubModuleCards`
- `.processAnalyticsHubModuleCard`
- Keep styles minimal, use existing CSS custom properties.

### 8. Version Bump

In `frontend/src/config/appVersion.js`:
- Change `currentVersion` to `"v1.0.134"`.
- Add changelog entry at index 0:
  ```js
  {
    version: "v1.0.134",
    changes: [
      "Создан верхнеуровневый раздел Аналитика (Analytics Hub).",
      "Реестр действий с продуктом теперь доступен как модуль внутри Аналитики.",
      "Добавлен placeholder для будущего Реестра свойств.",
    ],
  }
  ```

### 9. Build & Test

```bash
cd /opt/processmap-test/frontend
npm run build
```

Run tests:
```bash
cd /opt/processmap-test/frontend
node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs
node --test src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
node --test src/components/process/analysis/ProductActionsRegistryPage.test.mjs
```

All must pass.

---

## Safety Rules

- **No backend changes.**
- **No DB schema changes.**
- **No BPMN XML mutation.**
- **No Product Actions durable truth changes.**
- **No RAG runtime changes.**
- **No package install.**
- **No commit/push/PR/deploy.**
- Keep decomposition-first: extract `ProcessAnalyticsHub.jsx`, do not bolt all Hub logic into ProcessStage.

---

## Required Reports

Create these files in the contour directory (all in Russian):

1. `WORKER_2_REPORT.md` — summary of what was done.
2. `RAG_PREFLIGHT_WORKER_2.md` — preflight output.
3. `SOURCE_MAP_WORKER_2.md` — files inspected and changed.
4. `ANALYTICS_HUB_IMPLEMENTATION_REPORT.md` — details of Hub component, route model, navigation wiring.
5. `NAVIGATION_WIRING_REPORT.md` — how analytics entry replaces registry entry, close/back behavior.
6. `VERSION_UPDATE_LEDGER_PROOF.md` — proof of version bump and changelog entry.
7. `WORKER_2_VALIDATION_RESULTS.md` — build output, test results, runtime check.
8. `WORKER_2_DONE` — empty marker file.

After creating all reports, run:
```bash
cd /opt/processmap-test
./tools/pm-agent-mirror-report.sh "feature/process-analytics-hub-and-registry-navigation-v1" worker2
```
