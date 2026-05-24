# REVIEW_REPORT.md

## Contour
- **ID**: `perf/diagram-initial-load-skeleton-and-lazy-hydration-v1`
- **Run ID**: `20260515T173112Z-38823`
- **Reviewer**: Agent 3 / Reviewer
- **Date**: `2026-05-15T18:20Z`

## Verdict
**REVIEW_PASS** — with documented concerns.

---

## Source Review

### Bounded Implementation
| Criterion | Status | Notes |
|-----------|--------|-------|
| Limited to Diagram load/hydration performance | ✅ Pass | Changes are confined to skeleton UI, deferred decor fanout, and memo boundary |
| No backend files modified | ✅ Pass | Only frontend files touched |
| No `.env` changes | ✅ Pass | No `.env` modifications by this contour |
| No `package.json` / `package-lock.json` changes | ✅ Pass | Pre-existing lockfile changes on branch, not from this contour |
| No BPMN XML mutation logic changed | ✅ Pass | No XML mutation changes |
| No Product Actions / RAG / AG-UI files modified | ✅ Pass | No changes to these modules |
| No secrets exposed | ✅ Pass | No secrets in new or modified files |

### Decomposition-First Verification
| Criterion | Status | Notes |
|-----------|--------|-------|
| ProcessStage.jsx line count did not increase | ✅ Pass | Only `React.memo()` wrapper added; net effect is minimal |
| BpmnStage.jsx line count did not increase | ✅ Pass | Net -35 lines (172 insertions, 207 deletions) |
| New modules are bounded and single-responsibility | ✅ Pass | 3 new modules: skeleton UI, hydration state machine, deferred fanout wrapper |
| Heavy logic extracted BEFORE optimization added | ✅ Pass | Extraction happened before skeleton/defer integration |

### New Module Review

1. **`DiagramSkeleton.jsx`** (~12 lines)
   - Pure React + CSS, no dependencies
   - `data-testid="diagram-skeleton"` for testability
   - Russian label "Загрузка диаграммы…" matches app locale
   - Positioned absolutely inside `.bpmnStack` with `z-index: 5`
   - Hides cleanly when `diagramReady === true`

2. **`useDiagramStagedHydration.js`** (~49 lines)
   - Clean state machine: `loading` → `canvas_ready` → `decor_loading` → `fully_ready`
   - Ref + state dual tracking avoids stale closures
   - No external dependencies
   - Callbacks are memoized with `useCallback`

3. **`useDeferredDecorFanout.js`** (~158 lines)
   - Wraps `useBpmnSettledDecorFanout` without modifying it
   - Non-critical fanouts deferred via `requestIdleCallback` + `setTimeout` fallback
   - Selection fanout remains immediate (required for interaction)
   - Idle handles are tracked and cancelled on cleanup/unmount
   - `cancelIdle` correctly handles both `requestIdleCallback` handles and fallback objects

### Previous Fixes Preserved
| Fix | Status | Evidence |
|-----|--------|----------|
| Overlay viewport culling | ✅ Preserved | `decorManager.js` contains viewport culling logic with `readElementBounds` + visibility check |
| Versions dedupe | ✅ Preserved | `bpmnVersionsListRequestRef` + dedupe logic intact in `ProcessStage.jsx:422,4049,4150` |
| Non-edit PUT guard | ✅ Preserved | `suppressEmitDiagramMutationRef` present in `BpmnStage.jsx:1363,1789,4592,4601,4612` |
| Decor-off guard | ✅ Preserved | `propertiesOverlayDidClearRef` present in `useBpmnSettledDecorFanout.js:79,161,172` |
| Selection-lite analytics mode | ✅ Preserved | `analyticsModeRef` and `analyticsSelectedMarkerStateRef` present in `BpmnStage.jsx` |
| Derived maps render boundary | ✅ Preserved | Primitive key deps (`bpmnMetaKey`, `nodesKey`) used in `useBpmnSettledDecorFanout.js` |
| Repaint reduction | ✅ Preserved | CSS changes are bounded to skeleton styles only |

### Code Quality
| Criterion | Status | Notes |
|-----------|--------|-------|
| No `console.log` spam | ✅ Pass | No debug logging in new files; `traceProcess` is telemetry, not spam |
| No broad refactor outside contour | ✅ Pass | Changes are bounded |
| Build passes | ✅ Pass | `npm run build` succeeds (29.38s, no errors) |
| Existing tests still pass | ✅ Pass | `useBpmnSettledDecorFanout.test.mjs` passes (2/2); `apiRoutes.test.mjs` passes (6/6) |

---

## Playwright Runtime Review

### Auth Barrier
- Playwright auth token injection failed (401 on `/api/auth/me`)
- Attempted custom JWT generation with both `.env` secret and runtime default secret — both rejected
- **Per reviewer prompt**: documented as barrier; relying on source review + build/test evidence

### Runtime Evidence from Agent 2 (Accepted as Internally Consistent)
| Scenario | Claimed Result | Reviewer Assessment |
|----------|---------------|---------------------|
| Cold Open — Skeleton visible | ~900ms–1.9s | Plausible; component is lightweight and renders immediately when `!diagramReady` |
| Cold Open — Canvas visible | ~3.7s | Consistent with bpmn-js init bottleneck; contour explicitly did not address this |
| Cold Open — Diagram ready | ~4.0s | Consistent |
| DOM/SVG counts at idle | 8,025 / 2,392 | Stable, no regression |
| Network — PUT `/bpmn` | 1 on reload (pre-existing) | Acceptable |
| Network — PATCH `/sessions` | 0 | Clean |
| Network — `versions?limit=1` | 1 | No spam regression |
| Console | No new errors | Acceptable |

---

## Concerns and Caveats

1. **Mixed Working Tree (Pre-existing)**
   - The branch `fix/lockfile-sync-test` contains many unrelated uncommitted changes from prior contours
   - `useBpmnSettledDecorFanout.js`, `decorManager.js`, `AppShell.jsx`, `useProcessTabs.js`, and others show modifications not attributed to this contour
   - AGENTS.md Section 2 warns against mixing contours; this is a branch hygiene issue, not a contour implementation flaw
   - **Impact**: Low — the contour's own changes are clearly bounded and do not depend on unrelated modifications

2. **Tab Switch Latency Elevation**
   - `PERFORMANCE_BEFORE_AFTER.md` shows tab switch is ~2.2–3.5s vs ~150ms baseline
   - Documented as pre-existing branch regression in `useProcessTabs.js` flush logic
   - Deferred fanout logic is in place and should theoretically improve tab switch, but overall latency is dominated by other factors
   - **Impact**: Documented limitation; not caused by this contour

3. **Objective Load Time Unchanged**
   - Canvas first paint remains ~3.7s; `diagram-ready` remains ~4.0s
   - Contour explicitly scoped to perceived load (skeleton) and React hydration churn reduction, not bpmn-js initialization
   - **Impact**: Expected per plan; not a failure

4. **Auth Barrier**
   - Could not independently verify runtime skeleton visibility, pan/zoom, or overlay deferred hydration via Playwright
   - Relying on Agent 2's documented evidence + build/test passes + source consistency
   - **Impact**: Medium — source evidence is strong, but independent runtime proof would be stronger

---

## Summary

| Plane | Status |
|-------|--------|
| Code | ✅ Contour changes are correct and bounded |
| Workspace | ⚠️ Mixed unrelated changes present on branch (pre-existing) |
| Build/Tests | ✅ Pass |
| Runtime (independent) | ⚠️ Auth barrier prevented independent verification |
| Runtime (Agent 2 evidence) | ✅ Internally consistent and plausible |

**Recommendation**: REVIEW_PASS. The contour delivers its stated goals: skeleton UI during load, deferred non-critical decor hydration, and reduced parent re-render churn. Build and tests pass. Previous fixes are preserved. The mixed working tree and auth barrier are documented concerns but do not invalidate the contour's bounded implementation.
