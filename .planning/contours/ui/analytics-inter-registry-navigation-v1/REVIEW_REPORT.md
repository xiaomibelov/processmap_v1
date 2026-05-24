# Review Report — ui/analytics-inter-registry-navigation-v1

- **run_id**: `20260522T143211Z-74855`
- **contour**: `ui/analytics-inter-registry-navigation-v1`
- **reviewer**: Agent 4
- **generated_at**: `2026-05-22T15:04Z`
- **verdict**: REVIEW_PASS

## Source Truth

| Field | Value |
|-------|-------|
| Repo root | `/opt/processmap-test` |
| Branch | `uiux/registry-ui-spec-implementation-v1` |
| HEAD | `5affb5ff0abce2735df1c34fe369a39fe9c354e3` |
| origin/main | `5affb5ff0abce2735df1c34fe369a39fe9c354e3` |
| Runtime URL | `http://clearvestnic.ru:5180` |

## Checks Performed

### 1. Route model helpers
**PASS**

File: `frontend/src/app/processMapRouteModel.js`

Verified presence of:
- `PROCESS_PROPERTIES_REGISTRY_SURFACE = "process-properties-registry"` (line +3)
- `readProcessPropertiesRegistryRoute(locationLike)` — mirrors `readProductActionsRegistryRoute` pattern exactly.
- `buildProcessPropertiesRegistryUrl(routeRaw, options)` — mirrors `buildProductActionsRegistryUrl` pattern.
- `buildProcessPropertiesRegistryCloseUrl(routeRaw, options)` — mirrors `buildProductActionsRegistryCloseUrl` pattern.

All three functions handle scope normalization, workspace/project/session ID preservation, and baseSearch passthrough identically to the product-actions equivalents.

### 2. ProcessStage wiring
**PASS**

File: `frontend/src/components/ProcessStage.jsx`

Verified:
- Import added: `ProcessPropertiesRegistryPage` from `"./process/analysis/ProcessPropertiesRegistryPage.jsx"` (line +4)
- Import added: `buildProcessPropertiesRegistryCloseUrl`, `buildProcessPropertiesRegistryUrl`, `readProcessPropertiesRegistryRoute` from route model (lines +3)
- State: `[propertiesRegistryRoute, setPropertiesRegistryRoute]` initialized with `readProcessPropertiesRegistryRoute()` (line +8)
- `syncPropertiesRegistryRoute` callback registered on `popstate` (lines +8)
- `openPropertiesRegistry` callback defined — builds URL via `buildProcessPropertiesRegistryUrl`, pushes history state with `surface: "process-properties-registry"`, syncs all route states (lines +56)
- `closePropertiesRegistry` callback defined — handles `return_to=analytics` fallback and uses `buildProcessPropertiesRegistryCloseUrl` (lines +37)
- Both `!hasSession` and `hasSession` branches render `<ProcessPropertiesRegistryPage ... />` conditionally when `propertiesRegistryRoute.active` is true (lines +13 each).
- `onOpenPropertiesRegistry={openPropertiesRegistry}` passed to `ProcessAnalyticsHub` in both branches (lines 6594, 6644).
- `onOpenPropertiesRegistry={openPropertiesRegistry}` passed to `ProductActionsRegistryPage` in both branches (lines 6610, 6660).
- `onOpenProductActionsRegistry={openProductActionsRegistry}` passed to `ProcessPropertiesRegistryPage` in both branches.

### 3. Prop drilling through ProductActionsRegistryPage
**PASS**

File: `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx`

- Accepts `onOpenPropertiesRegistry = null` prop (line +1).
- Forwards it to `ProductActionsRegistryContent` as `onOpenPropertiesRegistry` (line +1).

### 4. Prop drilling through ProductActionsRegistryPanel / RegistryHeader
**PASS**

File: `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`

- `ProductActionsRegistryContent` accepts `onOpenPropertiesRegistry = null` (line 266).
- Passes to `RegistryHeader` as `onSwitchRegistry={onOpenPropertiesRegistry}` with `switchLabel="Реестр свойств"` (lines 678–679).

File: `frontend/src/components/process/analysis/registry/RegistryHeader.jsx` (untracked, created by prior contour)

- Accepts `onSwitchRegistry = null` and `switchLabel = ""` props.
- Renders `<button className="registrySwitchBtn" onClick={onSwitchRegistry} data-testid="registry-switch">{switchLabel}</button>` when `onSwitchRegistry` is truthy.

### 5. ProcessPropertiesRegistryPage switcher
**PASS**

File: `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx`

- Accepts `onOpenProductActionsRegistry = null` (line 108).
- Renders button with text "Реестр действий", class `productActionsRegistryAccentLink`, `data-testid="process-properties-switch-actions"` (lines 245–247).

### 6. Scope preservation
**PASS**

Independent browser verification:
- Start: `/app?surface=product-actions-registry&registry_scope=workspace`
- Click "Реестр свойств" → `/app?surface=process-properties-registry&registry_scope=workspace`
- Click "Реестр действий" → `/app?surface=product-actions-registry&registry_scope=workspace`
- `registry_scope=workspace` preserved across both switches.
- `openPropertiesRegistry` callback passes `workspaceId`, `projectId`, `sessionId` through to `buildProcessPropertiesRegistryUrl`, ensuring IDs are maintained.

### 7. Build
**PASS**

Command: `npm run build` (frontend directory)
Result: `✓ built in 27.48s`, 0 errors.

### 8. Tests
**PASS**

- `node --test src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` → 5/5 pass.
- `node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs` → 14/14 pass.

Version assertions updated from `v1.0.138`/`v1.0.141` to `v1.0.142` with correct changelog text match.

### 9. Runtime proof
**PASS**

Screenshots in contour directory:
- `runtime-proof-03-actions-registry.png` — Actions Registry visible.
- `runtime-proof-04-properties-registry.png` — Properties Registry with "Реестр действий" switcher visible.
- `runtime-proof-05-back-to-actions.png` — Actions Registry with "Реестр свойств" switcher visible.

Independent browser verification confirmed bidirectional switching and scope preservation on live :5180 runtime.

### 10. No scope creep
**PASS with note**

No backend endpoint changes, no new API routes, no CSS redesign, no changes to `WorkspaceExplorer`, `AppShell`, or `TopBar`.

**Note on working tree hygiene:** The branch working tree contains many uncommitted changes from previous/unrelated contours (e.g., `backend/app/routers/product_actions_registry.py`, `frontend/src/lib/api.js`, `frontend/src/styles/tailwind.css`, `.github/workflows/deploy-stage.yml`, `AGENTS.md`, plus numerous new untracked files). This contour itself only modified the 8 files listed in the PLAN scope plus `ProcessAnalyticsHub.test.mjs`. The dirty working tree did not interfere with this contour's acceptance criteria, but it should be cleaned up or committed before a broader merge.

Specifically, `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` shows a large diff in `git diff --stat` (262 insertions / 715 deletions) because the file was already heavily refactored in the working tree by prior contours. This contour only added the `onOpenPropertiesRegistry` prop acceptance and forwarding (+2 functional lines as planned). The reviewer verified the actual file content contains the required prop passing.

## Risks / Leftover Items

- `registrySwitchBtn` CSS class has no explicit styling; button is visible via default light text against dark background. Acceptable per PLAN — future UI contour may add explicit styling.
- No direct Properties Registry entry from `WorkspaceExplorer`; navigation is only available from Analytics Hub or from within a registry. Acceptable per non-goals.

## Verdict

All acceptance criteria met. Build passes. Tests pass. Runtime proof verified independently. No blockers.

**REVIEW_PASS**
