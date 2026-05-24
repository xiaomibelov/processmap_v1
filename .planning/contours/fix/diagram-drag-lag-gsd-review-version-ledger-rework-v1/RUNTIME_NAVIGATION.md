# Runtime Navigation — fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1

## Runtime URLs

| Purpose | URL |
|---------|-----|
| Base runtime | `http://clearvestnic.ru:5180` |
| Cache-busted | `http://clearvestnic.ru:5180/?cb=<timestamp>` |
| Build info | `http://clearvestnic.ru:5180/build-info.json?cb=<timestamp>` |
| Health (API) | `http://clearvestnic.ru:8088/health` |

## Target Session

- **Project**: `b1c8a56b6e` (`Описание процессов Долгопрудный`)
- **Session**: `wewe` (`4c515d1c6e`)
- If session unavailable, use any large diagram session with many BPMN elements.

## How to ensure overlays off

```js
// In browser console or Playwright evaluate
document.querySelectorAll('.fpcPropertyOverlay').length === 0
```

If overlays are present, they may be disabled via the diagram controls or by setting:
```js
window.fpcPropertyOverlay = 0;
```

## How to do real mouse canvas drag

```js
// Playwright
await page.mouse.move(x, y);               // empty canvas area (avoid scrubber/action bar)
await page.mouse.down();
await page.mouse.move(x + 150, y + 0, { steps: 10 });
await page.mouse.move(x + 300, y + 80, { steps: 10 });
await page.mouse.up();
```

Also test quick natural drag without artificial steps.

## How to do real element drag

1. Confirm edit mode is active (default or after toggle).
2. Pick a visible `.djs-shape` (BPMN task).
3. Get element center coordinates.
4. ```js
   await page.mouse.move(cx, cy);
   await page.mouse.down();
   await page.mouse.move(cx + 100, cy + 50, { steps: 10 });
   await page.mouse.up();
   ```
5. Verify transform changed or element moved.

## How to enter edit mode if required

- If "Редактировать BPMN" button visible: click it.
- Wait for Modeler init (may take ~15s on large diagram).
- Verify `.djs-palette` appears.
- Verify `.djs-bendpoint` count > 0.

## How to switch Analysis ↔ Diagram and XML ↔ Diagram

- Use tab buttons in ProcessStage.
- After switch, wait for canvas stable.
- Verify `.djs-container` count stays at 1.

## Browser snippets

```js
// DOM counts
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

// Version from footer
const footer = document.querySelector('[data-testid="app-version-footer"]');
footer ? footer.textContent : 'NOT FOUND';
```

## Network filters

Watch for these during drag:
- `PUT` — should be 0 from view/drag interactions.
- `PATCH /sessions` — should be 0 from view/drag interactions.
- `/bpmn` — should only trigger on explicit save.
- `/sessions` — background polls only.
- `/bpmn/versions?limit=1` — background polls only, no spam.
