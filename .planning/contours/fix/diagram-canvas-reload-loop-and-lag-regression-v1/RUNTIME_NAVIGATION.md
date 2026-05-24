# RUNTIME_NAVIGATION.md

## Runtime Endpoints

- **Frontend**: http://clearvestnic.ru:5180
- **API**: http://clearvestnic.ru:8088
- **Health**: http://clearvestnic.ru:8088/health

## Test Session

Use existing session if available:
- Session: `wewe` (`4c515d1c6e`)
- Project: `Описание процессов Долгопрудный` (`b1c8a56b6e`)

## Scenario A — Cold Open

1. Fresh browser context (clear localStorage / new incognito).
2. Navigate to frontend.
3. Authenticate (dev admin credentials if needed).
4. Open project → open session with Diagram.
5. Click Diagram tab (or default to Diagram).
6. Watch and record:
   - How many times skeleton appears and for how long.
   - How many times canvas disappears/reappears.
   - How many times `diagram-ready` testid appears/disappears.
   - How many `.bpmnCanvas` containers exist in DOM.
   - Console logs: count `[DIAGRAM_ENTER]`, `[SESSION]`, `[TABS]` events.
   - Network: count `GET /api/sessions/...`, `GET /bpmn`, `PUT /bpmn`, `PATCH /sessions`.
   - Any `console.debug` from `useProcessTabs` tab trace (enable via `localStorage.setItem("fpc_debug_tabs", "1")`).

## Scenario B — Warm Tab Switch

1. Session already loaded, Diagram stable.
2. Switch Analysis → Diagram.
3. Switch Diagram → Analysis → Diagram.
4. Switch XML → Diagram.
5. Record:
   - Time from click to visual feedback (skeleton or canvas).
   - Does canvas remount (DOM node replacement) or just CSS show/hide?
   - Skeleton flashes on return?
   - DOM/SVG count changes.
   - `.bpmnCanvas` container count.
   - Network requests triggered by tab switch.
   - Console trace logs.

## Scenario C — Pan/Zoom After Load

1. Wait until Diagram stable (no skeleton, no loading spinners).
2. Pan canvas 5 cycles (drag).
3. Zoom in/out 3 cycles.
4. Record:
   - Lag perception (smooth vs stutter).
   - DOM/SVG changes during pan/zoom.
   - Overlay count changes.
   - Long delays (>100ms) between input and visual response.
   - Console errors.

## Scenario D — Selection After Load

1. Wait until Diagram stable.
2. Select 5 different BPMN elements in analytics/view mode.
3. Record:
   - DOM/SVG delta per selection.
   - Property panel response time.
   - Lag.
   - No bpmn-js edit handles in analytics mode.
   - Network requests.

## Scenario E — Disable/Revert Suspect Experiment

1. Locally comment out or disable:
   - `useDiagramStagedHydration` usage in `BpmnStage.jsx`
   - `useDeferredDecorFanout` usage in `BpmnStage.jsx`
   - `DiagramSkeleton` rendering in `BpmnStage.jsx`
2. Rebuild and test Scenarios A–C.
3. Compare perceived load/reload cycles.
4. **Important**: do not leave temporary code in final fix; use only for evidence gathering.

## Instrumentation Commands

Enable tab debug trace:
```js
localStorage.setItem("fpc_debug_tabs", "1");
localStorage.setItem("fpc_debug_bpmn", "1");
```

Then reload page and observe console.

## Expected DOM Baseline (from prior contours)

- Idle Diagram: DOM ~8,025 / SVG ~2,392
- `.djs-overlay`: ~17
- `.fpcPropertyOverlay`: 0
