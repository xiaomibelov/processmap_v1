# Runtime Navigation

## Runtime URLs

| Service | URL |
|---------|-----|
| Frontend | http://clearvestnic.ru:5180 |
| API | http://clearvestnic.ru:8088 |
| API Health | http://clearvestnic.ru:8088/health |

## Known Test Session

From previous audits, the primary test session is:
- **Project**: `Описание процессов Долгопрудный` (`b1c8a56b6e`)
- **Session**: `wewe` (`4c515d1c6e`)
- Direct URL: `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`

## How to Open Session

1. Navigate to frontend URL.
2. Authenticate (dev admin credentials via `localStorage.setItem('fpc_auth_access_token', ...)` if needed).
3. Open project `b1c8a56b6e`.
4. Open session `4c515d1c6e`.
5. Or use direct deep link: `/app?project=b1c8a56b6e&session=4c515d1c6e&tab=diagram`

## How to Open Diagram Tab

1. After session loads, click the "Diagram" tab in the session tab bar.
2. Or use direct link with `&tab=diagram`.

## How to Ensure Analytics/View Mode

Analytics mode is the **default view mode** when the Diagram tab opens.
- Look for: no palette visible, no context pad on hover, single-element selection only.
- In analytics mode, `isDiagramAnalyticsMode()` returns true.
- Agent 2 can verify by checking that `djs-bendpoint` and `djs-segment-dragger` counts are 0.

## How to Enable/Disable Overlays

Overlays are controlled via the Layers popover:
1. Open the diagram controls or layers panel.
2. Look for overlay toggle (e.g., property overlays).
3. Previous audits used `include_overlay=0` parameter or UI toggle.
4. If UI toggle is not accessible via Playwright, document limitation.

## How to Select Elements

1. In analytics/view mode: click a BPMN shape or connection on the canvas.
2. Verify selection: `document.querySelectorAll('.fpcAnalyticsSelected').length` should become 1–2.
3. The "Выбранный узел" button in the sidebar should show badge "1".

## How to Hover Elements

1. Move mouse over a BPMN shape.
2. Verify hover: stroke color change visible; computed `filter` should be `none` for most elements (start/end events may retain 2px drop-shadow as known limitation).

## How to Pan/Zoom

1. Pan: drag canvas background (or use middle-mouse drag).
2. Zoom: mouse wheel over canvas, or use zoom controls.
3. Verify stability: DOM/SVG counts should not change.

## How to Open Property Panel/Details

1. Select a BPMN element.
2. The sidebar should update to show "Выбранный узел" section.
3. Click "Выбранный узел" to expand property panel if collapsed.
4. Panel shows: element type, name, ID, notes, AI questions, settings.

## How to Enter Edit Mode (if available)

1. Look for explicit "Edit" or "Редактировать" button in diagram controls or toolbar.
2. If available, click to enter edit mode.
3. In edit mode: palette visible, context pad on hover, bendpoints/draggers appear on selection.
4. **Do NOT save changes** unless a safe test session path exists.
5. Exit edit mode if toggle is available.

## How to Switch Analysis ↔ Diagram

1. Click "Analysis" tab → wait for Analysis view.
2. Click "Diagram" tab → wait for Diagram view.
3. Repeat 3 cycles.
4. Measure time to visible and DOM/SVG stability.

## How to Switch XML ↔ Diagram

1. Click "XML" tab → wait for XML editor.
2. Click "Diagram" tab → wait for Diagram view.
3. Repeat 3 cycles.

## Browser Snippets

```js
// Total DOM nodes
document.querySelectorAll('*').length

// Total SVG nodes
document.querySelectorAll('svg *').length

// Property overlays
// Note: class name may be `.fpcPropertyOverlay` or similar
document.querySelectorAll('.fpcPropertyOverlay').length

// bpmn-js overlays
document.querySelectorAll('.djs-overlay').length

// Focus dim (should be 0 in analytics mode)
document.querySelectorAll('.fpcFocusDim').length

// Analytics selected marker
document.querySelectorAll('.fpcAnalyticsSelected').length

// Edit mode bendpoints (should be 0 in analytics mode)
document.querySelectorAll('.djs-bendpoint').length

// Edit mode segment draggers (should be 0 in analytics mode)
document.querySelectorAll('.djs-segment-dragger').length

// Modeler container visibility
document.querySelector('.bpmnLayer--editor')?.style?.display
// Viewer container visibility
document.querySelector('.bpmnLayer--diagram')?.style?.display

// Diagram ready marker
document.querySelector('[data-testid="diagram-ready"]') !== null
```

## Network Filters

Monitor these request patterns in browser dev tools or Playwright:

| Pattern | Meaning |
|---------|---------|
| `PUT` | Any PUT request (should be 0 for non-edit interactions) |
| `PATCH` | Any PATCH request (should be 0 for non-edit interactions) |
| `/bpmn` | BPMN endpoints |
| `/sessions` | Session endpoints |
| `/bpmn/versions` | Version list / history |
| `limit=1` | Version head-check (should be background polls only) |
| `auth/me` | Auth check |
| `presence` | Session presence POST/DELETE |

## Console Filters

Watch for:
- `401` errors (expected pre-existing on `/presence` before auth)
- `404` errors
- Any new errors or warnings during interactions
- `console.log` spam from debug traces

## Timing Helpers

```js
// Mark start
const t0 = performance.now();

// After action completes
const t1 = performance.now();
console.log('Duration:', t1 - t0, 'ms');
```

Playwright timing example:
```js
const start = Date.now();
await page.goto('http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e&tab=diagram');
await page.waitForSelector('[data-testid="diagram-ready"]');
const readyTime = Date.now() - start;
```
