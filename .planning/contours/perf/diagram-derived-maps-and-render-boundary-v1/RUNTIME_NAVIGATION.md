# RUNTIME_NAVIGATION.md

## Runtime URLs
- Frontend: `http://clearvestnic.ru:5180`
- API: `http://clearvestnic.ru:8088`
- API Health: `http://clearvestnic.ru:8088/health`

## Session
- Project: `Описание процессов Долгопрудный` (`b1c8a56b6e`)
- Session: `wewe` (`4c515d1c6e`)
- Used in previous audits; if unavailable, any session with a BPMN diagram is acceptable.

## How to Open Diagram
1. Navigate to `http://clearvestnic.ru:5180`
2. Select project `Описание процессов Долгопрудный`
3. Select session `wewe`
4. Click "Diagram" tab

## How to Ensure Analytics/View Mode
- If Diagram opens in edit mode (toolbars visible, bendpoints shown), switch to view/analytics mode.
- In analytics mode: no bendpoints, no segment draggers, selection uses `fpcAnalyticsSelected` marker.
- Previous contour confirmed analytics mode with `fpcFocusDim=0`, `djs-bendpoint=0`, `djs-segment-dragger=0`.

## How to Select Elements
- Click a BPMN shape (task, event, gateway).
- In analytics mode: single element highlights with `fpcAnalyticsSelected` class.
- In edit mode: original selection affordances appear.

## How to Hover Elements
- Move mouse over BPMN shapes without clicking.
- Observe tooltip or hover highlight.

## How to Pan/Zoom
- Pan: click-drag on canvas background.
- Zoom: mouse wheel or zoom controls.

## How to Open Property Panel / Details
- Select an element.
- If not automatically open, click "Выбранный узел" button or sidebar element card.

## DOM/SVG/Overlay Counts

```js
// Total DOM nodes
document.querySelectorAll('*').length

// SVG nodes
document.querySelectorAll('svg *').length

// Property overlays
 document.querySelectorAll('.fpcPropertyOverlay').length

// bpmn-js overlays
 document.querySelectorAll('.djs-overlay').length

// Focus dim (should be 0 in analytics mode)
 document.querySelectorAll('.fpcFocusDim').length

// bpmn-js bendpoints (should be 0 in analytics mode)
 document.querySelectorAll('.djs-bendpoint').length

// bpmn-js segment draggers (should be 0 in analytics mode)
 document.querySelectorAll('.djs-segment-dragger').length

// Analytics selected marker
 document.querySelectorAll('.fpcAnalyticsSelected').length
```

## Network Inspection

Filter network for:
- `PUT` requests to `/bpmn` — must be 0 from view interactions
- `PATCH` requests to `/sessions` — must be 0 from view interactions
- `GET` `/bpmn/versions?limit=1` — background poll only, no burst
- Any unexpected `POST`/`PUT`/`PATCH` during pan/zoom/hover/selection

## Console
- Check for new errors/warnings during interactions.
- Pre-existing 401 auth race on `/api/auth/me` is acceptable.
