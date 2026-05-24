# Runtime Navigation Guide

## Endpoints

- Frontend: `http://clearvestnic.ru:5180`
- API: `http://clearvestnic.ru:8088`
- API Health: `http://clearvestnic.ru:8088/health`

## How to Open Diagram

1. Navigate to `http://clearvestnic.ru:5180`
2. Log in if required.
3. Open a project with BPMN sessions.
   - Previous audit used: project `Описание процессов Долгопрудный` (`b1c8a56b6e`), session `wewe` (`4c515d1c6e`).
4. Click on a session to open ProcessStage.
5. Ensure the **Diagram** tab is active (not Analysis, XML, Interview, etc.).

## How to Ensure Overlays Off

- The session should load with `GET /api/sessions/{sid}/bpmn?raw=1&include_overlay=0`.
- If the app UI has an overlay toggle, try clicking it to turn overlays OFF.
- Note: In previous audits, the UI toggle was sometimes unresponsive in Playwright. If so, rely on API parameter.
- Verify with: `document.querySelectorAll('.fpcPropertyOverlay').length` should be `0`.

## How to Select a BPMN Element

1. Wait for diagram to fully render (`diagramReady` indicator or stable DOM).
2. Click on a visible BPMN task, event, or gateway.
   - Previous audit used elements like `Activity_1c5b5zb`, `Event_1duwp2k`, `Gateway_08u1e7m`.
3. Element should become selected (visual feedback should appear).

## How to Check Editor Handles/Draggers

After selecting an element in default (editor) mode:

```js
// bpmn-js bendpoint handles
document.querySelectorAll('.djs-bendpoint').length

// Segment draggers
document.querySelectorAll('.djs-segment-dragger').length

// Resizers
document.querySelectorAll('.djs-resizer').length

// Outlines
document.querySelectorAll('.djs-outline').length

// Hit regions
document.querySelectorAll('.djs-hit').length
```

Pre-contour baseline (editor mode):
- `.djs-bendpoint`: ~916
- `.djs-segment-dragger`: ~251

## How to Check fpcFocusDim

```js
document.querySelectorAll('.fpcFocusDim').length
```

Pre-contour baseline (after selection): ~907 elements.

## DOM/SVG Count Commands

```js
// Total DOM nodes
document.querySelectorAll('*').length

// Total SVG nodes
document.querySelectorAll('svg *').length

// Property overlays
document.querySelectorAll('.fpcPropertyOverlay').length

// bpmn-js overlays
document.querySelectorAll('.djs-overlay').length

// Selected elements
document.querySelectorAll('.fpcElementSelected').length

// Focus dim
document.querySelectorAll('.fpcFocusDim').length

// Focus neighbors
document.querySelectorAll('.fpcFocusNeighbor').length

// Focus edge primary
document.querySelectorAll('.fpcFocusEdgePrimary').length
```

## Network Mutation Checks

Open browser DevTools Network tab and filter by:
- `PUT` requests to `/bpmn`
- `PATCH` requests to `/sessions`
- `GET` requests to `/versions?limit=1`

Expected in view-mode interactions:
- PUT `/bpmn`: 0
- PATCH `/sessions`: 0
- `versions?limit=1`: ≤3 on initial load, then periodic background polls only.

## Tab Switch Scenarios

1. **Analysis ↔ Diagram**
   - Click Analysis tab, then click Diagram tab.
   - DOM counts should stabilize to baseline.

2. **XML ↔ Diagram**
   - Click XML tab, then click Diagram tab.
   - On second Diagram return, selection-related DOM inflation should clean up (pre-contour behavior: returns to ~7,994 total DOM).

## Session Reference

If previous session is unavailable, any session with:
- At least 100 BPMN elements
- `include_overlay=0` capability
- Stable load

will suffice. Document the actual session used in `PERFORMANCE_BEFORE_AFTER.md`.
