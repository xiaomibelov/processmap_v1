# EXECUTOR PART 1 — fix/analytics-navigation-hub-and-registry-ui-restoration-v1

- **contour**: `fix/analytics-navigation-hub-and-registry-ui-restoration-v1`
- **run_id**: `20260521T120234Z-94291`
- **mode**: single-lane (substantive work in Part 1; Part 2 is shell-only)
- **base_branch**: `main` (5affb5f)
- **git_rule**: create branch `fix/analytics-navigation-hub-and-registry-ui-restoration-v1` from `origin/main`, commit atomically per file group

## Context

The analytics hub (`ProcessAnalyticsHub.jsx`) and properties registry (`ProcessPropertiesRegistryPage.jsx`) components exist in the tree but are broken:
- Analytics hub has ZERO CSS rules in `tailwind.css` — renders unstyled.
- Properties registry page is not wired into `ProcessStage.jsx` route state — unreachable.
- Route model lacks properties registry helpers.
- Tests document the missing pieces and need updating.

## Step-by-Step Instructions

### Step 0 — Git isolation
```bash
cd /opt/processmap-test
git checkout -b fix/analytics-navigation-hub-and-registry-ui-restoration-v1 origin/main
```

### Step 1 — Restore analytics hub CSS in tailwind.css

Append the following rules to `frontend/src/styles/tailwind.css` (place after `.productActionsRegistryPage` block, around line 1330):

```css
.processAnalyticsHubPage,
.processPropertiesRegistryPage {
  height: 100%;
  min-height: 0;
  overflow: auto;
  background: hsl(var(--bg-soft) / 0.72);
  padding: 18px;
}

.processAnalyticsHubSurface,
.processPropertiesRegistrySurface {
  display: grid;
  width: min(1240px, 100%);
  gap: 18px;
  margin: 0 auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  padding: 20px;
  color: #111827;
}

.processAnalyticsHubHeader,
.processPropertiesRegistryHeader {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 14px;
}

.processAnalyticsHubHeader h1,
.processPropertiesRegistryHeader h1 {
  margin: 0;
  color: #111827;
  font-size: 22px;
  line-height: 1.2;
}

.processAnalyticsHubHeader p,
.processPropertiesRegistryHeader p,
.processAnalyticsHubHeader small,
.processPropertiesRegistryHeader small {
  display: block;
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.45;
}

.processAnalyticsHubModules {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border: 1px solid #f3f4f6;
  border-radius: 8px;
  overflow: hidden;
}

.processAnalyticsHubModule {
  display: flex;
  min-height: 138px;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  border-right: 1px solid #f3f4f6;
  background: #ffffff;
  padding: 16px;
}

.processAnalyticsHubModule:last-child {
  border-right: 0;
}

.processAnalyticsHubModule h2 {
  margin: 0;
  color: #111827;
  font-size: 16px;
  line-height: 1.25;
}

.processAnalyticsHubModule p {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.45;
}

.processAnalyticsHubPlaceholder {
  color: #6b7280;
  font-size: 12px;
  font-weight: 800;
}

.processPropertiesRegistryScope {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(112px, 1fr));
  width: min(100%, 440px);
  gap: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
}

.processPropertiesRegistryScope button {
  min-height: 34px;
  border: 0;
  border-right: 1px solid #f3f4f6;
  background: #ffffff;
  color: #6b7280;
  font-size: 12px;
  font-weight: 800;
}

.processPropertiesRegistryScope button:last-child {
  border-right: 0;
}

.processPropertiesRegistryScope button.isActive {
  background: #f9fafb;
  color: #111827;
}

.processPropertiesRegistryScope button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.processPropertiesRegistryMetrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border-top: 1px solid #f3f4f6;
  border-bottom: 1px solid #f3f4f6;
}

.processPropertiesRegistryMetrics span {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  border-right: 1px solid #f3f4f6;
  padding: 0 14px;
  color: #111827;
  font-size: 14px;
  font-weight: 850;
}

.processPropertiesRegistryMetrics span:last-child {
  border-right: 0;
}

.processPropertiesRegistryMetrics b {
  color: #6b7280;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.processPropertiesRegistryFilters {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.processPropertiesRegistryFilters label {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.processPropertiesRegistryFilters label span {
  color: #6b7280;
  font-size: 11px;
  font-weight: 800;
}

.processPropertiesRegistryFilters select {
  min-height: 34px;
  min-width: 0;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
  color: #111827;
  padding: 0 8px;
  font-size: 12px;
}

.processPropertiesRegistryTable {
  display: grid;
  gap: 0;
  overflow: auto;
  border: 1px solid #f3f4f6;
  border-radius: 8px;
}

.processPropertiesRegistryTableHead,
.processPropertiesRegistryRow {
  display: grid;
  grid-template-columns: minmax(130px, 0.9fr) minmax(150px, 1fr) minmax(170px, 1.2fr) minmax(170px, 1.1fr) minmax(120px, 0.8fr) minmax(110px, 0.7fr);
  gap: 10px;
  align-items: start;
  min-width: 980px;
}

.processPropertiesRegistryTableHead {
  border-bottom: 1px solid #f3f4f6;
  background: #f9fafb;
  color: #6b7280;
  padding: 10px 12px;
  font-size: 11px;
  font-weight: 850;
  text-transform: uppercase;
}

.processPropertiesRegistryRow {
  border-bottom: 1px solid #f3f4f6;
  padding: 11px 12px;
  color: #374151;
  font-size: 12px;
  line-height: 1.4;
}

.processPropertiesRegistryRow:last-child {
  border-bottom: 0;
}

.processPropertiesRegistryRow b {
  color: #111827;
  overflow-wrap: anywhere;
}

.processPropertiesRegistryRow span {
  overflow-wrap: anywhere;
}

.processPropertiesRegistryRow small {
  display: block;
  margin-top: 2px;
  color: #6b7280;
  font-size: 11px;
}

.processPropertiesRegistryEmpty {
  display: grid;
  min-height: 180px;
  place-items: center;
  gap: 4px;
  padding: 24px;
  text-align: center;
}

.processPropertiesRegistryEmpty p {
  margin: 0;
  color: #374151;
  font-size: 13px;
}

.processPropertiesRegistryEmpty small {
  color: #6b7280;
  font-size: 11px;
}

.processPropertiesRegistrySourceTruth {
  display: block;
  margin-top: 4px;
  color: #6b7280;
  font-size: 11px;
  font-style: italic;
}
```

Also add the responsive rule inside the existing `@media (max-width: 980px)` block:
```css
  .processAnalyticsHubModules,
  .processPropertiesRegistryFilters {
    grid-template-columns: 1fr;
  }
```

Commit: `git add frontend/src/styles/tailwind.css && git commit -m "fix(css): restore analytics hub and properties registry scoped styles"`

### Step 2 — Add properties registry route model helpers

In `frontend/src/app/processMapRouteModel.js`, after the `ANALYTICS_HUB_SURFACE` constant, add:

```js
export const PROCESS_PROPERTIES_REGISTRY_SURFACE = "process-properties-registry";
```

After `buildAnalyticsHubCloseUrl`, add the four new functions. Model them exactly on the product-actions-registry pattern (same param handling, same null-safety, same `normalizeProductActionsRegistryScope` reuse for scope):

```js
export function readProcessPropertiesRegistryRoute(locationLike = typeof window !== "undefined" ? window.location : undefined) {
  try {
    const url = asLocationUrl(locationLike);
    const params = new URLSearchParams(url.search || "");
    const surface = text(params.get("surface")).toLowerCase();
    const projectId = text(params.get("project"));
    const sessionId = projectId ? text(params.get("session")) : "";
    const workspaceId = text(params.get("workspace"));
    if (surface !== PROCESS_PROPERTIES_REGISTRY_SURFACE) {
      return {
        active: false,
        scope: "workspace",
        workspaceId,
        projectId,
        sessionId,
      };
    }
    const explicitScope = text(params.get("registry_scope"));
    const scope = explicitScope
      ? normalizeProductActionsRegistryScope(explicitScope)
      : sessionId
        ? "session"
        : projectId
          ? "project"
          : "workspace";
    return {
      active: true,
      scope,
      workspaceId,
      projectId,
      sessionId,
    };
  } catch {
    return {
      active: false,
      scope: "workspace",
      workspaceId: "",
      projectId: "",
      sessionId: "",
    };
  }
}

export function buildProcessPropertiesRegistryUrl(routeRaw = {}, options = {}) {
  const route = routeRaw && typeof routeRaw === "object" ? routeRaw : {};
  const scope = normalizeProductActionsRegistryScope(route.scope ?? route.registry_scope);
  const pathname = text(options?.pathname) || DEFAULT_APP_PATHNAME;
  const hash = text(options?.hash);
  const params = new URLSearchParams(text(options?.baseSearch));
  const workspaceId = text(route.workspaceId ?? route.workspace_id);
  const projectId = text(route.projectId ?? route.project_id);
  const sessionId = projectId ? text(route.sessionId ?? route.session_id) : "";

  params.set("surface", PROCESS_PROPERTIES_REGISTRY_SURFACE);
  params.set("registry_scope", scope);
  if (workspaceId) params.set("workspace", workspaceId);
  else if (Object.prototype.hasOwnProperty.call(route, "workspaceId") || Object.prototype.hasOwnProperty.call(route, "workspace_id")) {
    params.delete("workspace");
  }

  if (scope === "workspace") {
    params.delete("project");
    params.delete("session");
  } else if (scope === "project") {
    if (projectId) params.set("project", projectId);
    else params.delete("project");
    params.delete("session");
  } else {
    if (projectId) params.set("project", projectId);
    else params.delete("project");
    if (sessionId) params.set("session", sessionId);
    else params.delete("session");
  }

  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash}`;
}

export function buildProcessPropertiesRegistryCloseUrl(routeRaw = {}, options = {}) {
  const route = routeRaw && typeof routeRaw === "object" ? routeRaw : {};
  const pathname = text(options?.pathname) || DEFAULT_APP_PATHNAME;
  const hash = text(options?.hash);
  const params = new URLSearchParams(text(options?.baseSearch));
  params.delete("surface");
  params.delete("registry_scope");
  const workspaceId = text(route.workspaceId ?? route.workspace_id);
  const projectId = text(route.projectId ?? route.project_id);
  const sessionId = projectId ? text(route.sessionId ?? route.session_id) : "";
  if (workspaceId) params.set("workspace", workspaceId);
  if (projectId) params.set("project", projectId);
  else params.delete("project");
  if (sessionId) params.set("session", sessionId);
  else params.delete("session");
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash}`;
}
```

Commit: `git add frontend/src/app/processMapRouteModel.js && git commit -m "fix(routing): add process properties registry route model helpers"`

### Step 3 — Wire ProcessPropertiesRegistryPage into ProcessStage.jsx

Make the following minimal, surgical changes to `frontend/src/components/ProcessStage.jsx`:

**3a. Import** (near the top, after `ProcessAnalyticsHub` import):
```jsx
import ProcessPropertiesRegistryPage from "./process/analysis/ProcessPropertiesRegistryPage.jsx";
```

**3b. Import route helpers** (in the existing destructured import from `../app/processMapRouteModel.js`, add):
```js
  readProcessPropertiesRegistryRoute,
  buildProcessPropertiesRegistryUrl,
  buildProcessPropertiesRegistryCloseUrl,
```

**3c. Add route state** (after `analyticsHubRoute` state block, around line 934):
```jsx
  const [propertiesRegistryRoute, setPropertiesRegistryRoute] = useState(() => readProcessPropertiesRegistryRoute());
  const syncPropertiesRegistryRoute = useCallback(() => {
    setPropertiesRegistryRoute(readProcessPropertiesRegistryRoute());
  }, []);
  useEffect(() => {
    window.addEventListener("popstate", syncPropertiesRegistryRoute);
    return () => window.removeEventListener("popstate", syncPropertiesRegistryRoute);
  }, [syncPropertiesRegistryRoute]);
```

**3d. Add open/close callbacks** (after `closeAnalyticsHub`, around line 964):
```jsx
  const openPropertiesRegistry = useCallback((options = {}) => {
    const currentUrl = asLocationUrl();
    const fromAnalytics = analyticsHubRoute.active || currentUrl.searchParams.get("surface") === "analytics";
    if (fromAnalytics) {
      currentUrl.searchParams.set("return_to", "analytics");
    }
    const nextUrl = buildProcessPropertiesRegistryUrl({
      scope: options?.scope || "workspace",
      workspaceId: options?.workspaceId || activeProjectWorkspaceId || propertiesRegistryRoute.workspaceId,
      projectId: options?.projectId || activeProjectId || propertiesRegistryRoute.projectId,
      sessionId: options?.sessionId || sid || propertiesRegistryRoute.sessionId,
    }, { baseSearch: currentUrl.search });
    window.history.pushState({ ...(window.history.state || {}), surface: "process-properties-registry" }, "", nextUrl);
    setPropertiesRegistryRoute(readProcessPropertiesRegistryRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
  }, [activeProjectId, activeProjectWorkspaceId, analyticsHubRoute.active, propertiesRegistryRoute.workspaceId, propertiesRegistryRoute.projectId, propertiesRegistryRoute.sessionId, sid]);

  const closePropertiesRegistry = useCallback(() => {
    const currentUrl = asLocationUrl();
    const returnTo = currentUrl.searchParams.get("return_to");
    let nextUrl;
    if (returnTo === "analytics") {
      nextUrl = buildAnalyticsHubUrl({
        workspaceId: propertiesRegistryRoute.workspaceId || activeProjectWorkspaceId,
        projectId: propertiesRegistryRoute.projectId || activeProjectId,
        sessionId: propertiesRegistryRoute.sessionId || sid,
      }, { baseSearch: currentUrl.search });
    } else {
      nextUrl = buildProcessPropertiesRegistryCloseUrl({
        workspaceId: propertiesRegistryRoute.workspaceId || activeProjectWorkspaceId,
        projectId: propertiesRegistryRoute.projectId || activeProjectId,
        sessionId: propertiesRegistryRoute.sessionId || sid,
      }, { baseSearch: currentUrl.search });
    }
    window.history.pushState({ ...(window.history.state || {}) }, "", nextUrl);
    setPropertiesRegistryRoute(readProcessPropertiesRegistryRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
  }, [activeProjectId, activeProjectWorkspaceId, propertiesRegistryRoute.workspaceId, propertiesRegistryRoute.projectId, propertiesRegistryRoute.sessionId, sid]);
```

**3e. Pass `onOpenPropertiesRegistry` to `ProcessAnalyticsHub`** in BOTH render sites (around lines 6517 and 6553):
```jsx
<ProcessAnalyticsHub
  ...existing_props...
  onOpenProductActionsRegistry={openProductActionsRegistry}
  onOpenPropertiesRegistry={openPropertiesRegistry}
  onClose={closeAnalyticsHub}
/>
```

**3f. Render `ProcessPropertiesRegistryPage`** in BOTH conditional blocks (after `productActionsRegistryRoute.active` blocks, before the final `WorkspaceExplorer` fallback).

For the `!hasSession` branch (around line 6526), insert:
```jsx
          ) : propertiesRegistryRoute.active ? (
            <ProcessPropertiesRegistryPage
              scope={propertiesRegistryRoute.scope}
              workspaceId={propertiesRegistryRoute.workspaceId || activeProjectWorkspaceId}
              projectId={propertiesRegistryRoute.projectId || activeProjectId}
              projectTitle={toText(activeProjectRouteContext?.projectTitle)}
              sessionId=""
              sessionTitle=""
              onScopeChange={(scope) => openPropertiesRegistry({ scope })}
              onClose={closePropertiesRegistry}
            />
```

For the `hasSession` branch (around line 6562), insert:
```jsx
          ) : propertiesRegistryRoute.active ? (
            <ProcessPropertiesRegistryPage
              scope={propertiesRegistryRoute.scope}
              workspaceId={propertiesRegistryRoute.workspaceId || activeProjectWorkspaceId}
              projectId={propertiesRegistryRoute.projectId || activeProjectId}
              projectTitle={toText(activeProjectRouteContext?.projectTitle || draft?.project_title || draft?.projectTitle)}
              sessionId={sid}
              sessionTitle={toText(draft?.title)}
              onScopeChange={(scope) => openPropertiesRegistry({ scope })}
              onClose={closePropertiesRegistry}
            />
```

Commit: `git add frontend/src/components/ProcessStage.jsx && git commit -m "fix(stage): wire ProcessPropertiesRegistryPage route and callbacks"`

### Step 4 — Update tests

**4a. ProcessAnalyticsHub.test.mjs** — flip test 13 to assert CSS EXISTS:
Replace:
```js
test("CSS does not yet define analytics hub scoped classes", () => {
  assert.equal(cssSource.includes(".processAnalyticsHubPage"), false);
  assert.equal(cssSource.includes(".processAnalyticsHubHeader"), false);
  assert.equal(cssSource.includes(".processAnalyticsHubSummaryCards"), false);
  assert.equal(cssSource.includes(".processAnalyticsHubModuleCards"), false);
  assert.equal(cssSource.includes(".processAnalyticsHubModuleCard"), false);
});
```
With:
```js
test("CSS defines analytics hub scoped classes", () => {
  assert.equal(cssSource.includes(".processAnalyticsHubPage"), true);
  assert.equal(cssSource.includes(".processAnalyticsHubHeader"), true);
  assert.equal(cssSource.includes(".processAnalyticsHubModules"), true);
  assert.equal(cssSource.includes(".processAnalyticsHubModule"), true);
  assert.equal(cssSource.includes(".processAnalyticsHubPlaceholder"), true);
});
```

**4b. ProcessPropertiesRegistryPage.test.mjs** — update test 5 to current version:
Replace the version test with:
```js
test("version changelog records analytics properties registry foundation", () => {
  assert.match(versionSource, /currentVersion: "v1\.0\.142"/);
  assert.match(versionSource, /version: "v1\.0\.142"/);
  assert.match(versionSource, /Реестр свойств добавлен в Аналитику/);
});
```

Commit: `git add frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs && git commit -m "test: update analytics hub and properties registry assertions for restored state"`

### Step 5 — Bump version

In `frontend/src/config/appVersion.js`, bump `currentVersion` to `"v1.0.142"` and prepend a changelog entry:
```js
    {
      version: "v1.0.142",
      changes: [
        "Восстановлены стили Аналитики и подключён Реестр свойств.",
        "Реестр свойств добавлен в Аналитику.",
      ],
    },
```

Commit: `git add frontend/src/config/appVersion.js && git commit -m "chore(version): bump to v1.0.142 for analytics and registry restoration"`

### Step 6 — Build verification

```bash
cd /opt/processmap-test/frontend
npm run build
```
Must succeed with no NEW errors.

### Step 7 — Test verification

```bash
cd /opt/processmap-test/frontend
node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs
node --test src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs
```
Both must pass completely.

### Step 8 — Runtime verification

1. Ensure the dev/stage server is serving the updated build at `http://clearvestnic.ru:5180`.
2. Take a screenshot of the analytics hub (`?surface=analytics`) — verify styled cards.
3. Click "Реестр свойств → Открыть" — verify navigation to `?surface=process-properties-registry`.
4. Take a screenshot of the properties registry — verify table headers and scoped styling.
5. Save screenshots to `frontend/runtime-proof-*.png` and reference them in the handoff.

## Constraints

- Do NOT modify `ProductActionsRegistryPanel.jsx` or `ProductActionsRegistryPage.jsx`.
- Do NOT modify `WorkspaceExplorer.jsx`.
- Do NOT add AppShell/TopBar analytics surface detection.
- Do NOT run `git push` or open a PR.
- Keep CSS additions minimal — only restore the scoped classes listed above.
- Keep ProcessStage.jsx changes minimal — follow the exact insertion points and patterns described.
