# Runtime Navigation — perf/diagram-property-overlays-viewport-culling-v1

## Runtime URLs

| Service | URL |
|---------|-----|
| Frontend | `http://clearvestnic.ru:5180` |
| API | `http://clearvestnic.ru:8088` |
| Health | `http://clearvestnic.ru:8088/health` |

## Test Session

Previous audit used:
- Project: `Описание процессов Долгопрудный` (`b1c8a56b6e`)
- Session: `wewe` (`4c515d1c6e`)

Agent 2 should use the same or a comparable session with property overlays enabled.

## How to Open Diagram Tab

1. Open `http://clearvestnic.ru:5180`.
2. Navigate to a project and open a session.
3. The default view is usually the **Diagram** tab (labeled "Диаграмма" or similar).
4. If on **Analysis** tab, click the Diagram tab to switch.

## How to Enable/Show Property Overlays

Property overlays are toggled via the "Show properties" or similar control in the Diagram toolbar / overlay settings.

In the audited session, overlays were enabled via the always-on toggle, resulting in:
- 180 `.fpcPropertyOverlay` nodes
- 197 `.djs-overlay` nodes

Agent 2 must document the exact UI steps used.

## How to Count Overlays in Browser Console

Open DevTools Console and run:

```js
// Total DOM nodes
document.querySelectorAll('*').length

// All bpmn-js overlay containers
document.querySelectorAll('.djs-overlay').length

// Property overlay nodes specifically
document.querySelectorAll('.fpcPropertyOverlay').length
```

If class names differ in the runtime, Agent 2 must adjust and document the correct selectors.

## How to Run Pan/Zoom Cycle

1. Ensure Diagram tab is active and property overlays are ON.
2. **Zoom**: Use mouse wheel or diagram zoom controls.
   - Zoom in (e.g. 1.0 → 1.5)
   - Zoom out (e.g. 1.5 → 0.8)
3. **Pan**: Click-drag the canvas to move to an empty area, then drag back.
4. After each action, run the console snippet above and record counts.

Expected after fix:
- Panning to an area with few/no BPMN elements should drop `.fpcPropertyOverlay` count materially.
- Panning back should restore count.
- Counts should not grow unbounded across cycles.

## How to Run Analysis ↔ Diagram Tab Switch Cycle

1. With overlays ON, note the overlay count.
2. Click the **Analysis** tab.
3. Click back to **Diagram** tab.
4. Re-run count snippet.

Expected:
- Count remains stable (no duplication).
- DOM delta should be minimal (±measurement noise).

## How to Inspect Network for Mutation Requests

1. Open DevTools Network tab.
2. Clear log.
3. Perform pan/zoom and tab switches.
4. Filter or search for:
   - `PUT /bpmn`
   - `GET /bpmn/versions?limit=1`
   - `PATCH` session

Expected:
- Pan/zoom should NOT cause `PUT /bpmn` or `PATCH` session.
- Pan/zoom should NOT cause new `GET /bpmn/versions?limit=1` calls.
- Any unexpected network activity caused by overlay code must be documented.
