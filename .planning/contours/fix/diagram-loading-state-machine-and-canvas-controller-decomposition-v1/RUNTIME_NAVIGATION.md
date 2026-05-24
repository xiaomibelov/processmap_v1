# Runtime Navigation — fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

## URLs

- Main runtime: `http://clearvestnic.ru:5180`
- Cache-busted: `http://clearvestnic.ru:5180/?cb=<timestamp>`
- Build info: `http://clearvestnic.ru:5180/build-info.json?cb=<timestamp>`
- API health: `http://clearvestnic.ru:8088/health`

## Known Test Session

- Project: `b1c8a56b6e` (`Описание процессов Долгопрудный`)
- Session: `4c515d1c6e` (`wewe`)
- If these IDs are unavailable, use any project/session that has a Diagram tab.

## How to Locate Visible Version Marker

### Current Footer Marker
- Scroll to bottom of page.
- Look for: `Версия v1.0.126 · a9a9d9c · 15.05.2026, 21:26`

### Current Fixed Badge
- Look at bottom-right corner of viewport.
- Tiny text: `a9a9d9c | 2026-05-15T21:26:58.810Z`

### Required Top/Header Marker (Agent 2 must add)
- Look in top toolbar near ProcessMap brand.
- Or in ProcessStageHeader when Diagram tab active.
- Should show: version + SHA + timestamp + contour ID.

## How to Read Build Info in Browser

```js
window.__PROCESSMAP_BUILD_INFO__
```

Expected structure:
```json
{
  "branch": "fix/lockfile-sync-test",
  "sha": "a9a9d9c5f468d9da63415306da6d34dcd605aa0d",
  "shaShort": "a9a9d9c",
  "timestamp": "2026-05-15T21:26:58.810Z",
  "contourId": "fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1",
  "dirty": true,
  "host": "clearvestnic.ru"
}
```

## How to Reproduce Screenshot State

1. Open `http://clearvestnic.ru:5180/?cb=<timestamp>`.
2. Authenticate.
3. Navigate to a project/session.
4. Click **Diagram** tab.
5. Observe canvas area.
6. Expected broken state: grey skeleton with text "Загрузка диаграммы…".
7. Wait 10 seconds.
8. Screenshot.

## How to Ensure Overlays Off

```js
document.querySelectorAll('.fpcPropertyOverlay').length  // should be 0
```

## How to Pan / Zoom

- Pan: drag canvas background.
- Zoom: use mouse wheel or UI zoom buttons.
- Verify via SVG transform:
```js
document.querySelector('.djs-container svg').style.transform
```

## How to Select Elements

- Click a visible BPMN shape.
- Verify selection:
```js
document.querySelectorAll('.fpcAnalyticsSelected').length  // should be 1
```

## How to Open Property Panel

- Select an element.
- Property panel should appear on the right side.
- Or use diagram context menu.

## How to Switch Tabs

- Analysis ↔ Diagram: click tab buttons.
- XML ↔ Diagram: click tab buttons.
- Record any skeleton flash or loading delay.

## Browser Diagnostic Snippets

```js
// Stuck loading check
document.body.innerText.includes('Загрузка диаграммы')

// Total DOM elements
document.querySelectorAll('*').length

// SVG descendants
document.querySelectorAll('svg *').length

// BPMN containers
document.querySelectorAll('.djs-container').length

// Property overlays
document.querySelectorAll('.fpcPropertyOverlay').length

// BPMN overlays
document.querySelectorAll('.djs-overlay').length

// Focus dim
document.querySelectorAll('.fpcFocusDim').length

// Analytics selected
document.querySelectorAll('.fpcAnalyticsSelected').length

// Edit handles (must be 0 in view mode)
document.querySelectorAll('.djs-bendpoint').length

// Segment draggers (must be 0 in view mode)
document.querySelectorAll('.djs-segment-dragger').length

// Build info
window.__PROCESSMAP_BUILD_INFO__

// Diagram runtime diagnostics (if Agent 2 added)
window.__PM_DIAGRAM_RUNTIME__
```

## Network Filters

In browser DevTools Network tab, filter for:
- `method:PUT` — must be 0 from view interactions
- `PATCH` — must be 0 from view interactions
- `/bpmn` — watch for unexpected saves
- `/sessions` — watch for unexpected patches
- `versions?limit=1` — expected background poll, should not spam
