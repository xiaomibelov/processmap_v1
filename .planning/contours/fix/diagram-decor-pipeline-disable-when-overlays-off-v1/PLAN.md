# fix/diagram-decor-pipeline-disable-when-overlays-off-v1

## GSD Discipline

- **GSD availability check performed**: 2026-05-15T12:15:26+00:00
- **Commands executed**:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
  - `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 50+ skills found
- **GSD mode used**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- **PATH**: `/opt/processmap-test/bin` prepended; `gsd` and `gsd-sdk` available.
- **Implementation not performed**: confirmed.
- **Product files not modified**: confirmed.
- **Contour bounded**: confirmed; scope is frontend-only early guard for property overlay decor pipeline.
- **Agent 2 / Agent 3 gates prepared**: confirmed; EXECUTOR_PROMPT.md and REVIEWER_PROMPT.md created.

## Previous Evidence Source Truth

- **Previous contour**: `audit/diagram-baseline-no-overlays-canvas-profile-v1`
- **Verdict**: `REVIEW_PASS` (Agent 3 confirmed exact match on baseline DOM/SVG counts)
- **Key findings from audit**:
  - Baseline total DOM: 8,025; SVG nodes: 2,392; `.fpcPropertyOverlay`: 0.
  - Pan DOM delta: 0.
  - Selection DOM delta: +3,198 to +3,423 (dominant bottleneck, documented as next contour).
  - `runSettledPropertiesFanout` unconditionally calls `applyPropertiesOverlayDecor`.
  - `applyPropertiesOverlayDecor` exits early when overlays are off, but call path still executes (function call + ref reads + `clearPropertiesOverlayDecor`).
  - No PUT/PATCH mutations from pan, zoom, selection, hover, tab switch.
- **Previous passed contours**:
  - `perf/diagram-property-overlays-viewport-culling-v1`
  - `fix/bpmn-versions-head-check-dedupe-v1`
  - `fix/diagram-non-edit-put-bpmn-guard-v1`
  - `perf/diagram-eventbus-listener-and-raf-coalescing-v1`
- **Next likely contour after this**: `perf/diagram-svg-css-repaint-reduction-v1` (for `applySelectionFocusDecor`, `fpcFocusDim`, bpmn-js selection handles).

## Source / Runtime Truth

- **Server**: `clearvestnic.ru`
- **Working directory**: `/opt/processmap-test`
- **User**: `root`
- **Git branch**: `fix/lockfile-sync-test`
- **HEAD**: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- **origin/main**: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- **API health**: `{"ok":true,"status":"ok"}` (redis healthy)
- **Frontend**: HTTP 200 OK on `:5180`
- **Pre-existing modifications**: `frontend/src/components/process/BpmnStage.jsx`, `decorManager.js`, `useBpmnSettledDecorFanout.js`, `postStagingFanout.js`, and others from prior work on this branch.

## Problem Statement

When property overlays are disabled (`propertiesOverlayAlwaysEnabled === false` and no selected preview), the Properties fanout effect in `useBpmnSettledDecorFanout.js` still fires on every `view` change (tab switch) and every `readySignal` change (instance creation). This unconditionally calls `runSettledPropertiesFanout`, which calls `applyPropertiesOverlayDecor`, which then reads refs, sees no overlays to render, calls `clearPropertiesOverlayDecor`, and returns early.

This redundant path is cheap but not free, and it runs on every tab switch. The contour goal is to add an early guard that skips the entire Properties fanout when overlays are off and already cleared.

## Source Map

### Target 1 — `useBpmnSettledDecorFanout.js`
- **Path**: `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`
- **Function**: `useBpmnSettledDecorFanout` hook
- **Role**: Orchestrates 5 settled fanout effects (Notes, StepTime, RobotMeta, Properties, Selection).
- **Current issue**: Properties effect (lines 153–168) fires unconditionally based on deps `[propertiesOverlayAlwaysEnabled, propertiesOverlayAlwaysPreviewByElementId, selectedPropertiesOverlayPreview, readySignal, view]`.
- **Where guard should live**: Inside the Properties `useEffect`, before calling `runSettledPropertiesFanout`.
- **Forbidden changes**: Do not modify Notes, StepTime, RobotMeta, or Selection fanout effects.

### Target 2 — `postStagingFanout.js`
- **Path**: `frontend/src/features/process/bpmn/stage/fanout/postStagingFanout.js`
- **Function**: `runSettledPropertiesFanout`
- **Role**: Calls `applyPropertiesOverlayDecor` on active instance and `clearPropertiesOverlayDecor` on inactive instance.
- **Current issue**: No knowledge of overlay state; always invokes both callbacks.
- **Where guard could live**: Optionally add guard here, but changing signature requires test updates. Prefer guard in caller (Target 1) to keep changes minimal.
- **Forbidden changes**: Do not change `runSettledPropertiesFanout` signature unless absolutely necessary; existing tests in `postStagingFanout.test.mjs` must pass unchanged.

### Target 3 — `decorManager.js`
- **Path**: `frontend/src/features/process/bpmn/stage/decor/decorManager.js`
- **Function**: `applyPropertiesOverlayDecor`
- **Role**: Builds overlay layout model, calculates geometry, creates DOM, applies viewport culling.
- **Current issue**: Already has early exit (lines 1594–1635) when overlays off, but still invoked.
- **Where guard should live**: NOT here; we want to avoid calling this function entirely, not optimize inside it.
- **Forbidden changes**: Do not modify `applyPropertiesOverlayDecor` or `clearPropertiesOverlayDecor` logic.

### Target 4 — `BpmnStage.jsx`
- **Path**: `frontend/src/components/process/BpmnStage.jsx`
- **Function**: `BpmnStage` component (prop wiring)
- **Role**: Passes `propertiesOverlayAlwaysEnabled`, `selectedPropertiesOverlayPreview`, `propertiesOverlayAlwaysPreviewByElementId` into `useBpmnSettledDecorFanout`.
- **Current issue**: Props are already wired correctly; no code change needed here.
- **Forbidden changes**: Do not change prop wiring or add new props.

## Bounded Fix Strategy

### A. Guard as early as possible (chosen approach)

Add a lightweight ref-based guard in `useBpmnSettledDecorFanout.js` Properties effect:

1. Introduce `const propertiesOverlayDidClearRef = useRef(false);` at the top of the hook.
2. In the Properties effect:
   - Compute `const overlaysOff = !propertiesOverlayAlwaysEnabled && !selectedPropertiesOverlayPreview;`
   - If `overlaysOff && propertiesOverlayDidClearRef.current === true` → return early (skip fanout entirely).
   - Otherwise, run `runSettledPropertiesFanout` normally.
   - After running, if `overlaysOff` → set `propertiesOverlayDidClearRef.current = true`.
   - If `!overlaysOff` → set `propertiesOverlayDidClearRef.current = false`.

This ensures:
- When overlays are toggled OFF → fanout runs once to clear, then skips subsequent redundant fires.
- When overlays are toggled ON → ref resets, fanout runs normally.
- When `selectedPropertiesOverlayPreview` appears/disappears → ref resets appropriately.
- Tab switches while overlays are off → zero Properties fanout calls after the first clear.

### B. Preserve other decor

- Notes, StepTime, RobotMeta, and Selection fanout effects remain untouched.
- Only the Properties `useEffect` receives the guard.

### C. Keep overlays-on path unchanged

- When overlays are enabled, the exact same code path runs as before.
- Viewport-culling inside `decorManager.js` still works.
- Pan/zoom overlay updates still work (they are triggered by `applyPropertiesOverlayDecorForZoomChange`, a separate path).

### D. Keep selection focus decor out of scope

- Do not touch `applySelectionFocusDecor`, `fpcFocusDim`, or bpmn-js selection handles/draggers.
- Document these explicitly for the next contour.

### E. No network/mutation side effects

- The guard is a local ref; no API calls.
- No PUT /bpmn, no PATCH /sessions, no versions spam.

## Acceptance Criteria

1. **Overlays off path**:
   - `.fpcPropertyOverlay` remains 0.
   - `applyPropertiesOverlayDecor` is not called repeatedly when overlays are off and already cleared.
   - Source proof shows the guard skips the fanout on tab switch / instance recreation.

2. **Overlays on path**:
   - Property overlays still render.
   - Viewport-culling still works.
   - Pan/zoom updates overlays.
   - No duplicate overlays.

3. **Selection**:
   - No regression in selection behavior.
   - Selection DOM inflation may remain; documented as next contour.

4. **Network/mutation**:
   - No PUT /bpmn.
   - No PATCH /sessions.
   - No versions spam regression.

5. **Scope**:
   - Only `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` modified (plus test file).
   - No backend/package/BPMN/Product Actions/RAG/AG-UI changes.

6. **Build/tests**:
   - Existing tests pass (`postStagingFanout.test.mjs`, `useBpmnSettledDecorFanout.test.mjs`, `decorManager.test.mjs`).
   - New test added for guard behavior.

## Non-goals

- Do not fix selection DOM/SVG inflation here.
- Do not change `fpcFocusDim` behavior here.
- Do not change bpmn-js editor handles/draggers here.
- Do not change save/version/history logic.
- Do not change overlay viewport-culling inside `decorManager.js`.
- Do not remove overlays feature.
- Do not add new dependencies.
- Do not change backend.
- Do not mutate BPMN XML.
- Do not redesign Diagram UI.

## Agent 2 Execution Plan

1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json.
2. Baseline before code:
   - Confirm overlays-off path in source.
   - Verify `runSettledPropertiesFanout` is called unconditionally today.
3. Implement bounded guard in `useBpmnSettledDecorFanout.js` per Bounded Fix Strategy Section A.
4. Add test in `useBpmnSettledDecorFanout.test.mjs` covering:
   - Guard skips fanout when overlays are off and already cleared.
   - Guard runs fanout when overlays are toggled from ON to OFF (first time).
   - Guard resets and runs normally when overlays are toggled ON.
5. Validate:
   - `npm test` or `node --test` for affected test files passes.
   - Runtime overlays off: confirm `.fpcPropertyOverlay` = 0, no redundant calls.
   - Runtime overlays on: confirm overlays render, viewport culling works.
   - Pan/zoom overlays on: stable.
   - Tab switch: stable.
   - No network mutations.
6. Create:
   - `EXEC_REPORT.md`
   - `IMPLEMENTATION_NOTES.md`
   - `RUNTIME_BEFORE_AFTER.md`
   - `READY_FOR_REVIEW`

If blocked → `EXEC_BLOCKED.md`; no `READY_FOR_REVIEW`.

## Agent 3 Review Plan

1. Read PLAN.md, EXEC_REPORT.md, IMPLEMENTATION_NOTES.md, RUNTIME_BEFORE_AFTER.md, RUNTIME_PROOF_CHECKLIST.md.
2. Use Playwright/browser review.
3. Verify:
   - Overlays off path does not run expensive property overlay decor repeatedly.
   - Overlays on still works.
   - Viewport culling still works.
   - Pan/zoom stable.
   - Tab switch stable.
   - No duplicate overlays.
   - No PUT/PATCH.
   - No versions spam regression.
   - Only `useBpmnSettledDecorFanout.js` (+ test) changed.
4. If any issue remains → `CHANGES_REQUESTED` + `REWORK_REQUEST.md`; no `REVIEW_PASS`.
5. If pass → `REVIEW_REPORT.md` + `REVIEW_PASS`.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Guard prevents one-time clear when overlays toggle OFF | Low | Ref ensures first run still executes; only subsequent runs skipped. |
| Guard interferes with "show on select" (selected preview) | Low | Guard condition includes `!selectedPropertiesOverlayPreview`; preview presence forces normal path. |
| Test regressions in `postStagingFanout.test.mjs` | Very low | No changes to `postStagingFanout.js` signature. |
| Pan/zoom overlay update regression | Low | Pan/zoom uses `applyPropertiesOverlayDecorForZoomChange` (separate path in `wireBpmnStageRuntimeEvents.js`), not the settled fanout. |

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — Previous audit/review evidence read
- [x] Gate 3 — Source/runtime truth captured
- [x] Gate 4 — Decor-off source map captured
- [x] Gate 5 — Bounded guard strategy defined
- [x] Gate 6 — Non-goals locked
- [x] Gate 7 — Acceptance criteria defined
- [x] Gate 8 — Agent 2 executor prompt ready
- [x] Gate 9 — Agent 3 reviewer prompt ready
- [ ] Gate 10 — READY_FOR_EXECUTION marker created
