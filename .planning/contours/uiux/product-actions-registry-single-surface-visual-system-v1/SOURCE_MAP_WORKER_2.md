# SOURCE_MAP_WORKER_2

Product-code changes are committed in:

```text
/opt/processmap-product-actions-single-surface-part1
branch: uiux/product-actions-registry-single-surface-visual-system-v1-part1
commit: ceb7e527ba18176108d214b866673eed118e0c77
```

Changed files:

- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
  - Header/back/export semantics.
  - AI controls labels/chips.
  - Metrics row tone handling.
  - Filters reset text link and filters hint.
  - Warning icon softened.
  - Footer explicit no-filter state.
- `frontend/src/components/process/interview/ProductActionsPanel.jsx`
  - Existing registry entrypoint label clarified to `Реестр действий`.
- `frontend/src/styles/tailwind.css`
  - Registry visual system rewritten to one white container, separator rhythm, compact tabs/metrics/filters/AI row/table.
- `frontend/src/config/appVersion.js`
  - Version bumped to `v1.0.127` with Russian changelog line.

No backend, schema, durable Product Actions, BPMN XML, AI provider, RAG, package, or compose files changed.
