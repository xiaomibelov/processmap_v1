# SOURCE_MAP_WORKER_2

## Code branch

- Worktree: `/opt/processmap-product-actions-polished-table-part1`
- Branch: `uiux/product-actions-registry-polished-table-layout-v1-part1`
- Commit: `3836a32c9d7ff67c0dd44811e31e98d87f609675`
- Base: `origin/main@d805e1c64c1107b9e3fe6854e031694bf741b187`

## Changed files

| File | Reason |
|---|---|
| `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | Main bounded registry UI: header/export placement, grouped filters, AI controls, incomplete warning action, table markup refinements. |
| `frontend/src/styles/tailwind.css` | Registry-specific visual system: spacing, dashboard metrics, filter applied states, AI panel, warning softness, sticky table header, row separation/hover. |
| `frontend/src/config/appVersion.js` | Existing app version row/build marker bumped to `v1.0.127`. |
| `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` | Focused source-string coverage updated for the new registry layout labels and applied-filter marker. |
| `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs` | Focused source-string coverage updated to assert export controls by test id, not removed old button text. |

## Explicit non-changes

- No backend files.
- No schema files.
- No BPMN XML code.
- No RAG runtime/tooling files.
- No Product Actions persistence/data contract changes.
- No package/dependency changes.
