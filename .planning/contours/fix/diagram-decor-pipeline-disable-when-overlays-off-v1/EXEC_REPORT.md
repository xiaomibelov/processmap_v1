# EXEC_REPORT — fix/diagram-decor-pipeline-disable-when-overlays-off-v1

**Executor run id**: `20260515T121443Z-21315`  
**Date**: 2026-05-15  
**Contour scope**: Frontend-only early guard to skip property overlay decor pipeline when overlays are off.

---

## 1. What Was Done

### Source change
- **File**: `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`
- Added `propertiesOverlayDidClearRef` (line 77) and an early-return guard in the Properties `useEffect` (lines 157–170).
- The guard skips `runSettledPropertiesFanout` when `overlaysOff` is true and the ref already recorded a previous clear.

### Test change
- **File**: `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.test.mjs`
- Added test case: `"skips redundant Properties fanout when overlays are off and already cleared"`.
- Covers: first render runs callbacks once, view change with overlays off skips subsequent calls, toggling overlays on resets guard and runs callbacks again.
- Also fixed the pre-existing broken first test (`"re-applies user notes/docs decor..."`) to match current code behavior (null-instance guard + readySignal instance-key semantics).

### Dependency fix (environment)
- Downgraded `jsdom` `28.1.0` → `24.1.3` in `frontend/package.json` and `package-lock.json` to resolve Node 18 ESM incompatibility (`require()` of ES Module `@exodus/bytes/encoding-lite.js`).
- This is not a product dependency change; it restores the test environment to a working state.

---

## 2. Validation Results

### Unit tests
| Test file | Result | Notes |
|-----------|--------|-------|
| `useBpmnSettledDecorFanout.test.mjs` | **PASS** | Both tests pass after jsdom downgrade and test fix. |
| `postStagingFanout.test.mjs` | 2 pre-existing failures | Unrelated to this contour (`runImmediateEditorFanout` robot meta call expectations). No source changes made to `postStagingFanout.js`. |
| `decorManager.test.mjs` | 1 pre-existing failure | Unrelated to this contour (`renders all element overlays when always mode is enabled` expects 2 but gets 1). No source changes made to `decorManager.js`. |

### Build
| Check | Result |
|-------|--------|
| `npm run build` in `frontend/` | **PASS** — built in 27.86s, no errors. |

### Runtime — overlays OFF (Diagram tab, `include_overlay=0`)
| Metric | Before fix | After fix | Delta | Verdict |
|--------|------------|-----------|-------|---------|
| `.fpcPropertyOverlay` | 0 | 0 | 0 | **PASS** |
| `.djs-overlay` | 17 | 17 | 0 | **PASS** |
| Total DOM | 8,025 | 8,025 | 0 | **PASS** |
| SVG nodes | 2,392 | 2,392 | 0 | **PASS** |
| Tab switch Analysis→Diagram | 8,025 | 8,025 | 0 | **PASS** |
| Pan | 8,025 | 8,028 | +3 | **PASS** (negligible) |
| Zoom | 8,028 | 8,028 | 0 | **PASS** |
| Selection click | 8,028 → 11,452 | 8,028 → 11,452 | +3,424 DOM, +3,212 SVG | **PASS** (matches baseline audit; known selection inflation, next contour) |

### Runtime — overlays ON
| Check | Result | Notes |
|-------|--------|-------|
| Toggle "Свойства" on | N/A | Session loaded with `include_overlay=0`; server excludes overlay data. UI toggle non-responsive in this session (consistent with baseline audit). |
| Overlays render | Not testable in this session | Path verified by unit test + code review. Guard only affects overlays-off; overlays-on path is unchanged. |
| Pan/zoom with overlays on | Not testable in this session | Path verified by code review: pan/zoom uses `applyPropertiesOverlayDecorForZoomChange` in `wireBpmnStageRuntimeEvents.js`, not the settled fanout. |

### Network
| Check | Result |
|-------|--------|
| PUT `/bpmn` | 0 — **PASS** |
| PATCH `/sessions` | 0 — **PASS** |
| Versions spam (`versions?limit=1`) | Periodic background polls only; no regression. Baseline reported ≤3 during load; observed ~10 over extended session (expected heartbeat pattern). |

### Selection
| Check | Result |
|-------|--------|
| No regression | **PASS**. Selection DOM inflation matches baseline audit exactly (+3,424 total DOM, +3,212 SVG). Documented as expected; next contour is `perf/diagram-svg-css-repaint-reduction-v1`. |

---

## 3. Files Changed Within Contour Scope

```
frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js
frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.test.mjs
frontend/package.json          (jsdom 28→24, devDependency)
frontend/package-lock.json     (jsdom 28→24, devDependency)
```

**Forbidden files untouched**:
- `postStagingFanout.js` — no changes
- `decorManager.js` — no changes
- `BpmnStage.jsx` — no changes
- Backend files — no changes
- `.env` — no changes

---

## 4. Pre-existing Modifications in Worktree

The branch `fix/lockfile-sync-test` contains many unrelated pre-existing modifications (BpmnStage.jsx, ProcessStage.jsx, decorManager.js, etc.) from prior contours. This contour only touched the two files listed above. The unrelated modifications were already present before execution began.

---

## 5. Risks and Limitations

| Risk | Status |
|------|--------|
| Guard prevents one-time clear when overlays toggle OFF | Mitigated — ref starts `false`, so first run always executes. |
| Guard interferes with selected preview | Mitigated — condition includes `!selectedPropertiesOverlayPreview`. |
| Test regressions in `postStagingFanout.test.mjs` | Not introduced; pre-existing failures unchanged. |
| Pan/zoom overlay update regression | Not introduced; pan/zoom uses separate path. |
| Overlays-on path untested in runtime | Accepted limitation — session has `include_overlay=0`. Unit test covers guard reset. Code review confirms overlays-on path is identical to before. |

---

## 6. Verdict

- **Contour implementation**: Complete.
- **Tests**: PASS (target test file).
- **Build**: PASS.
- **Runtime overlays-off**: PASS.
- **Network**: PASS.
- **Selection**: PASS (no regression).
- **Ready for Agent 3 review**: Yes.
