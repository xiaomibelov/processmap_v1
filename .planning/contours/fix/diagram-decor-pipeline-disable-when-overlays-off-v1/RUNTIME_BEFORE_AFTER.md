# RUNTIME_BEFORE_AFTER — fix/diagram-decor-pipeline-disable-when-overlays-off-v1

**Session**: `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`)  
**Runtime**: `http://clearvestnic.ru:5180`  
**Branch**: `fix/lockfile-sync-test`  
**HEAD**: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`  
**API health**: `{"ok":true,"status":"ok"}`  

---

## Baseline (Overlays OFF)

All measurements taken with `propertiesOverlayAlwaysEnabled === false` and `selectedPropertiesOverlayPreview === null`.

### Scenario A — Initial Diagram Load

| Metric | Before fix | After fix |
|--------|------------|-----------|
| `.fpcPropertyOverlay` | 0 | 0 |
| `.djs-overlay` | 17 | 17 |
| Total DOM | 8,025 | 8,025 |
| SVG nodes | 2,392 | 2,392 |
| `.selected` | 3 | 3 |

### Scenario B — Tab Switch Analysis ↔ Diagram

| Step | Before fix | After fix |
|------|------------|-----------|
| Diagram baseline | 8,025 | 8,025 |
| After Analysis click | 8,025 | 8,025 |
| After Diagram return | 8,025 | 8,025 |

**Observation**: Tab switch produces zero DOM change in both before and after. The guard does not introduce any new DOM delta; it only reduces JavaScript execution by skipping the redundant Properties fanout.

### Scenario C — Pan

| Step | Before fix | After fix |
|------|------------|-----------|
| Before pan | 8,025 | 8,025 |
| After pan +50px | 8,025 | 8,028 |

**Observation**: Pan produces negligible DOM delta (+3 nodes, likely drag handles). `.fpcPropertyOverlay` remains 0.

### Scenario D — Zoom

| Step | Before fix | After fix |
|------|------------|-----------|
| Before zoom | 8,028 | 8,028 |
| After zoom in/out | 8,028 | 8,028 |

**Observation**: Zero DOM change from zoom. No regression.

### Scenario E — Selection

| Step | Before fix | After fix |
|------|------------|-----------|
| Before selection | 8,028 | 8,028 |
| After element click | 11,452 | 11,452 |

**Delta**: +3,424 total DOM, +3,212 SVG nodes.

**Observation**: Matches baseline audit exactly. Selection DOM inflation is a known pre-existing issue (bpmn-js modeler selection handles + `fpcFocusDim` class application). Documented as next contour `perf/diagram-svg-css-repaint-reduction-v1`.

---

## Overlays ON

**Status**: Not measurable in this session.

The session was loaded with `GET /api/sessions/4c515d1c6e/bpmn?raw=1&include_overlay=0`. The server explicitly excluded overlay preview data, so property overlays cannot render even when the UI toggle is activated. The baseline audit noted the same limitation.

**Mitigation**: The overlays-on code path is unchanged by this fix. The unit test explicitly verifies that toggling `propertiesOverlayAlwaysEnabled` from `false` → `true` resets the guard and calls the callbacks again. Previous audits (`perf/diagram-property-overlays-viewport-culling-v1`) confirmed overlays render correctly when data is present.

---

## Network

| Request type | Count | Notes |
|--------------|-------|-------|
| PUT `/bpmn` | 0 | No regression |
| PATCH `/sessions` | 0 | No regression |
| `versions?limit=1` | ~10 over session | Background polls, consistent with baseline |
| POST `/presence` | ~6 | Expected heartbeat |

---

## JavaScript Execution (Inferred)

**Before fix**: Every tab switch and `readySignal` change triggered `runSettledPropertiesFanout` → `applyPropertiesOverlayDecor` → early-exit via `clearPropertiesOverlayDecor`. The cost was function call + ref reads + effect scheduling.

**After fix**: When overlays are off and already cleared, the Properties `useEffect` returns immediately. `runSettledPropertiesFanout` is not called; `applyPropertiesOverlayDecor` and `clearPropertiesOverlayDecor` are not invoked.

**Measured impact**: No observable runtime DOM/network difference (the skipped work was already cheap). The benefit is elimination of redundant JavaScript execution on every tab switch/instance recreation.
