# PLAN — ui/analytics-inter-registry-navigation-v1

- **contour**: `ui/analytics-inter-registry-navigation-v1`
- **run_id**: `20260522T143211Z-74855`
- **branch_from**: `origin/main` (`5affb5ff0abce2735df1c34fe369a39fe9c354e3`)
- **current_branch**: `uiux/registry-ui-spec-implementation-v1`
- **execution_mode**: `SINGLE_EXECUTOR_MODE`

## 1. Source / Runtime Truth

| Field | Value |
|-------|-------|
| Repo root | `/opt/processmap-test` |
| Branch | `uiux/registry-ui-spec-implementation-v1` |
| HEAD | `5affb5ff0abce2735df1c34fe369a39fe9c354e3` |
| origin/main | `5affb5ff0abce2735df1c34fe369a39fe9c354e3` |
| Runtime URL | `http://clearvestnic.ru:5180` |
| API base | `http://clearvestnic.ru:8088` |

## 2. Problem Statement

Two analytics registries exist — Product Actions Registry and Properties Registry — but a user inside one registry cannot switch directly to the other. They must return to the Analytics Hub first. This breaks the "inter-registry" workflow.

Current gaps:
1. Route model lacks `PROCESS_PROPERTIES_REGISTRY_SURFACE` and related URL helpers.
2. `ProcessStage.jsx` never imports or renders `ProcessPropertiesRegistryPage`.
3. `ProcessStage.jsx` lacks `openPropertiesRegistry` / `closePropertiesRegistry` callbacks.
4. `ProcessAnalyticsHub` receives `onOpenPropertiesRegistry` prop but `ProcessStage` never passes it.
5. Neither registry header offers a switcher to the sibling registry.

## 3. Goals

1. Add properties registry route helpers to `processMapRouteModel.js`.
2. Wire `ProcessPropertiesRegistryPage` into `ProcessStage.jsx` with full route lifecycle.
3. Pass `onOpenPropertiesRegistry` from `ProcessStage` to `ProcessAnalyticsHub` and `ProductActionsRegistryPage`.
4. Pass `onOpenProductActionsRegistry` from `ProcessStage` to `ProcessPropertiesRegistryPage`.
5. Add compact registry-switcher buttons in both registry headers.
6. Preserve workspace/project/session scope when switching between registries.
7. Update tests and version.
8. Verify build passes and runtime navigation works.

## 4. Scope — Files to Modify

| # | Path | Change |
|---|------|--------|
| 1 | `frontend/src/app/processMapRouteModel.js` | Add `PROCESS_PROPERTIES_REGISTRY_SURFACE`, `readProcessPropertiesRegistryRoute`, `buildProcessPropertiesRegistryUrl`, `buildProcessPropertiesRegistryCloseUrl`. Mirror the existing product-actions registry pattern exactly. |
| 2 | `frontend/src/components/ProcessStage.jsx` | Import `ProcessPropertiesRegistryPage`. Add `propertiesRegistryRoute` state. Add `openPropertiesRegistry`, `closePropertiesRegistry` callbacks. Render `ProcessPropertiesRegistryPage` conditionally in both `!hasSession` and `hasSession` branches. Pass `onOpenPropertiesRegistry` to `ProcessAnalyticsHub`. Pass `onOpenPropertiesRegistry` to `ProductActionsRegistryPage`. Pass `onOpenProductActionsRegistry` to `ProcessPropertiesRegistryPage`. |
| 3 | `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` | Accept and forward `onOpenPropertiesRegistry` to `ProductActionsRegistryContent`. |
| 4 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | `ProductActionsRegistryContent` accepts `onOpenPropertiesRegistry`. Pass it to `RegistryHeader` as `onSwitchRegistry` with `switchLabel="Реестр свойств"`. |
| 5 | `frontend/src/components/process/analysis/registry/RegistryHeader.jsx` | Accept optional `onSwitchRegistry` and `switchLabel` props. Render a compact text button next to the export toggle when provided. |
| 6 | `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx` | Accept `onOpenProductActionsRegistry` prop. Add a "Реестр действий" compact text button in the header actions area (next to the back button). |
| 7 | `frontend/src/config/appVersion.js` | Bump to `v1.0.142`. Add changelog entry: "Добавлено прямое переключение между Реестром действий и Реестром свойств." |
| 8 | `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` | Update test 5 version assertion from `v1.0.138` to `v1.0.142`. |

## 5. Non-goals

- No backend endpoint changes.
- No new API routes.
- No CSS redesign; reuse existing button/link styles.
- No changes to registry data logic, filters, or table rendering.
- No changes to `WorkspaceExplorer`, `AppShell`, or `TopBar`.
- No merge/deploy/PR.

## 6. UX Direction

Registry switcher buttons:
- Compact text link style (no border, no background), same as "Сбросить фильтры" pattern.
- Positioned in the header actions row, before the back button.
- Label: "Реестр свойств" (from Actions) and "Реестр действий" (from Properties).
- Preserve current scope (workspace/project/session) and IDs when switching.

## 7. Execution Steps (Single Lane)

1. Read this PLAN.md and confirm source truth.
2. Add route model helpers in `processMapRouteModel.js`. Run `node --test` on `ProcessPropertiesRegistryPage.test.mjs` to confirm test 4 passes.
3. Add `ProcessPropertiesRegistryPage` import, state, callbacks, and rendering in `ProcessStage.jsx`.
4. Wire `onOpenPropertiesRegistry` through `ProductActionsRegistryPage.jsx` and `ProductActionsRegistryPanel.jsx`.
5. Add `onSwitchRegistry` to `RegistryHeader.jsx`.
6. Add switcher button to `ProcessPropertiesRegistryPage.jsx`.
7. Bump version and update changelog in `appVersion.js`.
8. Update `ProcessPropertiesRegistryPage.test.mjs` version assertion.
9. Run `npm run build` and verify 0 errors.
10. Run `node --test src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` and `node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs`.
11. Runtime proof: screenshot of Product Actions Registry with "Реестр свойств" switcher visible; click it and screenshot Properties Registry; click "Реестр действий" back and screenshot.
12. Write `EXEC_REPORT.md`, create `READY_FOR_REVIEW`.

## 8. Acceptance Criteria

- [ ] `PROCESS_PROPERTIES_REGISTRY_SURFACE = "process-properties-registry"` exists in route model.
- [ ] `buildProcessPropertiesRegistryUrl`, `readProcessPropertiesRegistryRoute`, `buildProcessPropertiesRegistryCloseUrl` exist in route model.
- [ ] `ProcessStage.jsx` imports and renders `ProcessPropertiesRegistryPage`.
- [ ] `ProcessStage.jsx` has `openPropertiesRegistry` and `closePropertiesRegistry` callbacks.
- [ ] `ProcessAnalyticsHub` receives `onOpenPropertiesRegistry` from `ProcessStage`.
- [ ] `ProductActionsRegistryPage` receives and passes `onOpenPropertiesRegistry`.
- [ ] `RegistryHeader` renders switcher button when `onSwitchRegistry` is provided.
- [ ] `ProcessPropertiesRegistryPage` renders "Реестр действий" switcher button.
- [ ] Scope (workspace/project/session) and IDs are preserved when switching.
- [ ] `npm run build` passes with 0 errors.
- [ ] `ProcessPropertiesRegistryPage.test.mjs` passes.
- [ ] `ProcessAnalyticsHub.test.mjs` passes.
- [ ] Runtime proof shows direct registry switching works.

## 9. Risks

| Risk | Mitigation |
|------|------------|
| ProcessStage is 6966 lines; edit collisions likely | Make minimal, patterned changes; grep before/after to verify. |
| Properties registry test asserts v1.0.138 | Update test to v1.0.142 as part of contour. |
| Existing dirty working tree | Only modify files in scope; do not stage unrelated files. |

## 10. Gates

- [x] Gate 1 — Source/runtime truth captured
- [x] Gate 2 — Bounded scope defined
- [x] Gate 3 — Files listed
- [x] Gate 4 — Non-goals locked
- [x] Gate 5 — Acceptance criteria defined
- [x] Gate 6 — Execution mode set (single-lane)
- [x] Gate 7 — Executor prompt ready
- [x] Gate 8 — Reviewer prompt ready
