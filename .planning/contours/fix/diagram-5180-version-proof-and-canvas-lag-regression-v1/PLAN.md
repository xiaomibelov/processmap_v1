# fix/diagram-5180-version-proof-and-canvas-lag-regression-v1

## GSD Discipline

- **GSD wrapper found**: `/opt/processmap-test/bin/gsd`
- **GSD skills found**: 57 skills in `/root/.codex/skills/gsd-*`
- **GSD agents found**: `/root/.codex/agents/gsd-*`
- **Codex tools found**: `/root/.codex/get-shit-done/bin/gsd-tools.cjs`
- **Mode**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- Commands used: `gsd usage`, `gsd --help`, `gsd`
- Implementation was NOT performed by Agent 1.
- Product files were NOT changed by Agent 1.
- Contour is bounded to runtime version proof + canvas lag regression only.
- Agent 2 / Agent 3 gates are prepared below.

## Source / Runtime Truth

Captured at 2026-05-15T19:38:24+00:00 on clearvestnic.ru.

### Git State
- **Working directory**: `/opt/processmap-test`
- **Branch**: `fix/lockfile-sync-test`
- **HEAD**: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- **origin/main**: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- **Dirty files**: 32 modified frontend files + untracked files
- **Diffstat**: ~2419 insertions, ~1452 deletions across frontend
- **Commits ahead of main**: branch contains multiple contour commits merged

### Docker / Runtime State
- **Gateway container**: `processmap_test-gateway-1`, created 2026-05-14T21:57:42Z, up 22h
- **Gateway image**: `processmap_test-gateway:latest`, built 2026-05-14 21:51:16 +0000 UTC
- **Frontend dev container**: `processmap_test-frontend-1`, created 2026-05-14T10:08:44Z, up 2h
- **API container**: `processmap_test-api-1`, up 33h
- **Health**: `http://clearvestnic.ru:8088/health` → `{"ok":true,"status":"ok",...}`
- **5180 response**: HTTP 200, `Last-Modified: Fri, 15 May 2026 19:09:26 GMT`
- **Cache headers on index.html**: `no-cache, no-store, must-revalidate`
- **Cache headers on assets**: `public, max-age=31536000, immutable`

### Served vs Local Assets
| Asset | Served (5180) | Local dist | Match |
|-------|---------------|------------|-------|
| `index.html` | md5 `a17e255f70aa6c2cc120de444028c267` | md5 `a17e255f70aa6c2cc120de444028c267` | ✅ |
| `index-CnobOmL9.js` | md5 `0d1e86183a6661fece56d2cde7974c93` | md5 `0d1e86183a6661fece56d2cde7974c93` | ✅ |
| `index-N6LiXuk7.css` | present | present | ✅ |

**Critical finding**: Gateway container filesystem contains MULTIPLE stale asset versions with different hashes (e.g., 7+ `InterviewPathsView-*.js` chunks, 7+ `Modeler-*.js` chunks) ranging from May 15 10:41 to 19:09. This proves files are being copied into the running container manually (likely `docker cp`), NOT via image rebuild + container recreate. The container creation time (May 14 21:57) is older than the newest file inside it (May 15 19:09), and there are no volume mounts for `/usr/share/nginx/html`.

### Delivery Loop Hypothesis
The current 5180 delivery loop appears to be:
1. Source change in `/opt/processmap-test/frontend/src/`
2. `npm run build` → produces `frontend/dist/`
3. `docker cp frontend/dist/. processmap_test-gateway-1:/usr/share/nginx/html/` (inferred)
4. Nginx serves updated files without container restart

This is fragile: missing `docker cp` step = stale runtime; old assets accumulate; no rollback capability; no version traceability.

## User-Reported Regression

- After many Diagram performance contours, user sees almost no visual improvement.
- Canvas remains severely laggy.
- Page/Diagram feels like it loads several times.
- Previous contour (`fix/diagram-canvas-reload-loop-and-lag-regression-v1`) got REVIEW_PASS at 19:28, but user still reports issues.
- Possible causes:
  1. Runtime delivery loop is unreliable — changes may not reach 5180 consistently.
  2. Browser cache serves stale assets despite `no-cache` on index.html (service worker? localStorage?).
  3. The actual source fixes don't materially improve the subjective lag.
  4. `useProcessTabs.js` regression causes tab switch delay/remount (2.2–3.5s documented).
  5. bpmn-js init remains expensive (~3.7s) regardless of React-level fixes.

## Runtime Version Proof Plan

### Goal
Every Agent 2 build and every Agent 3 review must prove which source version is actually served on 5180.

### Implementation (Agent 2)
**Recommended approach: Option A + Option B hybrid**

1. **Build-time generated module**: `frontend/src/generated/buildInfo.js`
   - Generate at build time (via Vite plugin or pre-build script).
   - Contains: `branch`, `git SHA` (short + full), `build timestamp` (ISO), `contour id`, `dirty flag` (if working tree has uncommitted changes).
   - Expose as `window.__PROCESSMAP_BUILD_INFO__` via app shell mount.

2. **Static JSON fallback**: `frontend/public/build-info.json`
   - Generated alongside the JS module.
   - Contains same fields.
   - Accessible via `curl http://clearvestnic.ru:5180/build-info.json`.

3. **Non-intrusive UI marker** (test runtime only):
   - Small fixed-position badge or dev-only footer.
   - Visible if `window.location.host` matches test runtime or if `buildInfo` contains a test marker.
   - Shows: `SHA: a9a9d9c | 2026-05-15T19:xx:xxZ | fix/diagram-...`
   - Must NOT appear in production builds.

4. **Build script integration**:
   - Create `scripts/generate-build-info.js` (Node, no new deps).
   - Run before `vite build` (e.g., in npm `prebuild` script or Makefile).
   - Safe: reads `git` commands, writes to `frontend/src/generated/buildInfo.js` and `frontend/public/build-info.json`.

### Safety Requirements
- No secrets in build info.
- No `.env` contents exposed.
- No tokens or keys.
- Only git metadata, timestamp, contour id.

## 5180 Delivery Loop Plan

Agent 2 must document and fix the delivery loop.

### Current State (Inferred)
- Gateway container was built from `Dockerfile.prod` on May 14 21:51.
- Gateway container was created on May 14 21:57.
- Files inside the container have been overwritten multiple times on May 15 (evidence: multiple stale chunks with different hashes).
- No `docker compose up -d --build` pattern is in use for the gateway.
- `docker cp` is the suspected delivery mechanism.

### Required Actions
1. **Document exact current delivery loop**:
   - Check if `docker cp` or `docker compose build/up` is used.
   - Check deploy scripts in `deploy/scripts/`.
   - Check any Makefile or npm scripts.

2. **Choose one of two approaches**:
   - **Approach A (recommended)**: Add a bind volume mount for `frontend/dist` in `docker-compose.yml` for the gateway service. Then `npm run build` on host updates files immediately. Gateway restart not required. Old stale assets are hidden because host dist is mounted over the image dist.
   - **Approach B**: Use `docker compose up -d --build gateway` properly. Requires image rebuild + container recreate. Old assets are cleaned because new image starts fresh.

3. **If using bind volume**:
   - Mount `./frontend/dist:/usr/share/nginx/html:ro`
   - Remove or comment out the `COPY --from=build /app/dist /usr/share/nginx/html` from `Dockerfile.prod` (or keep it as fallback).
   - Document in `DELIVERY_LOOP_NOTES.md`.

4. **Clean stale assets**:
   - If bind volume: stale assets in image are shadowed by mount.
   - If rebuild: stale assets are gone in new image.
   - If keeping `docker cp`: add cleanup step to remove old assets before copying.

### Verification
- After any change, `curl -s http://clearvestnic.ru:5180/build-info.json` must show the current SHA/timestamp.
- `curl -s http://clearvestnic.ru:5180/?cb=<timestamp>` must reference asset hashes that match `frontend/dist/assets/`.
- Container ID must remain stable (bind volume) or change with documented before/after (rebuild).

## Canvas Lag / Reload Reproduction Plan

Once version proof is confirmed, Agent 2 must reproduce and fix lag.

### Scenarios

**Scenario A — Fresh runtime proof**
1. Open fresh browser context (Playwright).
2. Navigate to `http://clearvestnic.ru:5180/?cb=<timestamp>`.
3. Verify `window.__PROCESSMAP_BUILD_INFO__` matches source HEAD.
4. Record build marker evidence.

**Scenario B — Cold session open**
1. Open known session (`wewe` in `Описание процессов Долгопрудный`).
2. Measure:
   - Page shell visible time.
   - Diagram tab visible.
   - Skeleton flashes (count).
   - Canvas first visible.
   - `diagramReady` true.
   - `.djs-container` count.
   - `svg` count.
   - Network calls.
   - Console errors.

**Scenario C — Tab switch**
1. Analysis → Diagram → Analysis → Diagram.
2. XML → Diagram.
3. Measure:
   - Canvas disappearance.
   - Skeleton flash.
   - BpmnStage remount.
   - `.djs-container` count changes.
   - Time to usable canvas.

**Scenario D — Pan/zoom**
1. Wait for stable canvas.
2. 5 manual or programmatic pan/zoom cycles.
3. Measure responsiveness, DOM/SVG deltas, long tasks.

**Scenario E — Selection**
1. Select 5 BPMN elements.
2. Verify analytics selection, property panel.
3. Verify no `djs-bendpoint`, no `djs-segment-dragger`, no `fpcFocusDim`.

**Scenario F — Suspect code inspection**
- If runtime is still bad after version proof is fresh:
  - Inspect `useProcessTabs.js` for flush/tab delay logic.
  - Inspect `BpmnStage.jsx` for key/props instability.
  - Inspect modeler/importXML for repeated init.
  - If recent changes caused regression, revert/fix.

## Instrumentation / Counters Plan

Agent 2 may use temporary dev-only counters.

- `window.__PM_DIAGRAM_DEBUG__` object with counters:
  - `bpmnStageRenderCount`
  - `bpmnStageMountCount`
  - `modelerCreateCount`
  - `importXMLCount`
  - `diagramReadyTransitions`
  - `skeletonShowCount`
  - `activeTabChanges`
  - `djsContainerCount` (snapshot)
  - `svgCount` (snapshot)

Allowed:
- Temporary `performance.mark/measure`.
- Playwright-evaluated counters.
- Dev-only `window.__PM_DIAGRAM_DEBUG__` (must be safely gated or removed before review if it causes noise).

Not allowed:
- Permanent console.log spam.
- DB/session debug writes.
- Secret exposure.

## Source Map

### Version Proof / Build Area
| Path | Role | Version Proof Relation | Lag Relation | Safe Change | Rollback | Risk |
|------|------|------------------------|--------------|-------------|----------|------|
| `frontend/package.json` | Build config | Vite scripts | None | Add `prebuild` script | Revert script | Low |
| `frontend/vite.config.js` (or `.ts`) | Vite config | Plugin hook for build info | None | Add build-info plugin | Delete plugin | Low |
| `frontend/src/generated/` (new dir) | Build artifacts | Build info module | None | Generated files | Delete dir | Low |
| `frontend/public/build-info.json` (new) | Static asset | curl-accessible proof | None | Generated file | Delete file | Low |
| `frontend/src/App.jsx` or root component | App shell | Expose `window.__PROCESSMAP_BUILD_INFO__` | None | Add 3-5 lines | Revert lines | Low |
| `deploy/docker-compose.yml` | Runtime config | Gateway volume mount | None | Add bind volume | Revert | Medium (runtime) |
| `frontend/Dockerfile.prod` | Image build | Optional: keep or remove COPY | None | Comment COPY | Uncomment | Low |

### Canvas / Lag Area
| Path | Role | Version Proof Relation | Lag Relation | Safe Change | Rollback | Risk |
|------|------|------------------------|--------------|-------------|----------|------|
| `frontend/src/components/process/BpmnStage.jsx` | Diagram component | None | Mount/render/importXML loop | Key/props stabilization, import dedupe | Revert to prior contour state | High (core) |
| `frontend/src/components/ProcessStage.jsx` | Tab container | None | Tab content remount, derived model churn | Memo boundaries, stable props | Revert extracted modules | High (core) |
| `frontend/src/features/process/hooks/useProcessTabs.js` | Tab state machine | None | Tab switch 2.2–3.5s delay, projection recompute | Cache stabilization, skip unnecessary work | Revert interview projection cache | Medium |
| `frontend/src/features/process/bpmn/stage/load/DiagramSkeleton.jsx` | Skeleton UI | None | Perceived reload if flapping | Ensure no show/hide cycles | Remove | Low |
| `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | Decor fanout | None | Deferred scheduling overhead | Already fixed in last contour | N/A | N/A |
| `frontend/src/features/process/bpmn/stage/derived/useDiagramDerivedModel.js` | Derived maps | None | Memo boundary for ProcessStage | Already extracted | N/A | N/A |
| `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` | Controls | None | Re-render on tab switch | Already memoized | N/A | N/A |
| `frontend/src/styles/legacy/legacy_bpmn.css` | Skeleton CSS | None | Visual feedback | Already present | N/A | N/A |

## Hypotheses

### H1. 5180 serves stale bundle
**Evidence**: Gateway container has files from May 15 19:09 but local dist is from 19:22. While hashes currently match, delivery method (`docker cp` inferred) is unreliable.
**Test**: Compare `build-info.json` SHA with `git rev-parse HEAD` after every build.

### H2. Browser cache serves stale bundle
**Evidence**: Assets have `immutable` cache headers. If index.html is somehow cached or service worker intercepts, old asset references could persist.
**Test**: Fresh browser context + cache-busted URL (`?cb=<timestamp>`).

### H3. Container/gateway not rebuilt/restarted after source changes
**Evidence**: Gateway container created May 14, files inside modified May 15. No `docker compose up --build` pattern.
**Test**: Check container ID before/after deploy. Check if `docker cp` is documented.

### H4. Skeleton/staged hydration caused repeated reload feeling
**Evidence**: Previous contour removed `useDiagramStagedHydration` and `useDeferredDecorFanout`. REVIEW_PASS confirmed no skeleton flapping.
**Status**: Likely FIXED in last contour. Verify again.

### H5. useProcessTabs regression causes tab shell delay/remount
**Evidence**: Tab switch latency ~2.2–3.5s documented in multiple reports. `useProcessTabs.js` shows 119 lines of changes.
**Test**: Profile tab switch with performance marks. Count ProcessStage/BpmnStage renders.

### H6. BpmnStage key/props instability causes remount
**Evidence**: `BpmnStage` receives `interviewDecorSignature`, `bpmnMetaKey`, `nodesKey` props. If these are unstable, React remounts.
**Test**: Mount count via `__PM_DIAGRAM_DEBUG__`.

### H7. importXML/modeler init repeats for same session/version
**Evidence**: Previous contour fixed this. But if `sessionId`/`reloadKey` changes unexpectedly, re-init occurs.
**Test**: Count `importXML` calls. Should be 1 per session open.

### H8. Actual bpmn-js init remains expensive but not looping
**Evidence**: Cold open ~3.7s consistently reported. This is bpmn-js `importXML` + viewer/modeler creation.
**Status**: True bottleneck, out of scope for THIS contour but must be documented.

### H9. auth/presence/version polling causes parent churn
**Evidence**: `versions?limit=1` polls every ~30s. `presence` POSTs. Could trigger ProcessStage re-renders.
**Test**: Network panel correlation with render counts.

### H10. User perception mostly from initial load and no feedback
**Evidence**: ~3.7s to canvas with no progress indicator beyond skeleton. Subjective lag may exceed objective metrics.
**Status**: Skeleton is present; may need improvement but not the primary issue.

## Bounded Fix / Rollback Strategy

### Phase 1: Runtime Version Proof (MANDATORY)
1. Implement build-info generation script.
2. Integrate into build flow.
3. Expose in UI and static JSON.
4. Document delivery loop.
5. Fix delivery loop (bind volume or rebuild pattern).
6. Verify `curl` and browser both show current SHA.

### Phase 2: Lag Fix (ONLY after Phase 1 passes)
1. Reproduce lag with PROVEN fresh runtime.
2. Use temporary counters to identify culprit.
3. Choose ONE of:
   - **A. useProcessTabs stabilization**: Further stabilize tab switch caching, reduce projection recompute.
   - **B. BpmnStage mount dedupe**: Ensure stable keys/props, prevent remount on tab return.
   - **C. importXML/init dedupe**: Same session + same XML should never re-import.
   - **D. Rollback of recent changes**: If evidence points to a recent contour change causing regression, revert that specific change.
4. No broad refactor.
5. If bpmn-js init is the true single bottleneck, document and propose next contour: `perf/diagram-bpmnjs-initialization-profile-and-viewer-split-v1`.

### Rollback Plan
- For version proof: delete `frontend/src/generated/`, revert `package.json` script, remove UI marker code.
- For lag fix: revert specific file to state before this contour's changes.
- For delivery loop: revert `docker-compose.yml` mount change.

## Acceptance Criteria

Agent 3 should pass only if ALL are true:

### Runtime Version Proof
1. 5180 build marker exists and is accessible.
2. Marker includes current source HEAD or build SHA/timestamp.
3. Agent 3 verifies marker in browser fresh context.
4. Served asset names/hash are recorded.
5. Container/build/restart evidence recorded.
6. Review fails if runtime is stale.

### Lag / Reload
7. No repeated page/canvas loading cycles after initial open.
8. Skeleton does not flap.
9. Canvas does not disappear/reappear repeatedly.
10. BpmnStage/modeler/importXML are not repeated unnecessarily for same session/version.
11. Tab switch improves materially or exact remaining bottleneck is documented with next contour.
12. Pan/zoom is usable in reviewed runtime.
13. Selection-lite works.
14. Property panel works.
15. No PUT `/bpmn`.
16. No PATCH `/sessions`.
17. No versions spam regression.
18. No backend/schema/storage changes.
19. No BPMN XML mutation.
20. No Product Actions/RAG/AG-UI changes.

### Strict Improvement
- "Same as before" is not enough.
- "Source says fixed but user sees old runtime" is fail.
- "Skeleton visible but canvas still worse" is fail.
- "Runtime version not proven" is fail.

## Non-goals

- No Product Actions changes.
- No registry/reестр changes.
- No AG-UI changes.
- No RAG changes.
- No stage/prod deploy.
- No PR/merge/push.
- No backend/schema/storage unless blocked and explicitly justified.
- No BPMN XML semantics changes.
- No WebGL/canvas replacement.
- No broad app refactor.
- No cosmetic-only skeleton win.
- No unrelated CSS tweaks.

## Agent 2 Execution Plan

1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json, and latest contour reports.
2. Record exact source/runtime truth (branch, HEAD, dirty files, container IDs, served assets).
3. Implement version proof:
   - Create `scripts/generate-build-info.js`.
   - Generate `frontend/src/generated/buildInfo.js`.
   - Generate `frontend/public/build-info.json`.
   - Integrate into build.
   - Add UI marker in app shell (test-only).
4. Fix delivery loop:
   - Choose bind volume or rebuild pattern.
   - Document exact commands.
   - Clean stale assets.
5. Build and verify:
   - `npm run build`.
   - Verify `build-info.json` in dist.
   - Deploy/restart as needed.
   - Verify `curl http://clearvestnic.ru:5180/build-info.json`.
6. Baseline lag with fresh runtime:
   - Use Playwright fresh context.
   - Run Scenarios B–F.
   - Record counters.
7. Implement bounded lag fix based on evidence.
8. Validate:
   - Build/tests.
   - Runtime with Playwright.
   - Version marker.
   - All scenarios.
9. Create reports:
   - EXEC_REPORT.md
   - RUNTIME_VERSION_PROOF.md
   - REGRESSION_ROOT_CAUSE.md
   - RUNTIME_BEFORE_AFTER.md
   - DELIVERY_LOOP_NOTES.md
   - IMPLEMENTATION_NOTES.md
   - READY_FOR_REVIEW

If blocked: create EXEC_BLOCKED.md, no READY_FOR_REVIEW.

## Agent 3 Review Plan

1. Read all reports and PLAN.md.
2. Verify source HEAD.
3. Verify build marker exists in source (generated file or build script).
4. Verify marker from 5180 via `curl`.
5. Open fresh browser context (Playwright).
6. Navigate to cache-busted 5180 URL.
7. Verify `window.__PROCESSMAP_BUILD_INFO__` or UI marker.
8. Open Diagram session.
9. Check no repeated load cycles.
10. Check tab switch.
11. Check pan/zoom.
12. Check selection/property panel.
13. Check network PUT/PATCH/versions.
14. Check console errors.
15. Verdict:
   - If runtime version proof missing or stale → REVIEW_BLOCKED or CHANGES_REQUESTED.
   - If no material lag/reload improvement → CHANGES_REQUESTED.
   - If pass → REVIEW_REPORT.md + REVIEW_PASS.

## Risks

1. **Dirty working tree**: 32 modified files from previous contours. Agent 2 must build from CURRENT tree. If unrelated changes break build, this is a pre-existing issue.
2. **Docker compose change risk**: Modifying gateway volume mounts could break 5180. Must test carefully.
3. **User perception gap**: Objective metrics may improve but subjective lag may persist due to bpmn-js init cost.
4. **Auth barrier**: Playwright auth token injection has failed in previous contours. May need manual auth or dev bypass.
5. **Build script dependency**: `generate-build-info.js` requires `git` CLI. Available in container but should be verified.

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — source/runtime truth captured
- [x] Gate 3 — current 5180 delivery loop mapped
- [x] Gate 4 — runtime version proof plan defined
- [x] Gate 5 — cache-busting/browser proof plan defined
- [x] Gate 6 — canvas lag/reload reproduction plan defined
- [x] Gate 7 — suspect files/contours listed
- [x] Gate 8 — rollback/rework strategy defined
- [x] Gate 9 — measurable improvement criteria defined
- [x] Gate 10 — Agent 2 executor prompt ready
- [x] Gate 11 — Agent 3 reviewer prompt ready
- [ ] Gate 12 — READY_FOR_EXECUTION marker created (will be created after file write)
