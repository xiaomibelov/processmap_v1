# RUNTIME_NAVIGATION.md — perf/diagram-svg-css-repaint-reduction-v1

## Runtime URLs

- Frontend: `http://clearvestnic.ru:5180`
- API: `http://clearvestnic.ru:8088`
- API Health: `http://clearvestnic.ru:8088/health`

## Session / Project

- Known session: `wewe` (`4c515d1c6e`)
- Known project: `Описание процессов Долгопрудный` (`b1c8a56b6e`)
- URL pattern: `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`

## How to Open Diagram

1. Open `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`
2. Authenticate via `localStorage.setItem('fpc_auth_access_token', '<dev_token>')` if needed.
3. Navigate to the **Diagram** tab.

## How to Ensure Analytics/View Mode

- Analytics/view mode is the default non-edit state.
- Confirm overlays are OFF: the URL should not force `include_overlay=1`.
- If needed, ensure `include_overlay=0` is active (default behavior).
- Edit mode is entered only via explicit edit gestures (direct editing, drag, connect, resize). Do NOT trigger these in analytics baseline scenarios.

## How to Select Elements

- Click any visible BPMN shape or connection on the canvas.
- Expected: element receives selection indicator, property panel updates.

## How to Hover Elements

- Move mouse pointer over BPMN shapes or connections.
- bpmn-js shows default hover feedback + any custom hover styles.

## How to Pan/Zoom

- **Pan**: Click and drag on empty canvas area (or use mouse drag with appropriate modifier).
- **Zoom**: Use mouse wheel over canvas, or use zoom controls if visible.

## How to Open Property Panel / Details

- Click a BPMN element.
- The sidebar should show the selected node section with "Выбранный узел" badge.
- Click the badge or expand the properties panel to verify details load.

## DOM / SVG / Overlay Count Snippets

Run in browser console:

```js
// Total DOM elements
document.querySelectorAll('*').length

// Total SVG elements
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

// Element selected marker (should be 0 in analytics mode)
document.querySelectorAll('.fpcElementSelected').length
```

## Network Inspection

In DevTools Network tab, filter by:

- `PUT` — must see 0 requests to `/bpmn` from view interactions.
- `PATCH` — must see 0 requests to `/sessions` from view interactions.
- `/bpmn` — only expected `GET` on load.
- `/sessions` — only expected `GET` on load.
- `/bpmn/versions` — background poll with `limit=1` is acceptable; must not spike on interaction.

## Console Checks

- Open DevTools Console.
- Pre-existing 401 on `/api/auth/me` or `/api/sessions/.../presence` is acceptable.
- Any NEW error or warning related to BPMN, canvas, or selection is a regression.
