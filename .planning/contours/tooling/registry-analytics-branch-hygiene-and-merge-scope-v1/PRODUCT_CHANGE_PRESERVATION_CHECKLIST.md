# PRODUCT_CHANGE_PRESERVATION_CHECKLIST

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`  
Run ID: `20260517T191023Z-10717`

## Analytics Hub files to preserve

| Path | Reason |
|---|---|
| `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` | Main Analytics Hub surface with nested modules/placeholders. |
| `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs` | Focused test coverage for Hub expectations. |
| `frontend/src/app/processMapRouteModel.js` | Analytics route helpers and `return_to=analytics` route behavior. |
| `frontend/src/components/ProcessStage.jsx` | Conditional rendering/wiring for Analytics and Registry surfaces. |
| `frontend/src/features/explorer/WorkspaceExplorer.jsx` | Navigation entry changed from direct registry to Analytics surface. |
| `frontend/src/components/AppShell.jsx` | Shell/top-level behavior for analytics surface context. |
| `frontend/src/components/TopBar.jsx` | TopBar label/back behavior for analytics surface. |
| `frontend/src/styles/tailwind.css` | Scoped Analytics/Registry styling used by Hub and redesign. |

## Registry redesign files to preserve

| Path | Reason |
|---|---|
| `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | Main registry redesign: metrics, filters/actions, AI controls, table shell, sources placement. |
| `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` | Focused panel behavior and layout tests. |
| `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs` | Page/route behavior tests. |
| `frontend/src/components/process/analysis/registry/ProductActionsRegistryHeader.jsx` | Registry header split into component, if included by final manifest. |
| `frontend/src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx` | Filters/action controls split into component, if included by final manifest. |
| `frontend/src/components/process/analysis/registry/ProductActionsRegistryMetrics.jsx` | Metrics shell split into component, if included by final manifest. |
| `frontend/src/components/process/analysis/registry/ProductActionsRegistryPagination.jsx` | Pagination shell split into component, if included by final manifest. |
| `frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx` | Table shell split into component, if included by final manifest. |
| `frontend/src/components/process/analysis/registry/index.js` | Registry component exports, if split components are used. |
| `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` | Registry page wrapper, if final diff against origin/main requires it. |

## Version/runtime marker files

| Path | Decision |
|---|---|
| `frontend/src/config/appVersion.js` | Preserve only if final release story intentionally includes accepted version/changelog rows from Analytics/Registry contours. |
| `frontend/src/generated/buildInfo.js` | Treat as generated/build artifact. Regenerate on clean branch; do not copy stale file blindly. |
| `frontend/public/build-info.json` | Treat as generated/public runtime proof. Regenerate on clean branch; do not copy stale file blindly. |

## Files that need explicit exclusion unless Worker 2 proves otherwise

| Path/group | Reason |
|---|---|
| `frontend/src/components/process/BpmnStage.jsx` | BPMN/Diagram contour risk; not required for Analytics/Registry preservation from reviewed facts. |
| `frontend/src/components/process/InterviewStage.jsx` | Process stage/runtime risk; not directly tied to accepted Registry/Analytics behavior. |
| `frontend/src/features/process/bpmn/stage/**` | BPMN analytics/selection/decor/load/interaction leftovers; exclude unless separately classified and justified. |
| `frontend/src/features/process/stage/**` | Diagram controls/runtime helpers; exclude unless separately classified and justified. |
| `frontend/src/styles/app/02/**`, `frontend/src/styles/app/05/**`, `frontend/src/styles/app/06-final-structure.css`, `frontend/src/styles/legacy/legacy_bpmn.css` | BPMN/Diagram styling leftovers; not part of registry product merge without explicit proof. |
| `.agents/**`, `tools/pm-agent*.sh`, `.planning/agent-logs/**` | Agent/tooling infra; not product PR scope. |
| screenshots, Playwright traces, root `*.png`, root evidence `*.json`/`*.yml` | Evidence-only artifacts; never product source. |
| `.env*` backups | Secret-adjacent; never include or print content. |

## Acceptance checklist for clean branch

- [ ] Analytics Hub opens at `?surface=analytics`.
- [ ] Registry is nested under Analytics with `return_to=analytics`.
- [ ] Placeholder modules remain placeholders.
- [ ] Registry populated project scope works.
- [ ] Empty workspace scope preserves full shell.
- [ ] AI controls are before table.
- [ ] Sources are after pagination.
- [ ] Version/build-info proof matches clean branch, not dirty historical runtime.
- [ ] No backend/schema/BPMN/RAG files in product merge scope unless separately approved.

