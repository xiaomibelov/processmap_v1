# RUNTIME_EVIDENCE — audit/diagram-baseline-no-overlays-canvas-profile-v1

## Browser Environment
- **URL**: `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`
- **Page Title**: ProcessMap
- **Viewport**: Default Playwright viewport
- **Console errors**: Only pre-existing 401 Unauthorized on `/api/auth/me` and `/api/sessions/4c515d1c6e/presence`

---

## DOM/SVG Counts

### Baseline (Diagram tab loaded, no selection, overlays OFF)
```
Total DOM nodes: 8025
SVG nodes: 2392
.djs-overlay: 17
.fpcPropertyOverlay: 0
[data-element-id]: 276
.djs-shape: 162
.djs-connection: 112
.bpmnCanvas: 2
.djs-container: 1
```

### After Selection (10 elements clicked sequentially)
```
Total DOM nodes: 11251 (+3226, +40%)
SVG nodes: 5603 (+3211, +134%)
.djs-overlay: 17 (stable)
.fpcPropertyOverlay: 0 (stable)
[data-element-id]: 276 (stable)
.selected: 4
.djs-bendpoint: 916
.djs-bendpoints.fpcFocusDim: 907
```

### After Tab Switch (Diagram → Analysis → Diagram → XML → Diagram)
```
Total DOM nodes: 7994 (returns to near-baseline)
SVG nodes: 2383 (returns to near-baseline)
.djs-overlay: 17
.fpcPropertyOverlay: 0
```

### Pan/Zoom (5 cycles)
```
Total DOM nodes: 8025 (stable)
SVG nodes: 2392 (stable)
.djs-overlay: 17 (stable)
.fpcPropertyOverlay: 0 (stable)
```

### Hover (10 elements)
```
Total DOM nodes: 11192 (stable across all hovers)
SVG nodes: 5570 (stable across all hovers)
```

---

## Network Observations

### On Load
```
GET /api/sessions/4c515d1c6e/bpmn?raw=1&include_overlay=0  → 200 OK
GET /api/sessions/4c515d1c6e/bpmn/versions?limit=1  → 200 OK (3x during observation window)
POST /api/sessions/4c515d1c6e/presence  → 200 OK
```

### During Interactions
- **Pan/zoom**: 0 PUT /bpmn, 0 PATCH /sessions
- **Selection (10 clicks)**: 0 PUT /bpmn, 0 PATCH /sessions
- **Hover (10 elements)**: 0 PUT /bpmn, 0 PATCH /sessions
- **Tab switch (Analysis↔Diagram, XML↔Diagram)**: 0 PUT /bpmn, 0 PATCH /sessions

### Versions Head-Check
- 3 calls to `/api/sessions/4c515d1c6e/bpmn/versions?limit=1` observed over ~5 minutes
- Interval: ~30–60 seconds (consistent with previous fix reducing spam by ~80%)

---

## Console Observations

```
[ERROR] Failed to load resource: the server responded with a status of 401 (Unauthorized)
  @ http://clearvestnic.ru:5180/api/auth/me
[ERROR] Failed to load resource: the server responded with a status of 401 (Unauthorized)
  @ http://clearvestnic.ru:5180/api/sessions/4c515d1c6e/presence
```

These are pre-existing auth initialization race conditions. No performance-related errors, warnings, or debug logs observed.

---

## UI State Observations

### Overlay Toggle
- Button text: "Слои ON ⚠ hidden"
- Clicking the button (via Playwright JS) produced no visible change
- `.fpcPropertyOverlay` count remained 0 throughout
- **Limitation**: Cannot compare overlays ON vs OFF in this Playwright session

### Session Mode
- Editor/modeler mode is active (undo/redo buttons visible, palette visible)
- This explains why selection triggers bpmn-js modeler handles/bendpoints

### Tab Behavior
- Tabs: Анализ процессов | Diagram (BPMN) [selected] | XML | DOC | DOD
- Tab switching uses CSS `display` toggle (confirmed by stable `.bpmnCanvas` count = 2)
- Diagram tab content is unmounted/remounted on return from XML tab
