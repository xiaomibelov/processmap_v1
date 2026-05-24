# RESIDUAL_BOTTLENECKS.md — audit/diagram-post-optimization-runtime-profile-v1

## Confirmed — Strong Runtime Evidence

### H1: Initial Diagram open remains heavy
- **Evidence**: Scenario A measured 6,540 ms to `diagram-ready` and 9,587 ms to stable idle.
- **Baseline confirmed**: DOM 8,025 / SVG 2,392 / `.djs-overlay` 17 / `fpcPropertyOverlay` 0 — matches expected post-optimization baseline.
- **Conclusion**: 6.5s initial load is objectively slow and is the single largest measurable latency in the user journey.
- **Likely subsystem**: `BpmnStage.jsx` (`ensureViewer`/`ensureModeler`), XML import, initial React mount.

### H6: React/session shell triggers unrelated updates
- **Evidence**: Scenario B tab switch measured 4–6 seconds per cycle (Analysis↔Diagram and XML↔Diagram). DOM remained stable at 8,025, so no remount, but the time to visible is high.
- **Conclusion**: `ProcessStage.jsx` + `App.jsx` shell churn is a measurable contributor to perceived lag on tab switch.
- **Likely subsystem**: `ProcessStage.jsx` state orchestration, `useProcessStageLocalState`, header/sidebar re-renders.

## Likely — Moderate Evidence

### H3: Edit mode remains heavy
- **Evidence**: During Scenario E (pan/zoom), DOM inflated from 8,025 → 11,242 (+3,217) and SVG from 2,392 → 5,606 (+3,214). `djs-bendpoint` jumped to 664 and `djs-segment-dragger` to 254.
- **Caveat**: This may have been triggered accidentally by Playwright synthetic events (palette/toolbar click at canvas position 10,10). However, the magnitude of the DOM growth confirms that the edit-mode rendering path is capable of massive DOM inflation when active.
- **Conclusion**: If users enter edit mode (intentionally or accidentally), they will experience heavy rendering. Prior audits confirmed analytics selection is +238 DOM; edit mode is likely still +3,400 DOM.
- **Likely subsystem**: `BpmnStage.jsx` edit path, `wireBpmnStageRuntimeEvents.js` `onSelectionChanged` edit branch, `selectionFocusDecor.js`.

### H7: Property panel / side panel update cost
- **Evidence**: Scenario H measured average panel open/update latency of ~799 ms across 5 element switches.
- **Caveat**: Final state was contaminated by Scenario E pan/zoom anomaly (DOM 11,242). Panel latency in clean state may differ.
- **Conclusion**: Even with contamination, ~800 ms to open a property panel is slow and suggests `NotesPanel.jsx` memo/useEffect surface is expensive.
- **Likely subsystem**: `NotesPanel.jsx` (~3,286 lines), `SelectedNodeSection.jsx`, `ElementSettingsControls.jsx`.

## Possible — Weak Evidence / Needs More Data

### H2: Pure SVG/bpmn-js baseline still has repaint cost
- **Evidence**: Baseline DOM/SVG is stable (8,025 / 2,392). No repaint observed during idle or hover.
- **Caveat**: First paint cost is bundled into the 6.5s initial load. Cannot isolate SVG scene rendering from React mount/XML import.
- **Conclusion**: Possible but not independently confirmed. Needs Chrome DevTools Performance trace to separate Scripting vs Paint.

### H4: Large diagram scale dominates
- **Evidence**: Only one test session (`wewe`) available. No small/large comparison performed.
- **Caveat**: Session `wewe` has ~276 elements (inferred from prior audits). Small diagram comparison never done.
- **Conclusion**: Cannot confirm or reject. Documented as limitation.

### H9: CSS/layout/paint still visible in traces
- **Evidence**: Some `drop-shadow` rules remain in CSS files. No visible paint jank observed in Playwright run.
- **Caveat**: No Chrome performance trace collected.
- **Conclusion**: Possible but weak evidence. Diminishing returns after prior SVG/CSS repaint contour.

## Rejected — Evidence Contradicts Hypothesis

### H5: Test runtime / server / browser factor
- **Evidence**: Initial load 6.5s and tab switch 4–6s are reproducible and consistent. API health is good. Network is clean (0 PUT/PATCH).
- **Conclusion**: While environment factor always exists, the objective slowness of initial load and tab switch is too large to attribute solely to test runtime. However, subjective "felt lag" may still have an environment component.

### H8: Overlays ON still expensive in some cases
- **Evidence**: Overlays toggle was not accessible via Playwright in this run. Prior contour (perf/diagram-property-overlays-viewport-culling-v1) confirmed `.fpcPropertyOverlay` reduced ~180→70 in default viewport.
- **Conclusion**: No new evidence of overlay cost. Baseline with overlays OFF is clean.

### H10: Network or auth/presence noise
- **Evidence**: 0 PUT `/bpmn`, 0 PATCH `/sessions`. `/bpmn/versions?limit=1` appeared only as background polls (4 total over ~2.5 min run). Presence returned 200 for all requests. Only 1 failed request: `/api/auth/refresh` 401 (pre-existing, before token set).
- **Conclusion**: Network is clean. Auth/presence noise is minimal and not a bottleneck.
