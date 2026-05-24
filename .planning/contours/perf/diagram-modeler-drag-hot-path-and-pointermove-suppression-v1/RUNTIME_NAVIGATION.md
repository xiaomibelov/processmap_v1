# Runtime Navigation — perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1

## Base URLs

| Purpose | URL |
|---------|-----|
| Test runtime (gateway) | `http://clearvestnic.ru:5180` |
| Cache-busted entry | `http://clearvestnic.ru:5180/?cb=<timestamp>` |
| Build info | `http://clearvestnic.ru:5180/build-info.json?cb=<timestamp>` |
| API health | `http://clearvestnic.ru:8088/health` |

Replace `<timestamp>` with `Date.now()` or `$(date +%s)`.

---

## Version / Update Row Location

- **Expected location**: Footer status bar at bottom of page (`AppShell.jsx`).
- **Text pattern**: `Версия v1.0.128 · <shaShort> · <date> · <contourId> · <changelog summary>`
- **Must NOT be**: canvas overlay badge, top-left marker, or any element intercepting pointer events.
- **Check**: `document.querySelector('[data-testid="build-info-badge"]')` should exist but with `pointerEvents: "none"` and positioned at bottom-right corner, NOT over canvas.

---

## Known Large Diagram Session

If app loads to project list:
- Project: `b1c8a56b6e` (`Описание процессов Долгопрудный`)
- Session: `wewe` (`4c515d1c6e`)
- Direct URL pattern (if supported):
  `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`

If direct URL does not work, navigate manually:
1. Open `http://clearvestnic.ru:5180/?cb=<ts>`
2. Select project `Описание процессов Долгопрудный`
3. Select session `wewe`
4. Click "Диаграмма" tab

---

## How to Ensure Overlays Off

In browser console:
```js
// Must return 0
document.querySelectorAll('.fpcPropertyOverlay').length
```

If > 0, toggle overlays off via UI (overlay button in diagram toolbar) or ensure `propertiesOverlayAlwaysEnabled` is false.

---

## How to Do Real Mouse Canvas Drag — Quick Natural

Playwright pattern:
```js
const canvasBox = await page.locator('.djs-container').boundingBox();
const startX = canvasBox.x + 150;
const startY = canvasBox.y + 250;
await page.mouse.move(startX, startY);
await page.mouse.down();
// Quick flick — no steps
await page.mouse.move(startX + 300, startY + 80, { steps: 1 });
await page.mouse.up();
```

Key: use `{ steps: 1 }` or omit steps for natural quick drag.

---

## How to Do Real Mouse Canvas Drag — Stepped Stress

Playwright pattern:
```js
await page.mouse.move(startX, startY);
await page.mouse.down();
// Stress test — many discrete pointermove events
await page.mouse.move(startX + 300, startY + 80, { steps: 20 });
await page.mouse.up();
```

Note: high step count may inflate duration due to main thread blocking. Use as stress signal, not sole pass/fail metric.

---

## How to Do Real Element Drag

Playwright pattern:
```js
// Find a shape
const shape = await page.locator('.djs-shape').first();
const box = await shape.boundingBox();
const centerX = box.x + box.width / 2;
const centerY = box.y + box.height / 2;
await page.mouse.move(centerX, centerY);
await page.mouse.down();
await page.mouse.move(centerX + 100, centerY + 60, { steps: 8 });
await page.mouse.up();

// Verify moved
const transformAfter = await page.evaluate(() => {
  const container = document.querySelector('.djs-container svg');
  return container?.getAttribute('transform') || 'none';
});
```

If synthetic events fail on some shapes, try different shapes or use `page.dragAndDrop` with force.

---

## How to Switch Analysis ↔ Diagram and XML ↔ Diagram

In app UI:
- Diagram tab: click tab labeled "Диаграмма"
- Analysis tab: click tab labeled "Анализ"
- XML tab: click tab labeled "XML" (if available)

Programmatic:
```js
// Click diagram tab
await page.locator('text=Диаграмма').click();
```

---

## Browser Snippets

Run in browser console during testing:

```js
// DOM scale
document.querySelectorAll('*').length

// SVG scale
document.querySelectorAll('svg *').length

// BPMN container present
document.querySelectorAll('.djs-container').length

// Overlays count (must be 0 for tests)
document.querySelectorAll('.fpcPropertyOverlay').length

// All bpmn-js overlays
document.querySelectorAll('.djs-overlay').length

// Focus dim layers
document.querySelectorAll('.fpcFocusDim').length

// Analytics selected markers
document.querySelectorAll('.fpcAnalyticsSelected').length

// Bendpoints (edit mode)
document.querySelectorAll('.djs-bendpoint').length

// Segment draggers (edit mode)
document.querySelectorAll('.djs-segment-dragger').length

// Build info
window.__PROCESSMAP_BUILD_INFO__

// Version from config (if global exposed)
window.__PROCESSMAP_APP_VERSION__
```

---

## Network Filters

In browser DevTools Network tab or Playwright route monitoring:

| Filter | Purpose |
|--------|---------|
| `method:PUT` | Detect durable saves during drag |
| `method:PATCH` | Detect session patches during drag |
| `/bpmn` | Detect BPMN mutation endpoints |
| `/sessions` | Detect session mutation endpoints |
| `/bpmn/versions` | Detect version polling |
| `limit=1` | Detect versions spam |

Expected during drag:
- 0 PUT/PATCH to `/bpmn` or `/sessions`
- Normal background `versions?limit=1` polling (not spam)

---

## Long Task Measurement

Playwright pattern:
```js
const longTasks = await page.evaluate(() => {
  return performance.getEntriesByType('longtask').map(t => ({
    duration: t.duration,
    startTime: t.startTime,
    name: t.name,
  }));
});
const count = longTasks.length;
const total = longTasks.reduce((s, t) => s + t.duration, 0);
const max = Math.max(...longTasks.map(t => t.duration), 0);
```

Clear before each test:
```js
await page.evaluate(() => performance.clearResourceTimings());
```

Note: `longtask` entries require `Long Tasks API` support. If unavailable, use `performance.now()` wrapped around drag operations as fallback.
