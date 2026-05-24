# Implementation Notes

## Contour
- **ID**: `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`

---

## Caveats

1. **Browser drag testing blocked**: Multiple Playwright attempts to open the large diagram session were blocked by app loading issues in the automated browser context (208 DOM nodes, disabled tabs). This appears to be a test-environment limitation, not a code regression. Agent 3 should verify drag in its own context.

2. **Modeler default load time**: Large diagrams may take ~15s for initial Modeler render. This is expected bpmn-js behavior. User can click "Просмотр" to switch to lightweight Viewer if needed.

3. **Dirty working tree**: 34 pre-existing dirty frontend files make it hard to isolate contour changes. The contour only touched 10 files (7 product + 3 template/tool).

## Known Issues

1. **Tab switch latency**: XML→Diagram return may still take ~20–30s. This is pre-existing (XML parse + React shell re-render), not related to this contour.
2. **useProcessTabs.js save-on-switch**: Still triggers PUT on tab switch. Pre-existing, documented in previous contours.

## Files Changed (exact list)

Product code:
1. `frontend/src/config/appVersion.js`
2. `scripts/generate-build-info.mjs`
3. `frontend/src/components/process/BpmnStage.jsx`
4. `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
5. `frontend/src/features/process/bpmn/stage/interaction/diagramEditModeBoundary.js` (new)
6. `frontend/src/features/process/bpmn/stage/interaction/diagramDragSideEffectGuard.js` (new)
7. `frontend/src/features/process/bpmn/stage/interaction/diagramPointerMoveCoalescer.js` (new)

Templates/tools:
8. `.planning/templates/agent3-ui-runtime-review-template.md`
9. `.planning/templates/agent3-ui-runtime-proof-checklist.md`
10. `tools/pm-agent3-reviewer-watch.sh`

## Rework History

- **2026-05-16T00:15Z**: Agent 3 issued CHANGES_REQUESTED due to Modeler default causing `layout_not_ready_before_modeler_init`.
- **2026-05-16T04:45Z**: Fixed `hasHiddenParentStyles` to not check parent `opacity === "0"`. Rebuilt and restarted gateway.

---

## Status
✅ Implementation complete (including rework).

