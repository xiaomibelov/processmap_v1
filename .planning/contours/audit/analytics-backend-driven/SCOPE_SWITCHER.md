# Scope switcher UX audit

## How scope is represented today

Scope is encoded in the URL as:

- `?workspace={id}`
- `?project={id}`
- `?session={id}` (only valid when `project` is present)
- `?surface=analytics|product-actions-registry|process-properties-registry|dashboards`
- `?registry_scope=workspace|project|session` (only for product-actions registry)

The active surface is a query parameter, not a route segment. All analytics surfaces render inside `ProcessStage.jsx` inside the same `<div className="analyticsSurfaceLayout">`.

---

## Surface tabs

`AnalyticsSectionTabs.jsx` shows four tabs:

```js
const TABS = [
  { key: "overview", label: "Обзор" },
  { key: "actions", label: "Реестр действий" },
  { key: "properties", label: "Реестр свойств" },
  { key: "dashboards", label: "Дашборды" },
];
```

Clicking a tab calls `openAnalyticsHub()`, `openProductActionsRegistry()`, `openPropertiesRegistry()`, or `openDashboards()` from `useAnalyticsRouteState`.

### Tab behavior issues

1. **Tabs switch surface but do not preserve `return_to`.**
   - Only `openProductActionsRegistry()` checks whether the user came from analytics and writes `return_to=analytics`.
   - Switching from hub → actions and then to properties loses the return chain.

2. **Tabs always use the current project/session context.**
   - If you are in a session and open dashboards, you still see session dashboards.
   - There is no explicit "scope up" / "scope down" affordance.

3. **Active tab is derived from route flags, not a single source of truth.**
   - `ProcessStage.jsx` computes `activeTab` with nested ternaries.
   - This is duplicated for `hasSession` and `!hasSession` branches.

---

## Product Actions Registry scope switcher

`ProductActionsRegistryPanel.jsx` renders internal scope buttons:

- Workspace
- Project
- Session

It calls `setRegistryScope(nextScope)` which updates local state and `onScopeChange(scope)`, which eventually calls `openProductActionsRegistry({ scope })`.

### Strengths

- Scope is explicit in the UI.
- Session scope has dedicated endpoint and view-model.

### Issues

1. **Scope state is duplicated.**
   - Local `scope` state in the panel.
   - `productActionsRegistryRoute.scope` in URL.
   - Parent `ProcessStage` also derives scope from route.

2. **Project scope requires manual session selection for bulk operations.**
   - Backend returns session summaries, but bulk AI requires explicit selection.
   - This is by design (cap at 10 sessions), but the UX is two-step.

3. **Session scope switches can open the wrong session.**
   - When launched from the hub with a session context, session scope works.
   - When launched from workspace/project without a session, session scope shows an empty prompt.

---

## Process Properties Registry scope switcher

`PropertiesRegistry.jsx` has **no scope switcher**.

- Scope is derived from props: `sessionId ? "session" : projectId ? "project" : workspaceId ? "workspace" : ""`.
- If no project/session/workspace is selected, the page shows an empty state.
- The user cannot switch scope without navigating away and changing the URL manually.

### Issue

- Inconsistent with product actions registry.
- Does not leverage the backend's multi-scope support (workspace/project/session all work).

---

## Dashboards scope switcher

`AnalyticsDashboards.jsx` selects component by prop:

```jsx
sessionId ? <SessionAnalyticsDashboard /> :
projectId ? <ProjectAnalyticsDashboard /> :
            <WorkspaceAnalyticsDashboard />
```

There is **no scope switcher** in dashboards.

### Issues

1. Users cannot drill down from workspace → project → session within dashboards.
2. Users cannot switch to "all projects" from a project dashboard.
3. `AnalyticsHub` disables the dashboards card with "Будет позже".

---

## Route model inconsistencies

### `buildXxxUrl` vs `buildXxxCloseUrl`

- Each surface has its own build/build-close pair in `processMapRouteModel.js`.
- Close URLs are almost identical; duplication is high.
- Close behavior for product actions registry respects `return_to=analytics`; others do not.

### URL parameter deletion logic

- `buildProductActionsRegistryUrl` deletes `project`/`session` when scope is `workspace`.
- `buildPropertiesRegistryUrl` and `buildDashboardsUrl` keep project/session if provided, regardless of scope.
- This means properties registry URL can contain `session=` even when scope is workspace via props.

### `registry_scope` parameter

- Only product actions registry has `registry_scope`.
- Properties registry and dashboards rely on presence of `workspace`/`project`/`session`.
- There is no canonical "scope" parameter for dashboards/properties.

---

## Recommended unified scope model

### URL contract

Use a single `scope` parameter and explicit entity IDs:

```
?surface=analytics&scope=workspace&workspace=w1
?surface=product-actions-registry&scope=project&workspace=w1&project=p1
?surface=dashboards&scope=session&workspace=w1&project=p1&session=s1
```

Rules:

- `scope` is always present when a surface is active.
- `project` is allowed only for `scope=project|session`.
- `session` is allowed only for `scope=session`.
- Missing IDs fall back to the current app context.

### Scope bar component

Introduce `AnalyticsScopeBar` used by all surfaces:

```jsx
<AnalyticsScopeBar
  scope="project"
  workspaceId="w1"
  projectId="p1"
  sessionId="s1"
  workspaceTitle="..."
  projectTitle="..."
  sessionTitle="..."
  allowedScopes={["workspace", "project", "session"]}
  onScopeChange={(next) => ...}
/>
```

Features:

- Shows breadcrumb: Workspace → Project → Session.
- Clicking a breadcrumb segment scopes up.
- "Session" is enabled only when a session is loaded.
- Dropdown to pick project/session within current scope.

### Single route helper

Replace four build/close pairs with:

```js
buildAnalyticsUrl({ surface, scope, workspaceId, projectId, sessionId })
closeAnalyticsUrl({ fallbackScope, workspaceId, projectId, sessionId })
```

### Return stack

Use `return_to=surface:scope` (e.g. `return_to=analytics:workspace`) instead of boolean `analytics`. This lets any surface return to any previous surface.

---

## Files to change

- `frontend/src/app/processMapRouteModel.js` — unify scope routing.
- `frontend/src/features/analytics/useAnalyticsRouteState.js` — use unified helpers.
- `frontend/src/features/analytics/AnalyticsSectionTabs.jsx` — preserve return stack.
- `frontend/src/features/analytics/AnalyticsScopeBar.jsx` — new component.
- `frontend/src/features/analytics/PropertiesRegistry.jsx` — add scope switcher.
- `frontend/src/features/analytics/AnalyticsDashboards.jsx` — add scope switcher.
- `frontend/src/components/ProcessStage.jsx` — use single active-tab derivation.
