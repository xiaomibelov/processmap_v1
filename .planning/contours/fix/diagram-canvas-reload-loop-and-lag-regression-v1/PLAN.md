# fix/diagram-canvas-reload-loop-and-lag-regression-v1

## GSD Discipline

- **GSD availability result**: AVAILABLE
- **Commands found**:
  - `/opt/processmap-test/bin/gsd` — PROCESSMAP_GSD_WRAPPER_FOUND
  - `/opt/processmap-test/bin/gsd-sdk` — found
  - `/root/.codex/get-shit-done/bin/gsd-tools.cjs` — CODEX_GSD_TOOLS_FOUND
  - `/root/.codex/skills/gsd-*` — 94 skills present
- **Mode**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- **PATH augmented**: `/opt/processmap-test/bin`
- **Implementation**: not performed
- **Product files**: not modified
- **Contour bounded**: yes, P0 runtime regression only
- **Agent 2 / Agent 3 gates**: prepared in this PLAN.md and dedicated prompt files

## Source / Runtime Truth

```
pwd:        /opt/processmap-test
whoami:     root
hostname:   clearvestnic.ru
date:       2026-05-15T18:46:51+00:00
git branch: fix/lockfile-sync-test
HEAD:       a9a9d9c5f468d9da63415306da6d34dcd605aa0d
origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
API health: {"ok":true,"status":"ok","redis":{"mode":"ON","state":"healthy"}}
Frontend:   HTTP/1.1 200 OK (nginx/1.27.5)
```

### Dirty Working Tree Status
- **Branch**: `fix/lockfile-sync-test` (NOT main)
- **Modified tracked files**: 32 files in `frontend/src/`, plus `.env`, `package.json`, `package-lock.json`
- **Unstaged untracked files**: many (screenshots, runtime ymls, new tools, `.planning/agent-logs/`, etc.)
- **HEAD vs origin/main**: `a9a9d9c` is ahead of `d805e1c` (main). The branch contains many merged contours.

### Diagram-Related Modified Files (from git diff --stat)
| File | Lines | Relevance |
|------|-------|-----------|
| `frontend/src/components/process/BpmnStage.jsx` | +172 / −207 | **PRIMARY** — skeleton, hydration, decor fanout integration |
| `frontend/src/components/ProcessStage.jsx` | +272 / −272 | **PRIMARY** — tab shell, overlay layers memo, ProcessDiagramOverlayLayers props |
| `frontend/src/features/process/hooks/useProcessTabs.js` | +119 / −? | **PRIMARY** — tab switch logic, flush, replay, pending timers |
| `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | +32 / −? | **PRIMARY** — decor fanout effects, readySignal |
| `frontend/src/features/process/bpmn/stage/orchestration/useDeferredDecorFanout.js` | NEW | **PRIMARY** — deferred decor fanout wrapper |
| `frontend/src/features/process/bpmn/stage/load/useDiagramStagedHydration.js` | NEW | **PRIMARY** — hydration state machine |
| `frontend/src/features/process/bpmn/stage/load/DiagramSkeleton.jsx` | NEW | **PRIMARY** — skeleton UI |
| `frontend/src/styles/legacy/legacy_bpmn.css` | +62 / −? | Skeleton CSS animations |
| `frontend/src/styles/tailwind.css` | +369 / −? | Various (pre-existing / mixed) |
| `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` | +6 / −6 | React.memo wrapper added |
| `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js` | +3 / −? | Memoization of overlay props |
| `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js` | +6 / −? | Overlay props builder |

### Recent Git History (top 20)
```
a9a9d9c fix(frontend): copy .npmrc into Docker image for legacy-peer-deps
b433e1a fix(frontend): regenerate package-lock.json for npm 10 compatibility
d805e1c Make analysis steps table strict (#383)
9cdf02b Add product actions RAG indexing (#382)
...
```

**Note**: The working tree is dirty with many unrelated changes. This is a known pre-existing condition documented in previous contour reports. Agent 2 must not assume a clean baseline.

## User-Reported Regression

1. **Diagram/page loads multiple times** — user perceives repeated load cycles.
2. **Canvas feels worse than before** — laggy pan/zoom/interaction.
3. **Pan/zoom/interaction nearly unusable**.
4. **Previous optimizations did not produce acceptable real improvement**.
5. **Recent skeleton/lazy hydration contour may have introduced staged reload/re-render feeling**.

## Previous Contours / Suspect Changes

### `perf/diagram-initial-load-skeleton-and-lazy-hydration-v1`
- **Status**: REVIEW_PASS (with documented concerns)
- **Run ID**: `20260515T173112Z-38823`
- **New files introduced**:
  - `DiagramSkeleton.jsx` — CSS-only skeleton
  - `useDiagramStagedHydration.js` — state machine (`loading` → `canvas_ready` → `decor_loading` → `fully_ready`)
  - `useDeferredDecorFanout.js` — deferred non-critical decor via `requestIdleCallback` + `setTimeout` fallback
- **Integration into BpmnStage**:
  - `setDiagramReady(false)` on `[sessionId, reloadKey]` change (line ~1495)
  - Skeleton rendered when `!diagramReady` (line ~5760)
  - `useDeferredDecorFanout` called with `onCanvasReady`, `onDecorLoading`, `onFullyReady` callbacks
- **Review concerns noted**:
  - Mixed working tree pre-existing
  - Tab switch latency elevated (~2.2–3.5s vs ~150ms baseline) — documented as pre-existing `useProcessTabs.js` regression
  - Objective canvas load time unchanged (~3.7s)
  - Auth barrier prevented independent Playwright verification

### `audit/diagram-post-optimization-runtime-profile-v1`
- **Status**: REVIEW_PASS
- Confirmed H1 (initial load 6.5s) and H6 (tab switch 4–6s) as top residual bottlenecks.

### `perf/diagram-derived-maps-and-render-boundary-v1`
- **Status**: REVIEW_PASS (after rework round 1)
- Added derived model memoization with primitive keys.
- `interviewDecorSignature` useMemo dependency fix.

### `feature/diagram-analytics-layer-selection-lite-decomposition-first-v1`
- **Status**: REVIEW_PASS
- Selection-lite analytics mode, decomposition-first extraction.
- No direct relation to reload loop, but increased BpmnStage complexity.

## Exact Reproduction Plan

See `RUNTIME_NAVIGATION.md` for full scenarios.

Summary of required reproduction scenarios:

- **Scenario A — Cold open**: Fresh browser → open session → Diagram tab. Record skeleton appearances, canvas disappear/reappear, `diagramReady` toggles, DOM/SVG counts, network, console.
- **Scenario B — Warm tab switch**: Analysis ↔ Diagram, XML ↔ Diagram. Record time to visual feedback, remount vs CSS hide/show, skeleton flashes, DOM changes.
- **Scenario C — Pan/zoom after load**: 5 cycles. Record lag, DOM/SVG deltas, overlay counts, long tasks.
- **Scenario D — Selection after load**: 5 elements. Record DOM/SVG delta, property panel response, lag.
- **Scenario E — Disable/revert suspect experiment**: Temporarily disable staged hydration/deferred fanout locally and compare perceived behavior.

## Instrumentation / Counters Plan

Agent 2 may add **temporary dev-only counters** (must be removed or gated before final):

| Counter | Location | Purpose |
|---------|----------|---------|
| BpmnStage render count | `BpmnStage.jsx` top-level ref + log | Detect excessive renders |
| BpmnStage mount/unmount | `BpmnStage.jsx` useEffect cleanup | Detect remount cycles |
| bpmn-js modeler/viewer create count | `ensureModeler` / `ensureViewer` | Detect repeated init |
| importXML count | `renderViewerDiagram` / `renderModelerDiagram` | Detect repeated import |
| `diagramReady` transitions | `setDiagramReady` setter wrapper | Detect flapping |
| Skeleton show/hide | `DiagramSkeleton` render log | Detect skeleton flashes |
| `useDiagramStagedHydration` stage transitions | Inside hook | Detect hydration stage churn |
| `useProcessTabs` active tab changes | `setTabWithReason` | Detect tab churn |
| `viewerInstanceKey` / `modelerInstanceKey` changes | `useDeferredDecorFanout` | Detect instance key churn causing effect re-run |

**Rule**: Do not leave noisy production logs. Use `window.__pmDiagramDebug` or `console.count` in local testing only.

## Source Map

### Primary Suspect Files

| # | Path | Role | Suspected Reload/Remount Relation | Safe Change Area | Rollback Candidate | Risk |
|---|------|------|-----------------------------------|------------------|-------------------|------|
| 1 | `frontend/src/features/process/bpmn/stage/load/useDiagramStagedHydration.js` | Hydration state machine | `reset()` may be called repeatedly; state transitions may cause parent re-render | Remove/inline reset; stabilize state | Full revert to no staged hydration | Low — pure hook |
| 2 | `frontend/src/features/process/bpmn/stage/load/useDeferredDecorFanout.js` | Deferred decor wrapper | `useEffect` on `[viewerInstanceKey, modelerInstanceKey]` resets `stageRef` to `loading` and cancels idle callbacks when instances change; may cause repeated canvas-ready → loading cycles | Stabilize instance keys or remove effect reset | Revert to direct `useBpmnSettledDecorFanout` call | Medium — affects perceived load |
| 3 | `frontend/src/features/process/bpmn/stage/load/DiagramSkeleton.jsx` | Skeleton UI | No logic, but CSS animation may contribute to perceived lag if repeatedly mounted | CSS-only, safe to keep if not remounted | Remove if skeleton itself is culprit | Low |
| 4 | `frontend/src/components/process/BpmnStage.jsx` | Main diagram component | `setDiagramReady(false)` on `[sessionId, reloadKey]` (line ~1495); `updateRuntimeStatus` calls `setDiagramReady` (line ~1715); `useDiagramStagedHydration` integrated at line ~5521; skeleton rendered at line ~5760 | Guard `setDiagramReady(false)` to avoid repeated resets; stabilize `diagramReady` transitions | Partial revert of skeleton/hydration integration | High — core component |
| 5 | `frontend/src/components/ProcessStage.jsx` | Process shell | `ProcessDiagramOverlayLayers` rendered without explicit `key`; `useStableProcessDiagramOverlayLayersProps` may return new object identities; tab conditional rendering at line ~6239+ | Add stable key or ensure memoization prevents remount; reduce prop churn | Revert overlay memo changes | Medium — shell component |
| 6 | `frontend/src/features/process/hooks/useProcessTabs.js` | Tab state controller | `schedulePendingTabReplay` (line ~170) creates retry loops up to 12 attempts; `flushBpmnTab` + `bpmnSync.flushFromActiveTab` on tab switch may trigger save→replay→save cycles; `visibleProbeCycleRef` effect (line ~362) calls `ensureVisible` on every `tab` change | Stabilize tab switch path; dedupe flush calls; reduce retry loops | Partial revert of tab switch flush logic | High — affects all tabs |
| 7 | `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | Decor fanout orchestrator | `readySignal` useMemo on `[viewerInstanceKey, modelerInstanceKey]`; effects depend on `readySignal`, `notesSig`, `bpmnMetaKey`, `nodesKey` | Ensure primitive keys are actually stable | Revert to older fanout logic | Medium |
| 8 | `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js` | Overlay props memoization | Shallow-equal memoization of `bpmnStageProps`; if any prop changes identity, entire `ProcessDiagramOverlayLayers` re-renders | Stabilize function props; verify memo hit rate | Revert to direct prop passing | Low |
| 9 | `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js` | Props builder | `bpmnStageProps.view` = `tab === "xml" ? "xml" : "editor"`; `reloadKey` passed directly; no `key` prop on BpmnStage | Add stable `key` if remount is proven | Add key or remove reloadKey | Low |

## Hypotheses

### H1. Skeleton/staged hydration introduced repeated ready-state resets
- `useDiagramStagedHydration` provides `reset()` which may be called on every session/reload change.
- `useDeferredDecorFanout` resets `stageRef.current = "loading"` when `viewerInstanceKey || modelerInstanceKey` becomes falsy, then re-fires `onCanvasReady` → `onDecorLoading` → `onFullyReady`.
- If instance keys flap (create/destroy/create), this causes a visible reload wave.
- **Evidence needed**: count of `stageRef` resets in `useDeferredDecorFanout`; count of `diagramReady` false→true transitions.

### H2. useProcessTabs regression causes parent shell re-render/remount
- Tab switch takes 4–6s (documented in previous audit).
- `flushBpmnTab` + `bpmnSync.flushFromActiveTab` runs on every switch away from Diagram.
- `schedulePendingTabReplay` retries up to 12 times with backoff.
- If flush is slow or fails, pending replay may trigger repeated attempts.
- **Evidence needed**: console/tab trace logs; measure tab switch time; count `setTabWithReason` calls per single user click.

### H3. BpmnStage key/props instability causes remount
- `ProcessDiagramOverlayLayers` is `memo()` but receives `bpmnStageProps` object.
- If `useStableProcessDiagramOverlayLayersProps` has a cache miss, new object identities propagate.
- No explicit `key` prop on `BpmnStage` inside `ProcessDiagramOverlayLayers`.
- `reloadKey` changes may cause `setDiagramReady(false)` without actual data change.
- **Evidence needed**: React DevTools Profiler or render count; `bpmnStageProps` equality check.

### H4. bpmn-js importXML runs multiple times
- `renderViewerDiagram` / `renderModelerDiagram` / `renderNewDiagramInModelerRuntime` call `importXML`.
- `ensureViewer` / `ensureModeler` create new `Viewer` / `Modeler` instances if refs are null.
- If `destroyRuntime()` is called and then re-init happens, same XML may be imported again.
- **Evidence needed**: count of `new Viewer` / `new Modeler` / `importXML` calls for same session.

### H5. useDeferredDecorFanout delays cause staged flicker/reload perception
- Non-critical fanouts (notes, stepTime, robotMeta, properties) are deferred via `requestIdleCallback`.
- Canvas may be visible, then decorations cause layout shifts / re-renders.
- `onFullyReady` heuristic fires after ~500ms idle timeout, not after actual work completes.
- **Evidence needed**: timeline of DOM mutations after canvas visible; correlation with deferred fanout schedule.

### H6. ProcessStage parent re-renders with new object identities causing child churn
- `ProcessStage.jsx` has 60+ `useEffect` hooks and many `useMemo`/`useCallback`.
- Any unstable dependency can cause re-render, which propagates to `ProcessDiagramOverlayLayers`.
- `diagramOverlayLayersProps` is built fresh every render but memoized by `useStableProcessDiagramOverlayLayersProps`.
- **Evidence needed**: identify which prop causes cache miss in `useStableProcessDiagramOverlayLayersProps`.

### H7. Auth/presence/session polling causes parent state churn
- `useSessionPresence` polls; `pollRemoteSessionSnapshot` runs on interval.
- If polling results update `draft` or session state, ProcessStage re-renders.
- **Evidence needed**: network tab correlation between `/presence` POSTs and re-render times.

### H8. Dirty working tree / mixed branch caused regression not attributable to intended contour
- Branch `fix/lockfile-sync-test` has 32+ modified frontend files from multiple contours.
- `useProcessTabs.js` shows significant diff — may contain unrelated changes.
- **Evidence needed**: `git blame` / `git log --oneline -- frontend/src/features/process/hooks/useProcessTabs.js` to identify which contour changed it.

### H9. Actual bpmn-js initialization remains expensive but not reload loop
- One init only, but takes ~3.7s.
- This is a baseline limitation, not a regression.
- **Evidence needed**: if init count == 1 but time is long, this hypothesis is confirmed as baseline, not regression cause.

## Bounded Fix / Rollback Strategy

Agent 2 must choose based on evidence. Allowed options:

### Option A — Revert or disable staged skeleton/lazy hydration
- If latest contour made runtime worse, revert the specific behavior.
- Remove `useDiagramStagedHydration` and `useDeferredDecorFanout` from BpmnStage.
- Keep `DiagramSkeleton` only if it can be shown once without flapping.
- **Trigger**: H1 or H5 confirmed with evidence.

### Option B — Stabilize diagramReady/staged hydration state
- Guard `setDiagramReady(false)` so it only fires on actual session/reload change, not on prop churn.
- Ensure `diagramReady` does not flap: once true, only go false on explicit destroy or session change.
- Skeleton only before first canvas paint; once visible, do not hide for non-critical hydration.
- **Trigger**: H1 confirmed but skeleton itself is wanted.

### Option C — Fix useProcessTabs/tab-shell regression
- Stabilize tab content identity.
- Prevent unnecessary remount: keep Diagram mounted if already loaded (CSS toggle vs unmount).
- Reduce `schedulePendingTabReplay` retry frequency or eliminate if not needed.
- **Trigger**: H2 or H3 confirmed.

### Option D — Prevent repeated importXML/modeler init
- Same `sessionId` + `bpmn_xml_version` should not import more than once unless XML changed.
- Stable `key` on BpmnStage if remount is proven.
- In-flight init dedupe.
- **Trigger**: H4 confirmed.

### Option E — Memoize parent props/callbacks
- Only if source proof shows specific prop churn causing re-render.
- No broad refactor.
- **Trigger**: H6 confirmed with specific changed key.

### Option F — Isolate and revert culprit file/change from dirty tree
- If H8 confirmed, revert the specific unrelated change.
- Document the finding.
- **Trigger**: H8 confirmed.

## Acceptance Criteria

Agent 3 should pass only if:

1. **Multi-load symptom fixed**: no repeated skeleton/canvas reload cycles after initial Diagram open; `diagramReady` does not flap; BpmnStage does not remount repeatedly.
2. **bpmn-js init/import**: `importXML` / modeler init not repeated for same session/version without reason.
3. **Tab switch**: Analysis ↔ Diagram and XML ↔ Diagram do not feel like full reload; measured time improves or source-level limitation documented with next precise contour.
4. **Interaction**: pan/zoom usable after stable load; selection-lite still works; property panel still works.
5. **Safety**: 0 PUT /bpmn from view interactions; 0 PATCH /sessions; no versions spam regression; no BPMN XML mutation; no backend changes.
6. **Regression**: if latest skeleton/lazy hydration caused worsening, it is reverted or fixed. No new visible reload waves.
7. **Evidence**: before/after timings; mount/init/import counts; screenshots/video notes if feasible; network summary; console summary.
8. **Strict improvement**: “same as before” is not enough. “Worse but skeleton visible” is fail. Agent 3 must create CHANGES_REQUESTED if no material improvement.

## Non-goals

- No Product Actions / registry / реестр changes.
- No AG-UI changes.
- No RAG changes.
- No backend changes.
- No BPMN XML semantics changes.
- No WebGL/canvas replacement.
- No broad app refactor.
- No cosmetic skeleton-only win.
- No unrelated CSS tweaks.
- No continuing if runtime got worse.

## Agent 2 Execution Plan

See `EXECUTOR_PROMPT.md`.

## Agent 3 Review Plan

See `REVIEWER_PROMPT.md`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Playwright auth barrier prevents runtime verification | High | Medium | Rely on build/test + console instrumentation + DOM counters; document limitation |
| Dirty tree hides true culprit | Medium | High | Use `git blame` + bisect logic; isolate suspect file |
| Reverting skeleton makes perceived load worse (no visual feedback) | Medium | Medium | Keep skeleton but stabilize state; do not remove unless proven culprit |
| Tab switch latency is pre-existing and not fixable in this contour | Medium | Medium | Document as limitation; scope next contour if needed |
| bpmn-js init cost is fundamental (~3.7s) | High | Low | Out of scope for this contour; focus on reload loop only |
| Fixing one loop reveals another | Medium | Medium | Instrument thoroughly; iterate within Agent 2 before review |

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — source/runtime truth captured
- [x] Gate 3 — regression symptoms documented
- [x] Gate 4 — exact reload-loop reproduction plan defined
- [x] Gate 5 — mount/init/load counters plan defined
- [x] Gate 6 — suspect recent contours/files listed
- [x] Gate 7 — rollback/revert strategy defined
- [x] Gate 8 — acceptance metrics require improvement
- [x] Gate 9 — Agent 2 executor prompt ready
- [x] Gate 10 — Agent 3 reviewer prompt ready
- [ ] Gate 11 — READY_FOR_EXECUTION marker created (pending file write)
