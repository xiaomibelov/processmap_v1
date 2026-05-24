# RUNTIME_NAVIGATION.md

## Runtime URLs

| Resource | URL |
|----------|-----|
| Test runtime (5180) | `http://clearvestnic.ru:5180` |
| Cache-busted entry | `http://clearvestnic.ru:5180/?cb=<timestamp>` |
| Build info | `http://clearvestnic.ru:5180/build-info.json?cb=<timestamp>` |
| Health | `http://clearvestnic.ru:8088/health` |

## Known Large Diagram Session

- Project: `b1c8a56b6e` (`Описание процессов Долгопрудный`)
- Session: `wewe` (session id `4c515d1c6e`)
- Route example:
  `http://clearvestnic.ru:5180/app/project/b1c8a56b6e?cb=<ts>&project=b1c8a56b6e&session=4c515d1c6e`

## Where Version Marker Should Be

- **NOT** on canvas.
- **NOT** as absolute overlay on `bpmnStack`.
- Preferred: inside `AppShell.jsx` `footerHint` div (bottom status/version line).
- Alternative: app shell header or non-canvas status bar.

## How to Ensure Overlays Off

```js
// In browser console
document.querySelectorAll('.fpcPropertyOverlay').length
// Expected: 0
```

If overlays are present, use the Layers panel UI to disable them, or set the appropriate localStorage/URL flag if known.

## How to Do Real Mouse Canvas Drag (Playwright)

```js
const canvasBox = await page.locator('.djs-container').boundingBox();
const startX = canvasBox.x + canvasBox.width * 0.3;
const startY = canvasBox.y + canvasBox.height * 0.3;

await page.mouse.move(startX, startY);
await page.mouse.down();
await page.mouse.move(startX + 200, startY, { steps: 20 });
await page.mouse.move(startX + 400, startY + 100, { steps: 20 });
await page.mouse.up();
```

## How to Do Real Element Drag (Playwright)

```js
// Pick a visible BPMN shape (e.g., a task)
const shape = await page.locator('.djs-shape').first();
const box = await shape.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50, { steps: 15 });
await page.mouse.up();
```

## How to Enter Edit Mode

- In Diagram tab, click the "Редактировать BPMN" button (if visible in view mode).
- Wait for Modeler init (may take ~15s on large diagram).
- `.djs-palette` should appear, `.djs-bendpoint` may appear on selected connections.

## Tab Switch Navigation

- Analysis ↔ Diagram: click tab headers.
- XML ↔ Diagram: click tab headers.
- Note: XML→Diagram return may take 20–30s (pre-existing limitation).

## Browser Diagnostic Snippets

```js
// DOM/SVG counts
document.querySelectorAll('*').length
document.querySelectorAll('svg *').length
document.querySelectorAll('.djs-container').length
document.querySelectorAll('.fpcPropertyOverlay').length
document.querySelectorAll('.djs-overlay').length
document.querySelectorAll('.fpcFocusDim').length
document.querySelectorAll('.fpcAnalyticsSelected').length
document.querySelectorAll('.djs-bendpoint').length
document.querySelectorAll('.djs-segment-dragger').length

// Build info
window.__PROCESSMAP_BUILD_INFO__

// Diagram runtime diagnostic (if available)
window.__PM_DIAGRAM_RUNTIME__
```

## Network Filters

Watch for these during drag/view interactions:
- `PUT` — should be 0 from view interactions.
- `PATCH` — should be 0 from view interactions.
- `/bpmn` — should not be mutated from view-only drag.
- `/sessions` — should not be patched from view-only drag.
- `/bpmn/versions?limit=1` — background polls only, no spam.

## Docker Quick Commands

```bash
# Restart gateway after build
docker restart processmap_test-gateway-1

# Check containers
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" | grep processmap_test

# Frontend build
cd /opt/processmap-test/frontend && npm run build
```
