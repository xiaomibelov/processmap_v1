# Step 2 Handoff: Single Camunda Extension Application Path

## Status

Complete. Branch pushed and PR opened.

- **Branch:** `refactor/single-camunda-extension-apply`
- **PR:** https://github.com/xiaomibelov/processmap_v1/pull/496
- **Base:** `main` (includes merged Step 1 / PR #495)
- **Commit:** `c01a9e8c`

## Goal Achieved

The live BPMN modeler is now the single source of truth for managed Camunda extensions. The separate XML-merge production path (`finalizeCamundaExtensionsXml` / `transformPersistedXml`) has been removed.

Production flow: apply state to modeler → serialize XML from modeler → PUT.

## Key Changes

- `frontend/src/components/process/BpmnStage.jsx`
  - Removed `transformPersistedXml` and `reconcileTemplateInsertCamundaStateFromXml`.
  - Removed the canonical re-persist block in `saveLocalFromModeler`.
  - Removed `finalizeCamundaExtensionsXml` import.
- `frontend/src/features/process/save/saveBpmnState.js`
  - Property operations require and delegate to `flushSave`.
  - Removed direct canonical XML build fallback.
- Deleted `frontend/src/features/process/camunda/camundaExtensionsSaveBoundary.js` and its test (no production callers).
- Updated `BpmnStage.camunda-guard-lifecycle.test.mjs` for the identity transform and removed finalize/reconcile assertions.
- Updated E2E specs:
  - `bpmn-property-delete.spec.mjs` — deletion flushes immediately, global save disabled afterwards.
  - `bpmn-property-pipeline-smoke.spec.mjs` — same immediate-delete behavior.
  - `bpmn-copy-paste-properties-save-button-reload.spec.mjs` — headless-safe modeler-API copy/paste, relaxed robot-meta assertions (native copy/paste preserves standard BPMN extension elements only).

## Verification

| Suite | Result |
|-------|--------|
| `npm run build` | passed |
| Targeted `node --test` (31 tests) | passed |
| Playwright E2E `bpmn-property-pipeline-smoke`, `bpmn-property-delete`, `bpmn-copy-paste-properties-save-button-reload` | 3/3 passed |

> Note: `node --test` tests that depend on `jsdom@28.1.0` still fail globally under Node 18 (`ERR_REQUIRE_ESM`), unrelated to this contour. The targeted non-jsdom unit tests pass.

## Next Step

Step 3 of the Top-10 duplication refactor. Do not merge without explicit approval.
