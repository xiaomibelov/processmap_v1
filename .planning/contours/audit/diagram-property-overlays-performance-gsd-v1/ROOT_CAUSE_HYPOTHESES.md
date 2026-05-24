# Root Cause Hypotheses — Ranked with Evidence

## Legend

| Rank | Meaning |
|------|---------|
| **confirmed** | Direct evidence observed (network log, DOM count, code trace) |
| **likely** | Strong indirect evidence, reproducible symptom |
| **possible** | Weak evidence, needs more investigation |
| **rejected** | Evidence contradicts hypothesis |

---

## High Priority

### H1 — Overlay DOM inflation
**Hypothesis**: Property overlays create too many DOM nodes, re-created on every render/tab switch.

**Rank**: ✅ **confirmed**

**Evidence**:
- Runtime measurement: overlays OFF = 8,025 total DOM nodes; overlays ON = 10,795 total DOM nodes (**+34.5%**).
- 180 `.fpcPropertyOverlay` nodes created when `showPropertiesOverlayAlways=true`.
- Each overlay container applies 8+ inline CSS properties (`--fpc-property-table-min-width`, `--fpc-property-font-size`, etc.).
- Each overlay table rebuilds rows with 4+ child elements per row (`fpcPropertyRow`, `fpcPropertyCell--key`, `fpcPropertyKeyText`, `fpcPropertyKeySep`, `fpcPropertyCell--value`).
- Source: `decorManager.js` line 1378–1457.

---

### H2 — Duplicate bpmn-js overlays
**Hypothesis**: Overlays added repeatedly without remove/cleanup.

**Rank**: ❌ **rejected**

**Evidence**:
- Runtime: Tab switch cycles with overlays ON show **exactly stable** counts: 197 `.djs-overlay` / 180 `.fpcPropertyOverlay` before and after.
- Source: `decorManager.js` line 1665–1777 implements signature-based dedupe (`contentSignature` + `geometrySignature`).
- Source: `clearPropertiesOverlayDecor()` (line 1340–1358) removes all tracked overlays by `overlayId`.
- `resetBpmnStage()` (line 4284–4310) resets `propertiesOverlayStateRef`.

---

### H3 — EventBus listener leak
**Hypothesis**: Listeners for selection/hover/viewbox registered repeatedly and not cleaned up.

**Rank**: ⚠️ **possible**

**Evidence**:
- Source: `wireBpmnStageRuntimeEvents.js` registers `eventBus.on("canvas.viewbox.changed", ...)` and `eventBus.on("selection.changed", ...)`.
- Source: `BpmnStage.jsx` `bindModelerStageEvents` / `bindViewerStageEvents` are called inside `ensureViewer()` / `ensureModeler()`.
- The eventBus cleanup is tied to `canvas.destroy` (line 165–167) and `modelerDecorBoundInstanceRef` guard (line 4561).
- **No runtime evidence** of duplicate listener firing (e.g., no console logs firing multiple times per event).
- However, `ensureModeler()` and `ensureViewer()` are async; race conditions during rapid remount could theoretically register duplicate listeners before the guard catches them.

---

### H4 — Heavy React remount
**Hypothesis**: Diagram/BPMN tab unmounts/remounts on each tab switch, forcing modeler/canvas rebuild.

**Rank**: ❌ **rejected**

**Evidence**:
- Runtime: `bpmnCanvas` count = 2 and `djsContainer` = 1 persist across all tab switches.
- Total DOM node change: ±0–26 nodes (measurement noise), not a full remount.
- Source: `BpmnStage.jsx` line 5797–5805 uses CSS `display: none / block` to toggle viewer/editor visibility.
- `viewerRef` / `modelerRef` are stable across tab switches; `ensureViewer()` returns early if `viewerRef.current` exists.

---

### H5 — BPMN modeler reinitialization
**Hypothesis**: bpmn-js Modeler/Viewer recreated instead of preserved.

**Rank**: ❌ **rejected**

**Evidence**:
- Runtime: `viewerInitPromiseRef` / `modelerInitPromiseRef` dedupe ensures single initialization.
- Source: `ensureViewer()` line 4448 returns early if `viewerRef.current` exists.
- Source: `ensureModeler()` line 4517 returns early if `modelerRef.current` exists.
- No network requests for bpmn-js chunk reload observed after initial load.

---

## Medium Priority

### H6 — Heavy data refetch
**Hypothesis**: Tab switch/overlay visibility triggers full session/BPMN/versions refetch.

**Rank**: ✅ **confirmed**

**Evidence**:
- Network log shows **26+ calls** to `/api/sessions/{id}/bpmn/versions?limit=1` in ~4 minutes.
- Tab switch triggers at least 3–5 duplicate versions head checks.
- No corresponding UI change (history modal never opened).
- Source: `ProcessStage.jsx:1518` head check is called from multiple effect paths.

---

### H7 — Accidental versions fetch
**Hypothesis**: `/bpmn/versions` called when overlays/properties shown, even though history UI not opened.

**Rank**: ✅ **confirmed**

**Evidence**:
- Same evidence as H6: `versions?limit=1` is called speculatively, not on user request.
- The `refreshSnapshotVersions` function is invoked by `useEffect` hooks watching `versionsOpen`, but also by save callbacks and presence polling.
- The `bpmnVersionsOpenRef.current` guard (line 4337) should skip updates when modal is closed, but `trackHeadStatus=true` path may still fire.

---

### H8 — Mutation on non-edit interaction
**Hypothesis**: Selection/overlay visibility triggers PATCH/PUT/save state without explicit user save.

**Rank**: ⚠️ **likely**

**Evidence**:
- Network log shows `PUT /api/sessions/{id}/bpmn` (request 46) succeeded without user pressing Save.
- Multiple `DELETE /presence` and `PUT /bpmn` aborted requests suggest background sync races.
- Source: `BpmnStage.jsx` `saveLocalFromModeler()` is called from `commandStack.changed` and other eventBus handlers.
- The `emitDiagramMutation` callback propagates to `App.jsx` which may trigger autosave.

---

### H9 — Derived analysis/property map recomputed too often
**Hypothesis**: Large maps recomputed on each hover/selection/render.

**Rank**: ⚠️ **possible**

**Evidence**:
- Source: `useCamundaPropertiesOverlayPreview.js` line 21–27: `finalizedCamundaPropertiesDraft` is a `useMemo` over `camundaPropertiesDraft` + `orgPropertyDictionaryBundle`.
- Source: `App.jsx` line 1253–1285: `propertiesOverlayAlwaysPreviewByElementId` is a `useMemo` over `showPropertiesOverlayAlways`, `draft?.bpmn_meta`, `selectedPropertiesOverlayAlwaysPreview`.
- These memoized values are reasonably bounded.
- **However**, `applyPropertiesOverlayDecor()` in `decorManager.js` iterates `registry.getAll()` (line 1609–1628) on every call when `alwaysEnabled=true`. For large diagrams, this is O(n) per trigger.
- No direct runtime measurement of recomputation cost available.

---

### H10 — CSS/layout cost
**Hypothesis**: Overlay CSS causes expensive layout/repaint (shadows, backdrop filters, transitions).

**Rank**: ⚠️ **possible**

**Evidence**:
- Source: `applyPropertiesOverlayContainerStyle()` sets 8+ inline styles per overlay container.
- Source: `rebuildPropertiesOverlayTable()` creates new DOM elements with inline CSS variables per row.
- The `.fpcPropertyOverlay` class is a table layout with `minmax()` grid columns.
- Runtime: No direct paint profiling available, but +180 styled overlay containers is a significant layout surface.
- bpmn-js `overlays.add()` with `scale: false` means the browser must reposition overlay DOM on every zoom/pan frame.

---

## Low Priority

### H11 — ResizeObserver/MutationObserver loop
**Hypothesis**: Overlay/side panel observers causing repeated layout passes.

**Rank**: ❌ **rejected**

**Evidence**:
- No `ResizeObserver` or `MutationObserver` usage found in overlay-related source files.
- No symptom of infinite layout loop observed (DOM counts stable over time).

---

### H12 — Toast/notification dedupe missing
**Hypothesis**: Version/limit messages emitted repeatedly due to repeated effects/request results.

**Rank**: ❌ **rejected**

**Evidence**:
- No toast or notification messages observed during runtime scenarios.
- Source: `ProcessStage.jsx` save-ack toasts use explicit source typing (`"bpmn_version"` vs `"save"`).

---

### H13 — Cache keys unstable
**Hypothesis**: Query/cache keys include transient objects or tab state, causing dedupe miss.

**Rank**: ⚠️ **likely**

**Evidence**:
- Source: `ProcessStage.jsx` `bpmnVersionsListRequestRef` dedupe key: `` `${requestSid}|limit=${limit}|includeXml=${...}|updateList=${...}|trackHead=${...}` ``.
- Multiple call sites may pass different `updateList` / `trackHeadStatus` values, causing key mismatch and duplicate requests.
- The `presence` endpoint is also called repeatedly with overlapping effect lifecycles.

---

### H14 — Development StrictMode double effect
**Hypothesis**: Double effects expose missing idempotency/cleanup.

**Rank**: ❌ **rejected**

**Evidence**:
- The runtime is a **production build** (`frontend/dist/` served by nginx).
- StrictMode double effects only occur in development.
- No React development warnings observed.
