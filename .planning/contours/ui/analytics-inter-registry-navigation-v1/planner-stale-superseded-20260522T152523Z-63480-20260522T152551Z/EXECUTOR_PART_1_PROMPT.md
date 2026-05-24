# Executor Prompt: ui/analytics-inter-registry-navigation-v1

## Goal

Deliver direct inter-registry navigation between Product Actions Registry and Properties Registry, preserving scope context.

## Source Truth Commands

Run before editing:

```bash
cd /opt/processmap-test
git fetch origin 2>&1 | tail -3
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git log --oneline -5 origin/main
```

Current expected truth:
- Branch: `uiux/registry-ui-spec-implementation-v1`
- HEAD: `5affb5ff0abce2735df1c34fe369a39fe9c354e3`
- origin/main: `5affb5ff0abce2735df1c34fe369a39fe9c354e3`

## Scope

Modify ONLY these files:

1. `frontend/src/app/processMapRouteModel.js`
2. `frontend/src/components/ProcessStage.jsx`
3. `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx`
4. `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
5. `frontend/src/components/process/analysis/registry/RegistryHeader.jsx`
6. `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx`
7. `frontend/src/config/appVersion.js`
8. `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs`

## Non-goals

- No backend changes.
- No new API routes.
- No CSS file changes; reuse existing inline classes or Tailwind utilities.
- No registry data/filter/table logic changes.
- No merge/deploy/PR.

## Implementation Steps

1. **Route model** (`processMapRouteModel.js`):
   - Add `export const PROCESS_PROPERTIES_REGISTRY_SURFACE = "process-properties-registry";`
   - Add `readProcessPropertiesRegistryRoute(locationLike)` — mirrors `readProductActionsRegistryRoute` exactly, using `PROCESS_PROPERTIES_REGISTRY_SURFACE` and `normalizeProductActionsRegistryScope`.
   - Add `buildProcessPropertiesRegistryUrl(routeRaw, options)` — mirrors `buildProductActionsRegistryUrl`, using `PROCESS_PROPERTIES_REGISTRY_SURFACE`.
   - Add `buildProcessPropertiesRegistryCloseUrl(routeRaw, options)` — mirrors `buildProductActionsRegistryCloseUrl`.

2. **ProcessStage** (`ProcessStage.jsx`):
   - Add import: `import ProcessPropertiesRegistryPage from "./process/analysis/ProcessPropertiesRegistryPage.jsx";`
   - Add state: `const [propertiesRegistryRoute, setPropertiesRegistryRoute] = useState(() => readProcessPropertiesRegistryRoute());`
   - Add callback `openPropertiesRegistry` mirroring `openProductActionsRegistry` but using the new route helpers and surface.
   - Add callback `closePropertiesRegistry` mirroring `closeProductActionsRegistry`.
   - In the `!hasSession` branch, after the `productActionsRegistryRoute.active` block, add `propertiesRegistryRoute.active` branch rendering `ProcessPropertiesRegistryPage`.
   - In the `hasSession` branch, do the same.
   - Pass `onOpenPropertiesRegistry={openPropertiesRegistry}` to both `ProcessAnalyticsHub` instances.
   - Pass `onOpenPropertiesRegistry={openPropertiesRegistry}` to both `ProductActionsRegistryPage` instances.
   - Pass `onOpenProductActionsRegistry={openProductActionsRegistry}` to both `ProcessPropertiesRegistryPage` instances.

3. **ProductActionsRegistryPage** (`ProductActionsRegistryPage.jsx`):
   - Accept `onOpenPropertiesRegistry = null` prop.
   - Forward it to `ProductActionsRegistryContent`.

4. **ProductActionsRegistryPanel** (`ProductActionsRegistryPanel.jsx`):
   - `ProductActionsRegistryContent` accepts `onOpenPropertiesRegistry = null`.
   - Pass `onSwitchRegistry={onOpenPropertiesRegistry}` and `switchLabel="Реестр свойств"` to `RegistryHeader`.

5. **RegistryHeader** (`RegistryHeader.jsx`):
   - Accept `onSwitchRegistry = null` and `switchLabel = ""` props.
   - Before the export toggle, render a compact text button when `onSwitchRegistry` is provided:
     ```jsx
     {onSwitchRegistry ? (
       <button type="button" className="registrySwitchBtn" onClick={onSwitchRegistry} data-testid="registry-switch">
         {switchLabel}
       </button>
     ) : null}
     ```

6. **ProcessPropertiesRegistryPage** (`ProcessPropertiesRegistryPage.jsx`):
   - Accept `onOpenProductActionsRegistry = null` prop.
   - In the header actions div (next to the back button), add:
     ```jsx
     {onOpenProductActionsRegistry ? (
       <button type="button" className="productActionsRegistryAccentLink" onClick={onOpenProductActionsRegistry} data-testid="process-properties-switch-actions">
         Реестр действий
       </button>
     ) : null}
     ```

7. **Version bump** (`appVersion.js`):
   - Change `currentVersion` to `"v1.0.142"`.
   - Add new first changelog entry with version `"v1.0.142"` and change `"Добавлено прямое переключение между Реестром действий и Реестром свойств."`.

8. **Test update** (`ProcessPropertiesRegistryPage.test.mjs`):
   - Update test 5 version assertion from `v1\.0\.138` to `v1\.0\.142`.

## Validation

```bash
cd /opt/processmap-test/frontend
npm run build
node --test src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs
node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs
```

Build must pass with 0 errors. Tests must pass.

## Runtime Proof

1. Open `http://clearvestnic.ru:5180` (or local dev server).
2. Navigate to Analytics Hub → Product Actions Registry.
3. Screenshot showing "Реестр свойств" switcher button.
4. Click switcher; screenshot Properties Registry showing "Реестр действий" button.
5. Click back; screenshot Product Actions Registry again.
6. Verify scope (workspace/project/session) preserved in URL.

Save screenshots to contour directory.

## Final Report

Write `EXEC_REPORT.md` with:
- Source truth snapshot
- Files changed with line counts
- Validation results
- Runtime proof summary
- Any risks or leftover items
