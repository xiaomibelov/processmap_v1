# POST_OPTIMIZATION_PROFILE_REPORT.md — audit/diagram-post-optimization-runtime-profile-v1

## Executive Summary

After 10 completed Diagram performance contours with objective metric improvements, this post-optimization runtime profile was executed to determine whether residual bottlenecks remain and whether further Diagram optimization is justified.

**Key Finding**: The baseline with overlays OFF is clean and stable (DOM 8,025 / SVG 2,392 / 0 PUT / 0 PATCH). However, **initial load is 6.5 seconds** and **tab switch is 4–6 seconds**. These are the dominant residual bottlenecks.

## Aggregate State Verification

| Metric | Prior Audit Baseline | This Run Initial Load | This Run Final State | Status |
|--------|----------------------|----------------------|----------------------|--------|
| DOM (idle) | 8,025 | 8,025 | 11,242* | ✅ Baseline confirmed at idle |
| SVG (idle) | 2,392 | 2,392 | 5,606* | ✅ Baseline confirmed at idle |
| `.djs-overlay` | 17 | 17 | 17 | ✅ Stable |
| `.fpcPropertyOverlay` | 0 | 0 | 0 | ✅ Stable |
| Pan/zoom delta | 0 | +3,217* | N/A | ⚠️ Anomaly (see below) |
| Analytics selection delta | +137–239 | 0** | N/A | ⚠️ Could not reproduce |
| PUT `/bpmn` | 0 | 0 | 0 | ✅ Confirmed |
| PATCH `/sessions` | 0 | 0 | 0 | ✅ Confirmed |
| `/bpmn/versions?limit=1` | Background only | 4 polls | N/A | ✅ Acceptable |

*Final state contaminated by pan/zoom synthetic event anomaly (see Scenario E).
**Selection clicks did not register due to Playwright interception (see Limitations).

## Scenario Results

### A — Initial Load
- **Time to `diagram-ready`**: 6,540 ms
- **Time to stable idle**: 9,587 ms
- **Network requests during load**: ~20 (auth, meta, workspaces, projects, explorer, session, BPMN XML, versions head-check, presence, product-actions batch)
- **Console errors**: 1 pre-existing `/api/auth/refresh` 401 (before token injection)
- **Subjective note**: 6.5s is a long wait for a user opening a session. This is the most severe measurable bottleneck.

### B — Tab Switch
- **Analysis ↔ Diagram** (3 cycles): toAnalysis 4.6–6.4s, toDiagram 3.9–4.1s
- **XML ↔ Diagram** (3 cycles): toXml 4.1–4.3s, toDiagram 4.6–4.9s
- **DOM stability**: Exact 8,025 before and after all switches
- **Subjective note**: Tab switch feels slow. No remount, but re-render or re-initialization cost is high.

### C — Analytics Selection
- **Attempted**: 10 element clicks
- **Click latency**: ~1,450 ms average
- **DOM delta**: 0
- **SVG delta**: 0
- **`fpcAnalyticsSelected`**: 0
- **Interpretation**: Clicks did not successfully select elements due to palette/hit-rectangle interception in Playwright. Prior audit evidence (+238 DOM delta) is still valid.

### D — Hover
- **Attempted**: 10 element hovers
- **Hover latency**: ~470 ms average
- **DOM stability**: No change
- **Subjective note**: Hover feedback appears smooth. No visible lag.

### E — Pan/Zoom
- **Before**: DOM 8,025 / SVG 2,392
- **After**: DOM 11,242 / SVG 5,606
- **Delta**: DOM +3,217 / SVG +3,214
- **`djs-bendpoint`**: 0 → 664
- **`djs-segment-dragger`**: 0 → 254
- **Interpretation**: This is an anomaly. Synthetic Playwright pan/zoom likely clicked a palette/toolbar item at canvas position (10,10), triggering edit-mode-like heavy rendering. The magnitude confirms that the edit path can produce +3k DOM nodes. Real-user pan/zoom in analytics mode is expected to have delta 0 (per prior audits), but this run could not verify that due to the anomaly.

### F — Overlays ON
- **Status**: Not accessible via Playwright
- **Prior evidence**: `.fpcPropertyOverlay` reduced ~180→70 in default viewport (contour 2)

### G — Overlays OFF
- **Status**: Baseline confirmed
- **Counts**: DOM 8,025 / SVG 2,392

### H — Property Panel
- **Panel open latency**: ~799 ms average (5 cycles)
- **Caveat**: Measured after Scenario E anomaly (DOM 11,242)
- **Interpretation**: Panel update is not instant. Even with contamination, ~800 ms suggests `NotesPanel.jsx` recalculation cost is non-trivial.

### I — Edit Mode
- **Status**: Not accessible via Playwright
- **Prior evidence**: Edit mode selection produces +3,400 DOM delta (contour 8 baseline)

### J — Small vs Large
- **Status**: Not feasible — only session `wewe` available

## Network Summary

| Pattern | Count |
|---------|-------|
| PUT `/bpmn` | 0 |
| PATCH `/sessions` | 0 |
| `/bpmn/versions?limit=1` | 4 (background polls only) |
| `/bpmn/versions?limit=50` | 0 |
| `/sessions/{id}` | 1 (initial load) |
| `/sessions/{id}/bpmn` | 1 (initial load) |
| Failed requests | 1 (`/api/auth/refresh` 401, pre-existing) |
| Auth/presence 401 errors | 0 (all presence returned 200) |

## Performance Categories

Chrome DevTools Performance trace was **not collected** in this run.
Fallback assessment based on timings:
- **Scripting**: Likely dominant during initial load (6.5s) due to bpmn-js modeler/viewer initialization + React mount.
- **Recalculate Style / Layout / Paint**: Minor during idle/hover; massive during edit-mode-like state (Scenario E anomaly).
- **Long tasks**: No explicit long task markers captured.

## Subjective Lag Assessment

| Action | Measured Metric | Felt Lag? | Evidence Strength |
|--------|----------------|-----------|-------------------|
| Initial open | 6.5s to ready | **Yes** | Strong |
| Tab switch | 4–6s | **Yes** | Strong |
| Selection | ~1.45s click latency | Unclear (clicks didn't register) | Weak |
| Hover | ~470ms | No | Moderate |
| Pan/zoom | Anomaly | Unclear | Weak |
| Property panel | ~799ms | Possibly | Moderate |

## Residual Bottleneck Ranking

1. **Confirmed — Initial load (H1)**: 6.5s is unacceptable by any standard.
2. **Confirmed — React/session shell churn (H6)**: 4–6s tab switch indicates parent re-render cost.
3. **Likely — Edit mode heaviness (H3)**: Inferred from Scenario E anomaly and prior audits.
4. **Likely — Property panel cost (H7)**: ~800ms panel latency.
5. **Possible — SVG baseline paint (H2)**: Cannot isolate from scripting.
6. **Possible — Large diagram scale (H4)**: No comparison data.
7. **Rejected — Network/auth noise (H10)**: Network is clean.

## Next Contour Recommendation

**Primary**: `perf/diagram-initial-load-skeleton-and-lazy-hydration-v1`
- Clear trigger condition met (6.5s > 2s)
- Well-scoped, medium risk
- Addresses the dominant user-facing bottleneck

**Backup**: `perf/diagram-property-panel-render-boundary-v1`
- Panel latency is secondary but measurable
- Low-medium risk, well-scoped

**Rejected**: `research/diagram-alternative-renderer-canvas-webgl-fit-v1`
- No evidence SVG cannot meet targets
- Very high risk, research-only
