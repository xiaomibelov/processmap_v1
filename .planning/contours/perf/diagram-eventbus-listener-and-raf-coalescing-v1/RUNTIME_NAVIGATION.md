# RUNTIME_NAVIGATION — perf/diagram-eventbus-listener-and-raf-coalescing-v1

## Runtime URLs

- Frontend: http://clearvestnic.ru:5180
- API: http://clearvestnic.ru:8088
- API Health: http://clearvestnic.ru:8088/health

## Known Test Session

Session `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`).
This session has ~15–20 visible BPMN elements and has been used in all previous related contours.

## How to Open Diagram

1. Open http://clearvestnic.ru:5180
2. Navigate to project `Описание процессов Долгопрудный` if not already open.
3. Open session `wewe` from the session list.
4. Ensure the Diagram tab is active (not Analysis or XML).

## How to Show Property Overlays

1. In the Diagram toolbar, click the "Слои" (Layers) button.
2. Ensure property overlays are toggled ON.
3. Alternatively, use the property overlay always-enabled toggle if available.

## DOM / Overlay Counts

Open browser console and run:

```js
// Total DOM nodes
console.log("total nodes:", document.querySelectorAll("*").length);

// All djs overlays
console.log("djs-overlay:", document.querySelectorAll(".djs-overlay").length);

// Property overlays
console.log("fpcPropertyOverlay:", document.querySelectorAll(".fpcPropertyOverlay").length);
```

Expected baseline (overlays ON, default viewport, after viewport-culling fix):
- Total DOM nodes: ~9,175
- `.djs-overlay`: ~87
- `.fpcPropertyOverlay`: ~70

## Scenario A — Diagram Idle with Overlays

1. Open Diagram with overlays visible.
2. Open DevTools → Console.
3. Open DevTools → Network (filter by `Fetch/XHR`).
4. Observe 15–30 seconds.
5. Record:
   - console errors
   - `PUT /bpmn` count
   - `PATCH /sessions` count
   - `GET /bpmn/versions?limit=1` count
   - DOM node counts every 5 seconds

## Scenario B — Pan/Zoom Burst

1. With overlays visible, perform 5 fast pan/zoom cycles.
2. Before/after each cycle, record DOM counts.
3. Check console for errors or warnings.
4. Check Network for any mutation requests.
5. If possible, enable performance marks:
   ```js
   window.__FPC_DEBUG_SETTLED_FANOUT__ = true;
   window.__FPC_DEBUG_IMMEDIATE_FANOUT__ = true;
   ```
   Then observe console for `[SETTLED_FANOUT_PERF]` and `[IMMEDIATE_FANOUT_PERF]` entries.

## Scenario C — Selection Burst

1. Select 10 BPMN elements one by one (click each shape).
2. Record:
   - no mutation requests in Network
   - console errors
   - subjective responsiveness

## Scenario D — Hover Burst

1. Hover over 10 BPMN elements rapidly.
2. Record:
   - hover response time
   - overlay flicker
   - console errors

## Scenario E — Tab Return

1. Diagram → Analysis → Diagram.
2. Diagram → XML → Diagram.
3. After each return, record:
   - overlay counts
   - console errors
   - network mutations
   - whether overlays rehydrate without manual zoom/pan

## Scenario F — Stress Loop

1. Repeat pan/zoom + selection + tab switch 3 cycles.
2. After each cycle, record DOM counts.
3. Confirm:
   - no unbounded DOM growth
   - no increasing lag
   - counts return to baseline after stabilizing

## Network Inspection

Filter Network tab by:
- `bpmn/versions?limit=1` — should be ~1 per 30–36s (background poll), not bursts.
- `PUT /bpmn` — must be 0 during all scenarios except explicit save.
- `PATCH /sessions` — must be 0 during all scenarios.

## Console Errors

Watch for:
- New errors related to overlays, decorators, or eventBus.
- Pre-existing `401 Unauthorized` on `/api/auth/me` is expected and not a regression.
- `[SETTLED_FANOUT_PERF]` / `[IMMEDIATE_FANOUT_PERF]` debug logs are expected when debug flags are set.

## Evidence Files

Save screenshots and console logs to:
`.planning/contours/perf/diagram-eventbus-listener-and-raf-coalescing-v1/evidence/`
