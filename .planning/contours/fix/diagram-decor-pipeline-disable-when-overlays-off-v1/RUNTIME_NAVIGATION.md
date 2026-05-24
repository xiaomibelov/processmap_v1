# RUNTIME_NAVIGATION — fix/diagram-decor-pipeline-disable-when-overlays-off-v1

## Runtime URL
- **Frontend**: `http://clearvestnic.ru:5180`
- **API health**: `http://clearvestnic.ru:8088/health`

## Session
- **Previous audit session**: `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`).
- **URL pattern**: `http://clearvestnic.ru:5180/app?project=<project_id>&session=<session_id>`

## How to Open Diagram
1. Navigate to the app URL with a valid project and session.
2. Click the **"Диаграмма"** tab (or ensure Diagram is the active tab).
3. Wait for the BPMN canvas to load (indicated by visible process elements).

## How to Determine Overlays Off/On

### Overlays OFF
- Session loaded with `GET /api/sessions/<id>/bpmn?raw=1&include_overlay=0` (server excludes overlay data).
- UI toggle "Свойства" (Properties overlay always) is unchecked.
- No `.fpcPropertyOverlay` elements in DOM.

### Overlays ON
- UI toggle "Свойства" is checked.
- Or session loaded with `include_overlay=1`.
- `.fpcPropertyOverlay` elements appear near BPMN shapes.

## How to Count Overlays / DOM

Open browser console and run:

```js
// Property overlay nodes
console.log('.fpcPropertyOverlay:', document.querySelectorAll('.fpcPropertyOverlay').length);

// All bpmn-js overlays
console.log('.djs-overlay:', document.querySelectorAll('.djs-overlay').length);

// Total DOM nodes
console.log('Total DOM:', document.querySelectorAll('*').length);

// SVG nodes
console.log('SVG nodes:', document.querySelectorAll('svg *').length);

// Selected elements
console.log('.selected:', document.querySelectorAll('.selected').length);
```

## How to Pan / Zoom

- **Pan**: Click and drag on an empty area of the canvas.
- **Zoom**: Use mouse wheel scroll over the canvas.
- After pan/zoom, re-run DOM counts to verify stability.

## How to Switch Analysis ↔ Diagram

- Click the **"Анализ"** tab to switch to Analysis.
- Click the **"Диаграмма"** tab to return to Diagram.
- After each switch, re-run DOM counts.

## How to Check Network

Open DevTools Network tab and filter:

- **PUT requests**: Look for `PUT /api/sessions/<id>/bpmn` or any `PUT /bpmn`.
- **PATCH requests**: Look for `PATCH /api/sessions/<id>` or any `PATCH /sessions`.
- **Versions spam**: Look for `GET /api/sessions/<id>/bpmn/versions?limit=1`. Expect ≤ 3 calls during initial load window.

## Console Checks

- Look for errors related to `applyPropertiesOverlayDecor`, `overlays`, or `decor`.
- Pre-existing 401 errors on `/api/auth/me` and `/api/sessions/*/presence` are expected and should be noted but not treated as regressions.
