# perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1

**Planner**: Agent 1  
**Run ID**: `20260516T080003Z-79254`  
**Date**: 2026-05-16T08:00:13+00:00  
**Contour**: P0 frontend performance — BPMN Modeler drag hot path  
**Branch**: `fix/lockfile-sync-test` (working tree, not merged to main)  
**HEAD**: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`  
**Origin/main**: `d805e1c64c1107b9e3fe6854e031694bf741b187`

---

## GSD Discipline

- **GSD availability result**: ALL FOUND
  - `command -v gsd` → `/opt/processmap-test/bin/gsd` ✅
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk` ✅
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND` ✅
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND` ✅
  - GSD skills: 70+ skills found in `/root/.codex/skills/gsd-*`
- **Commands used**:
  - `gsd help` available
  - `gsd plan-phase` available for future phases
- **Mode**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- **Rules observed**:
  - Implementation not started.
  - Product files not changed.
  - Contour bounded to frontend drag performance + version ledger only.
  - Decomposition-first required.
  - Agent 2 / Agent 3 gates prepared.

---

## Source / Runtime Truth

| Check | Value |
|-------|-------|
| pwd | `/opt/processmap-test` |
| whoami | `root` |
| hostname | `clearvestnic.ru` |
| date | `2026-05-16T08:01:13+00:00` |
| git branch | `fix/lockfile-sync-test` |
| git HEAD | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| git diff --name-only | 34 frontend files + `.env` + `docker-compose.yml` (pre-existing dirty) |
| git diff --stat | 35 files, ~2,616 insertions, ~1,522 deletions |
| 8088 health | `{"ok":true,"status":"ok","redis":...}` ✅ |
| 5180 HEAD | HTTP 200 OK |
| Docker gateway | `processmap_test-gateway-1` up, `0.0.0.0:5180->80/tcp` |
| Docker api | `processmap_test-api-1` up, `0.0.0.0:8088->8000/tcp` |
| Docker postgres | `processmap_test-postgres-1` healthy |
| Docker redis | `processmap_test-redis-1` healthy |
| build-info.json SHA | `a9a9d9c` matches HEAD ✅ |
| build-info.json contourId | `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1` |
| build-info.json dirty | `true` |
| Served JS asset | `assets/index-BUNGB6M-.js` |
| Local dist assets | `index-BUNGB6M-.js`, `Modeler-Dky7-Tb8.js`, `NavigatedViewer-0ZQnPnvp.js`, etc. |
| Current version | `v1.0.127` in `frontend/src/config/appVersion.js` |
| Footer version | `Версия v1.0.127 · a9a9d9c · 15.05.2026, 23:38 · fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1` |

**Important**: `.env` / `.env.backup_*` were NOT read or output. No secrets printed.

---

## Previous Drag Result / Remaining Lag

**Previous contour**: `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`  
**Status**: REVIEW_PASS achieved, but drag lag NOT fully solved.

### What was fixed
- Stuck loading regression fixed (`hasHiddenParentStyles` opacity check removed).
- Modeler default restored (`forceEditorMode` default `true`).
- Version v1.0.127 visible in footer with update row.
- Version marker removed from canvas.
- Element drag works without explicit toggle.
- 0 PUT/PATCH during drag.
- Build passes.

### What remains
- **Quick canvas pan**: median ~1,100ms duration, ~14 long tasks, ~1,800ms total.
  - ~30% improvement vs previous baseline (20 long tasks / ~2,848ms), but still heavy.
- **Stepped canvas pan**: ~88 long tasks, ~11,600ms total.
  - Possibly Playwright stress artifact, but signals pointermove pipeline is still costly.
- **Element drag**: works but Playwright synthetic events inconsistent; real mouse feel unknown.

### Position
- Previous contour improved but did **not** solve drag lag.
- Current contour is **not allowed** to claim "solved" if drag still feels slow.
- Quick drag improvement is not enough by itself.
- Stepped drag may be stressy, but it is useful for detecting pointermove hot-path cost.
- Next fix must target **real drag/pointermove hot path**.

---

## Reviewer/Test GSD Discipline

Agent 3 is **mandated** to:

1. Run GSD availability checks before review.
2. Document GSD mode in REVIEW_REPORT.md.
3. Test **exact real drag scenarios** — not only click/programmatic zoom.
4. Capture before/after comparison.
5. **REVIEW_PASS is FORBIDDEN** if:
   - real mouse canvas drag not tested;
   - real mouse element drag not tested;
   - 5180 fresh browser not used;
   - visible version/update row not verified;
   - before/after missing;
   - material lag observed but pass written anyway;
   - only programmatic button zoom / click / DOM count tested.

See full discipline in `REVIEWER_PROMPT.md` → "Reviewer GSD Discipline — Mandatory".

---

## Version / Update Ledger Plan

Agent 2 must:

1. Preserve v1.0.127 visibility.
2. Increment to **v1.0.128** (canonical next).
3. Add new changelog entry at index 0:
   - Version: `v1.0.128`
   - SHA: current short SHA at build time
   - Date/time
   - Contour: `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`
   - Summary lines (Russian, 3-4 short bullets):
     - Drag hot path optimized
     - Pointermove side effects suppressed/coalesced
     - No autosave during drag
     - Reviewer GSD runtime drag gates preserved
4. Update `scripts/generate-build-info.mjs` fallback `contourId`.
5. Build, restart gateway, verify served asset hash changed.
6. Visible update row must be in footer/status bar, **not on canvas**.
7. Must not intercept canvas pointer events.
8. Keep `build-info.json` and `window.__PROCESSMAP_BUILD_INFO__`.

Agent 3 must fail if:
- version still only shows v1.0.127;
- no v1.0.128 update block;
- marker overlays canvas;
- build-info exists but visible update row missing.

---

## Real Drag Reproduction Plan

Use **large no-overlays Diagram** (`wewe / Описание процессов Долгопрудный`).

### Scenario A — fresh version/update proof
1. Fresh browser context.
2. Open `http://clearvestnic.ru:5180/?cb=<timestamp>`.
3. Verify:
   - before fix: v1.0.127;
   - after fix: v1.0.128;
   - build-info SHA;
   - marker not on canvas.

### Scenario B — real canvas drag / quick natural
1. Open large Diagram.
2. Ensure overlays off: `document.querySelectorAll('.fpcPropertyOverlay').length === 0`.
3. Real mouse: move to empty canvas → `mouse.down()` → quick `mouse.move` → `mouse.up()`.
4. ≥3 attempts.
5. Record median: duration, long task count, max long task duration, viewport transform changed, DOM/SVG delta, network, console.

### Scenario C — real canvas drag / stepped stress
1. Same setup.
2. `mouse.down` → `mouse.move` with steps → `mouse.up`.
3. ≥3 attempts if feasible.
4. Record median.
5. Treat as stress signal, not sole pass/fail, but cannot ignore if catastrophic.

### Scenario D — real element drag
1. Modeler default / edit-capable Diagram.
2. Pick BPMN task or event.
3. `mouse.down` on element center.
4. `mouse.move` with controlled steps.
5. `mouse.up`.
6. Verify: element moved locally, no auto PUT/PATCH, no console errors, no massive long-task burst.
7. If drag mutates local canvas, use disposable session or avoid save.

### Scenario E — during-drag side effects
During B/C/D inspect whether these fire repeatedly:
- `selection.changed`
- `element.click` / `element.hover`
- `syncAiQuestionPanelWithSelection`
- property panel updates
- `useBpmnSettledDecorFanout` effects
- derived model rebuild
- `commandStack.changed` (after current guard)
- autosave staging
- bpmn version checks
- session PATCH/PUT
- React setState/render storm

---

## Hot Path Target Behavior

### When drag starts
- `dragInProgress` ref/state set in bounded interaction controller.
- Suspend non-critical UI sync.
- Suppress hover/selection/decor/AI sync if not needed.
- Avoid React state updates per pointermove.
- Avoid property panel updates per pointermove.
- Avoid autosave queue during continuous drag.
- Do not trigger durable mutation.

### During pointermove
- bpmn-js updates viewport/shape position (engine work, unavoidable).
- App must NOT rebuild panels/maps/decor.
- Any visual auxiliary updates must be RAF-coalesced.

### On drag end
- Run one bounded sync:
  - selected element state if needed;
  - property panel update if needed;
  - decor refresh if needed;
  - local dirty state if edit happened.
- Still no durable save until explicit Save.

---

## Source Map Targets

### Target 1 — wireBpmnStageRuntimeEvents.js
- **Path**: `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
- **Functions**: `bindViewerStageEvents`, `bindModelerStageEvents`, `bindContextMenuRuntimeEvents`
- **Relation to drag**: eventBus wiring for `selection.changed`, `canvas.viewbox.changed`, `commandStack.changed`, `drag.start`, `drag.cleanup`
- **During pointermove?**: Yes — `selection.changed` and `viewbox.changed` already guarded by `isDragInProgress`. `commandStack.changed` in modeler already guarded.
- **Causes React state/render?**: Yes, via `syncAiQuestionPanelWithSelection`, `emitElementSelection`, `setSelectedDecor`, `runImmediateEditorFanout`.
- **Safe change area**: Extend guards, add RAF coalescing for any remaining drag-end updates.
- **Risk**: Low — guards already exist; need to strengthen and ensure no gaps.

### Target 2 — diagramDragSideEffectGuard.js
- **Path**: `frontend/src/features/process/bpmn/stage/interaction/diagramDragSideEffectGuard.js`
- **Functions**: `createDragSideEffectGuardRef`, `isDragInProgress`, `shouldSuppressSideEffectsDuringDrag`
- **Relation to drag**: Central drag state ref.
- **During pointermove?**: Checked by wire events.
- **Causes React state/render?**: No — pure ref read.
- **Safe change area**: Extend with `isAnyBpmnDragActive` or `isCanvasPanning` if needed.
- **Risk**: Very low.

### Target 3 — diagramPointerMoveCoalescer.js
- **Path**: `frontend/src/features/process/bpmn/stage/interaction/diagramPointerMoveCoalescer.js`
- **Functions**: `scheduleRafForInstance`, `cancelRafForInstance`
- **Relation to drag**: RAF batching for UI updates.
- **During pointermove?**: Called from `onViewboxChanged`.
- **Causes React state/render?**: Batches decor overlay updates.
- **Safe change area**: Ensure it is also used for any drag-end sync that must not fire immediately.
- **Risk**: Low.

### Target 4 — useBpmnSettledDecorFanout.js
- **Path**: `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`
- **Functions**: default export hook with 5 `useEffect` blocks
- **Relation to drag**: Runs `runSettledUserNotesFanout`, `runSettledStepTimeFanout`, `runSettledRobotMetaFanout`, `runSettledPropertiesFanout`, `runSettledSelectionFanout`.
- **During pointermove?**: Indirectly — effects fire when dependencies change. If drag causes dependency changes, fanout runs.
- **Causes React state/render?**: Yes — each fanout calls decor apply functions which mutate SVG overlays.
- **Safe change area**: Add drag-in-progress guard inside each fanout or at the hook level.
- **Risk**: Medium — must not break post-drag decor correctness.

### Target 5 — BpmnStage.jsx selection/AI sync
- **Path**: `frontend/src/components/process/BpmnStage.jsx`
- **Functions**: `syncAiQuestionPanelWithSelection`, `setSelectedDecor`, `emitElementSelection`
- **Relation to drag**: Called from `selection.changed` handlers.
- **During pointermove?**: Currently guarded by `isDragInProgress` in wire file.
- **Causes React state/render?**: Yes — `syncAiQuestionPanelWithSelection` updates AI question panel props; `emitElementSelection` bubbles to ProcessStage.
- **Safe change area**: Ensure guards are comprehensive; no bypass paths.
- **Risk**: Low.

### Target 6 — useDiagramMutationLifecycle.js
- **Path**: `frontend/src/features/process/hooks/useDiagramMutationLifecycle.js`
- **Functions**: `queueDiagramMutation`, `commitDiagramAutosave`
- **Relation to drag**: `commandStack.changed` → `emitDiagramMutation` → `queueDiagramMutation` → autosave scheduling.
- **During pointermove?**: `commandStack.changed` fires during element drag (modeler). Currently guarded in wire file for `runImmediateEditorFanout`, but `emitDiagramMutation` may still fire via `bpmnWiring.js`.
- **Causes React state/render?**: Yes — autosave queue state updates.
- **Safe change area**: Suppress mutation staging during drag; coalesce to one post-drag mutation if needed.
- **Risk**: Medium — must not lose legitimate edit mutations.

### Target 7 — bpmnWiring.js commandStack.changed
- **Path**: `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js`
- **Functions**: `commandStack.changed` handler inside wiring
- **Relation to drag**: Emits `diagram.change` mutation to coordinator.
- **During pointermove?**: Yes — fires on every commandStack change during element drag.
- **Causes React state/render?**: Yes — triggers coordinator autosave scheduling.
- **Safe change area**: Add drag guard or coalesce multiple `commandStack.changed` during drag into one post-drag mutation.
- **Risk**: Medium — must preserve undo/redo and dirty state.

### Target 8 — AppShell / footer version
- **Path**: `frontend/src/components/AppShell.jsx`, `frontend/src/config/appVersion.js`
- **Functions**: version footer rendering
- **Relation to drag**: None — version update only.
- **Safe change area**: Bump version, add changelog entry.
- **Risk**: Very low.

---

## Hypotheses

### H1. Drag still lags because pointermove triggers non-critical app handlers
- **Evidence needed**: handlers fire repeatedly during drag.
- **Test**: console/network trace during Scenario B/C.

### H2. `syncAiQuestionPanelWithSelection` or selection sync runs during drag
- **Evidence needed**: state updates/panel sync during pointermove.
- **Test**: React DevTools profiler or manual trace.

### H3. Decor/fanout/overlay logic runs during drag
- **Evidence needed**: fanout scheduled during `canvas.viewbox.changed` or drag events.
- **Test**: instrument `useBpmnSettledDecorFanout` or `postStagingFanout.js`.

### H4. Derived model/property panel rebuild occurs during drag
- **Evidence needed**: render/recompute counters in ProcessStage/NotesPanel.
- **Test**: count `useMemo`/`useEffect` executions during drag.

### H5. CommandStack/autosave staging observes drag events too eagerly
- **Evidence needed**: mutation staging entries during move/drag.
- **Test**: log `createLocalMutationStaging.stageRuntimeChange` calls.

### H6. bpmn-js Modeler itself dominates drag cost
- **Evidence needed**: app handlers suppressed but long tasks remain high.
- **Test**: Scenario B/C after all app guards applied.

### H7. Large SVG scene is near limit for current engine
- **Evidence needed**: no app side effects, but pan/drag still long-task heavy.
- **Test**: compare quick drag on large vs small diagram.

### H8. Version/update ledger not integrated with product versioning
- **Evidence needed**: UI version not incremented or row missing.
- **Test**: visual inspection of footer.

---

## Decomposition-First Plan

If BpmnStage/ProcessStage touched:

1. **Extract bounded module** (if not already extracted):
   - `diagramDragInteractionGuard.js` or `useDiagramDragInteractionGuard.js`
   - Centralizes `isDragInProgress`, `isCanvasPanning`, `isElementDragging`.
2. **Keep BpmnStage from growing**:
   - Any new drag logic goes into `frontend/src/features/process/bpmn/stage/interaction/`.
   - No inline drag state in BpmnStage.jsx.
3. **Coalescer already extracted**:
   - `diagramPointerMoveCoalescer.js` — reuse/extend if needed.
4. **Side-effect guard already extracted**:
   - `diagramDragSideEffectGuard.js` — reuse/extend if needed.

---

## Bounded Fix Strategy

Agent 2 must choose based on source map/evidence.

### Option A — Strengthen drag interaction guard
- Add `isCanvasPanningRef` / `isElementDraggingRef` / `isAnyBpmnDragActiveRef`.
- Expose to all event handlers to skip non-critical work.

### Option B — Suppress selection/AI/property sync during drag
- In handlers: skip `syncAiQuestionPanelWithSelection` while dragging.
- Skip selected element React state churn during pointermove.
- Update only on mouseup/drag end.

### Option C — Pause decor fanout during drag
- No property overlays/decor layout recalculation while dragging.
- Schedule one refresh after drag end.
- Preserve existing overlay culling and decor-off guard.

### Option D — CommandStack/autosave staging guard
- Drag/move can change local bpmn-js command stack.
- Do not autosave continuously.
- No PUT/PATCH during drag.
- Optional local dirty marker after drag, explicit Save required.

### Option E — requestAnimationFrame coalescing
- If any drag-time UI update is necessary, coalesce to RAF.
- Avoid multiple updates per pointermove.

### Option F — Decompose pointer/drag controller
- If logic currently lives in BpmnStage/wireBpmnStageRuntimeEvents:
  - extract bounded module: `diagramDragInteractionGuard.js` / `useDiagramDragInteractionGuard.js`.
- Keep BpmnStage from growing.

### Option G — Engine limitation documentation
- If after suppressing side effects bpmn-js Modeler still has too many long tasks:
  - document precise remaining cost.
  - recommend next `prototype/diagram-alternative-viewer-large-flow-spike-v1`.
  - do not fake pass if material lag remains.

---

## Acceptance Criteria

Agent 3 should pass only if **ALL** are true:

### Reviewer/Test GSD
1. Reviewer GSD discipline documented in REVIEW_REPORT.
2. Reviewer ran GSD availability/use/fallback.
3. Reviewer tested exact real drag scenarios.

### Version/update
4. Visible update row/block shows new version, preferably v1.0.128.
5. It includes SHA + timestamp + contour id + summary.
6. Marker is not on canvas.
7. build-info.json works.
8. window.__PROCESSMAP_BUILD_INFO__ works.
9. Fresh 5180 proof captured.

### Real drag
10. Large no-overlays Diagram tested.
11. `.fpcPropertyOverlay = 0` confirmed.
12. Real mouse canvas drag quick/natural tested.
13. Real mouse canvas drag stepped/stress tested.
14. Real element drag tested.
15. Before/after evidence exists.
16. At least 3 attempts or median if metrics noisy.
17. Material improvement achieved.

**Suggested target**:
- quick drag median long tasks: lower than previous ~14, target ≤8 if feasible;
- quick drag total duration: lower than previous ~1,800ms, target near or below ~1,000ms if feasible;
- no multi-second stall for natural drag;
- element drag usable without obvious stutter.

If exact numeric target cannot be met:
- Agent 2 must prove app-side side effects are eliminated;
- remaining cost must be attributed to bpmn-js/engine with evidence;
- Agent 3 should not pass as "lag solved"; it may pass only as "app-side hot path cleaned" if user-visible drag is materially better.
- If still unacceptable, CHANGES_REQUESTED or recommend engine prototype.

### Runtime safety
18. No stuck loading.
19. No repeated canvas reload cycles.
20. No PUT /bpmn during view drag.
21. No PATCH /sessions during view drag.
22. No auto durable save during element drag.
23. No versions spam regression.
24. No console errors.

### Architecture
25. Decomposition-first if BpmnStage/ProcessStage touched.
26. No god-file bloat.
27. Drag guard / interaction controller bounded.

### Safety
28. No backend/schema/storage changes.
29. No BPMN XML mutation from view interactions.
30. No Product Actions/RAG/AG-UI changes.
31. Build/tests pass.

### Strict
32. REVIEW_PASS forbidden if user-visible drag lag remains materially present.
33. REVIEW_PASS forbidden if only quick-drag was tested.
34. REVIEW_PASS forbidden without Reviewer GSD section.
35. REVIEW_PASS forbidden without version/update row proof.

---

## Non-goals

- No Product Actions implementation.
- No registry/reестр changes.
- No AG-UI implementation.
- No RAG implementation.
- No stage/prod deploy.
- No PR/merge/push.
- No backend/schema/storage unless blocked and explicitly justified.
- No BPMN XML semantics change.
- No full engine migration.
- No library install.
- No cosmetic-only fix.
- No review based only on source.

---

## Agent 2 Execution Plan

See `EXECUTOR_PROMPT.md` for full details.

Summary:
1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json, previous contour reports.
2. Capture source/runtime truth.
3. Implement version/update ledger v1.0.128.
4. Baseline real drag (scenarios B-D).
5. Source forensic: eventBus drag/pointer events, selection/AI/property sync, decor/fanout, derived model, mutation/autosave staging, React state changes during drag.
6. Decomposition/fix: strengthen drag guard, suppress/coalesce non-critical drag-time side effects, prevent autosave/durable mutation during drag, one bounded sync after drag end.
7. Validate: build/tests, fresh 5180 browser, version/update row, real drag before/after, selection/panel, network safety.
8. Create all required reports.

---

## Agent 3 Review Plan

See `REVIEWER_PROMPT.md` for full details.

Summary:
1. Run Reviewer GSD Discipline first.
2. Read all planning and execution artifacts.
3. Source/runtime version review.
4. Playwright real interaction review: fresh cache-busted 5180, large Diagram, overlays off, real mouse canvas drag quick/natural, real mouse canvas drag stepped/stress, real element drag, multiple attempts, inspect long tasks/timings, check DOM/SVG deltas, check no PUT/PATCH, check no console errors.
5. Strict verdict: CHANGES_REQUESTED if any criteria missing; REVIEW_PASS only if all satisfied.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| bpmn-js SVG engine dominates despite app guards | Medium | High | Document with evidence; recommend engine prototype contour |
| Playwright synthetic drag inconsistent | High | Low | Agent 3 uses real mouse; stepped drag is stress signal only |
| Autosave suppression loses legitimate edits | Low | High | Only suppress during continuous drag; one post-drag sync |
| Decor fanout suppression breaks visual state | Low | Medium | One post-drag refresh; preserve existing guards |
| Version bump test failures | Low | Low | Update test assertions to v1.0.128 |

---

## Gates

- [x] Gate 1 — Agent 1 GSD discipline completed
- [x] Gate 2 — source/runtime truth captured
- [x] Gate 3 — previous drag-lag partial improvement documented
- [x] Gate 4 — current v1.0.127 / version ledger truth captured
- [x] Gate 5 — real drag baseline plan defined
- [x] Gate 6 — pointermove hot path source map targets defined
- [x] Gate 7 — drag-time side effects hypotheses defined
- [x] Gate 8 — decomposition-first plan defined
- [x] Gate 9 — material improvement criteria defined
- [x] Gate 10 — Agent 2 executor prompt ready
- [x] Gate 11 — Agent 3 reviewer prompt with GSD ready
- [x] Gate 12 — READY_FOR_EXECUTION marker created
