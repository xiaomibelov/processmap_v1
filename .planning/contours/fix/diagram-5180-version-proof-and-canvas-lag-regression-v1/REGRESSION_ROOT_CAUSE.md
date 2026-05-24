# REGRESSION_ROOT_CAUSE.md

## Primary Root Cause: Unreliable Delivery Loop + Stale Runtime

### Evidence
1. Gateway container had 40 asset files including 7+ stale `InterviewPathsView-*.js` and 7+ stale `Modeler-*.js` chunks
2. Container creation time (May 14 21:57) was older than newest file inside (May 15 19:09)
3. No volume mount for `/usr/share/nginx/html`
4. Asset hashes in container matched local dist only after manual `docker cp` (inferred)

### Impact
- Agents built and tested locally, but runtime 5180 could serve stale or mixed assets
- Browser cache + stale assets = unpredictable behavior
- User perceived "no improvement" because fixes didn't consistently reach runtime

## Secondary Root Cause: Skeleton/Decor Deferred Scheduling (FIXED in prior contour)

- `useDiagramStagedHydration` + `useDeferredDecorFanout` caused skeleton flapping
- Previous contour (`fix/diagram-canvas-reload-loop-and-lag-regression-v1`) removed these
- REVIEW_PASS confirmed stable canvas

## Current State After This Contour

1. **Delivery loop**: Fixed with bind volume. Runtime always serves current `frontend/dist`.
2. **Version proof**: Every build exposes SHA/timestamp via `build-info.json` and UI badge.
3. **Canvas remount**: Stable. `djs-container` count = 1 across tab switches.
4. **Skeleton flapping**: None observed.
5. **No repeated load cycles**: Confirmed via Playwright.

## Remaining Bottlenecks (Out of Scope for This Contour)

1. **Tab switch latency (~2.2-3.5s)**: Pre-existing `useProcessTabs.js` regression. Interview projection, BPMN flush, and save-on-switch are expensive.
2. **Cold open (~3.7s)**: bpmn-js `importXML` + modeler/viewer creation. Fundamental bottleneck.
3. **Pan/zoom**: Needs dedicated profiling if still reported as laggy after version proof.

## Recommended Next Contours

- `perf/diagram-bpmnjs-initialization-profile-and-viewer-split-v1` — address cold open
- `perf/useProcessTabs-tab-switch-optimize-v1` — address tab switch latency
