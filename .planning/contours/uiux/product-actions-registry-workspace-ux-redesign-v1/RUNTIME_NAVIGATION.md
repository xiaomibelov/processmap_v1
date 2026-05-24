# Runtime Navigation — Product Actions Registry

> **Contour:** `uiux/product-actions-registry-workspace-ux-redesign-v1`  
> **Purpose:** How to reach and inspect the target surface at runtime.

---

## Runtime URLs

- **Frontend gateway:** `http://clearvestnic.ru:5180`
- **API:** `http://clearvestnic.ru:8088`
- **API health:** `http://clearvestnic.ru:8088/health`

---

## Route / Surface

The registry screen is a **full-page view** triggered by URL query parameter:

```
http://clearvestnic.ru:5180/app?surface=product-actions-registry&scope=workspace
```

Or with project/session context:
```
http://clearvestnic.ru:5180/app?surface=product-actions-registry&scope=project&project=<id>
http://clearvestnic.ru:5180/app?surface=product-actions-registry&scope=session&project=<id>&session=<id>
```

### Route logic
- `frontend/src/app/processMapRouteModel.js` — `readProductActionsRegistryRoute()` parses `?surface=product-actions-registry`.
- `frontend/src/components/ProcessStage.jsx` — conditionally renders `<ProductActionsRegistryPage>` when `productActionsRegistryRoute.active` is true.

---

## How the user reaches the screen

### Path A — Direct URL
1. Open `http://clearvestnic.ru:5180/app`
2. Append `?surface=product-actions-registry&scope=workspace`

### Path B — In-app navigation
1. User is in a project/session.
2. User clicks an entry point (e.g., from workspace explorer or process stage) that calls `openProductActionsRegistry({ scope })`.
3. URL updates via `window.history.pushState`.
4. `ProcessStage` re-renders with registry page.

---

## Elements to inspect

### 1. TopBar back button
- **Locator:** `button[data-testid="topbar-back-projects"]`
- **Text:** `← Проекты` (no active session) or `← К проекту` (active session).
- **Expected after redesign:** Button should be hidden, disabled, or visually inactive when on registry route.

### 2. Page header
- **Title:** `h2.productActionsRegistryTitle`
- **Subcopy:** `p.productActionsRegistrySubcopy`
- **Expected:** User-facing analytics copy, not debug/preview language.

### 3. Scope selector
- **Locator:** `.productActionsRegistryScope` with buttons `role="tab"`.
- **Tabs:** Workspace, Проект, Сессия.
- **Expected:** Clean segmented control, active state clear.

### 4. Workspace notice (target for removal/redesign)
- **Locator:** `.productActionsRegistryWorkspaceNotice`
- **Current:** Dashed border, technical copy.
- **Expected:** Removed or restyled as quiet info line.

### 5. Session summary section (workspace/project scope)
- **Locator:** `.productActionsRegistrySessions`
- **Contains:** Session list table, bulk-AI controls, checkboxes.
- **Expected:** Functional, dense, no layout shift.

### 6. Metrics bar
- **Locator:** `.productActionsRegistrySummary`
- **Pills:** `.productActionsRegistrySummaryPill`
- **Expected:** Compact single-row metric bar, not card-like pills.

### 7. Filters
- **Locator:** `.productActionsRegistryFilters`
- **Items:** `.productActionsRegistryFilterItem` (7 dropdowns + reset).
- **Expected:** Horizontal toolbar or compact bar, not 7-column grid.

### 8. Incomplete banner
- **Locator:** `.productActionsRegistryIncompleteBanner`
- **Expected:** Still functional if incomplete rows exist.

### 9. Main preview table
- **Locator:** `.productActionsRegistryPreview`
- **Table:** `.productActionsRegistryTable`
- **Rows:** `.productActionsRegistryRow`
- **Expected:** Dense, paint-only hover, no horizontal scrollbar.

### 10. Empty state
- **Locator:** `.productActionsRegistryEmpty`
- **Expected:** One unified message, not fragmented.

### 11. Footer
- **Locator:** `.productActionsRegistryFooter`
- **Expected:** Filter summary line.

---

## States to verify

| State | How to trigger |
|-------|----------------|
| Workspace with data | Log in, ensure workspace has sessions with product actions, open `?surface=product-actions-registry&scope=workspace` |
| Workspace empty | Open registry with no data in workspace |
| Project scope | Select project scope with project context |
| Session scope | Open registry from within an active session |
| Filtered empty | Apply filters that yield no results |
| Loading | Refresh page while on registry route |
| Dark theme | Toggle theme if available |
| Light theme | Toggle theme if available |

---

## Evidence collection

- Screenshot paths should be saved relative to contour folder or `/tmp/`.
- Console log snapshot: `browser_console_messages` (Playwright MCP).
- Network check: verify no 4xx/5xx on registry API calls (`apiQueryProductActionRegistry`).

---

> **Note:** Playwright MCP was unavailable during planning (Chromium not installed). Agent 3 must verify availability before review.
