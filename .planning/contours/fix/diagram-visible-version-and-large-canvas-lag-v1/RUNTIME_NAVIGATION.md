# RUNTIME_NAVIGATION.md

## Runtime URLs
- Base runtime: `http://clearvestnic.ru:5180`
- Cache-busted: `http://clearvestnic.ru:5180/?cb=<timestamp>`
- Build info: `http://clearvestnic.ru:5180/build-info.json?cb=<timestamp>`

## Known Large Diagram Session
- Workspace: `wewe`
- Project: `Описание процессов Долгопрудный`
- Exact route: `http://clearvestnic.ru:5180/?workspace=wewe&project=b1c8a56b6e&session=4c515d1c6e`
- If user provides a different link, switch to that link and document exact session id.

## How to Locate Visible Version Marker in UI
- Check `AppShell.jsx` version area (header/sidebar/updates page).
- Expected current visible text: "Версия v1.0.126".
- After Agent 2 fix, expect visible build marker next to or inside version area.

## Browser Runtime Checks

### Build info (window)
```js
window.__PROCESSMAP_BUILD_INFO__
```

### Build info (fetch)
```js
fetch('/build-info.json?cb=' + Date.now()).then(r => r.json())
```

### Ensure overlays OFF
```js
// Set overlay flag to 0 if not already
.fpcPropertyOverlay = 0
// Verify counts:
document.querySelectorAll('.fpcPropertyOverlay').length === 0
```

### DOM/SVG Counters
```js
document.querySelectorAll('*').length
document.querySelectorAll('svg *').length
document.querySelectorAll('.djs-container').length
document.querySelectorAll('.fpcPropertyOverlay').length
document.querySelectorAll('.djs-overlay').length
document.querySelectorAll('.fpcFocusDim').length
document.querySelectorAll('.fpcAnalyticsSelected').length
document.querySelectorAll('.djs-bendpoint').length
document.querySelectorAll('.djs-segment-dragger').length
```

### Pan/Zoom Test
- Use zoom in/out buttons or mouse wheel.
- Observe SVG viewport transform changes.
- Count DOM/SVG before and after.

### Selection Test
- Click a BPMN shape in analytics/view mode.
- Check `.fpcAnalyticsSelected` count.
- Open property panel via "Выбранный узел" button.

### Tab Switch Test
- Analysis ↔ Diagram
- XML ↔ Diagram
- Measure time to usable canvas.
- Check `.djs-container` count stays at 1.

## Network Filters
- `PUT` — must be 0 from view interactions
- `PATCH /sessions` — must be 0 from view interactions
- `/bpmn` — must be 0 from view interactions
- `/bpmn/versions` — background polls only (`limit=1`)
- `limit=1` — acceptable background poll

## Docker/Test Runtime
- Gateway: `processmap_test-gateway-1` (port 5180)
- API: `processmap_test-api-1` (port 8088)
- Frontend builder: `processmap_test-frontend-1` (port 5177)
- To rebuild/restart 5180: rebuild frontend dist, then restart gateway if needed.
