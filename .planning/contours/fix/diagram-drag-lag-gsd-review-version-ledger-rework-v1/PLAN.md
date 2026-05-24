# fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1

## GSD Discipline

- GSD availability result: **GSD_PROCESSMAP_WRAPPER_PLANNING**
- Commands checked:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd` ✅
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk` ✅
  - `/opt/processmap-test/bin/gsd` exists and is executable ✅
  - `/root/.codex/get-shit-done/bin/gsd-tools.cjs` exists ✅
  - GSD skills directory has 50+ gsd-* skills ✅
- Mode: `GSD_PROCESSMAP_WRAPPER_PLANNING` — using ProcessMap-local `/opt/processmap-test/bin/gsd` wrapper.
- Implementation не выполнялся.
- Product files не менялись.
- Contour bounded.
- Decomposition-first обязательна.
- Agent 2 / Agent 3 gates prepared below.

## Source / Runtime Truth

| Check | Value |
|-------|-------|
| pwd | `/opt/processmap-test` |
| whoami | `root` |
| hostname | `clearvestnic.ru` |
| date | `2026-05-15T23:18:55+00:00` |
| branch | `fix/lockfile-sync-test` |
| HEAD | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| dirty files | 34 frontend files + `.env` + `docker-compose.yml` (pre-existing from prior contours) |
| 8088 health | `{"ok":true,"status":"ok",...}` ✅ |
| 5180 response | HTTP/1.1 200 OK ✅ |
| docker gateway | `processmap_test-gateway-1` up, port 5180→80 ✅ |
| 5180 build-info SHA | `a9a9d9c` matches HEAD ✅ |
| 5180 build-info contourId | `fix/diagram-real-drag-performance-and-engine-decomposition-v1` (stale from previous build) |
| served JS asset | `assets/index-YoZu_dwp.js` |
| local dist assets | `index-YoZu_dwp.js`, `index-N6LiXuk7.css`, `Modeler-DGyAue4W.js`, `NavigatedViewer-DYUNMFQb.js`, `build-info.json` |

**Observation**: The current 5180 runtime was built during the previous contour (`diagram-real-drag-performance-and-engine-decomposition-v1`). A fresh rebuild is required so the new contour ID and version appear in `build-info.json` and UI.

## User Rejection of Previous REVIEW_PASS

Previous contour: `fix/diagram-real-drag-performance-and-engine-decomposition-v1`
- Received `REVIEW_PASS` from Agent 3 at `2026-05-15T23:12Z`
- **User explicitly rejects this REVIEW_PASS.**

### Why the previous pass is invalid

1. **Real drag still lags**: User reports canvas drag and element drag still lag during actual use.
2. **Stepped drag was terrible**: Agent 3's own stepped-drag test showed `duration: ~12,827ms`, `long tasks: 87`, `long task total: ~12,291ms`. This is worse than the baseline. Agent 3 dismissed this as a "Playwright measurement artifact" and still issued REVIEW_PASS.
3. **Quick-drag cherry-picking**: Agent 3 accepted quick-drag (no steps) as sufficient evidence. User requires natural drag to be smooth, not just quick flicks.
4. **Element drag blocked = pass?** Agent 3 wrote: "Element did not move — transform unchanged — This is expected NavigatedViewer behavior (view mode prevents element drag) ✅". User explicitly rejects this: read-only default is NOT acceptable if user expects to edit/move elements.
5. **No version increment**: Version remained `v1.0.126`. No new update row was added. User expects semantic visible version to increment with each bounded update.
6. **No Reviewer GSD discipline**: Agent 3 did not document GSD availability, did not run source/runtime truth checks, did not rigorously test the actual user scenario.

### New standard established by user

- `REVIEW_PASS` is **FORBIDDEN** if the real user scenario still materially fails.
- `REVIEW_PASS` is **FORBIDDEN** based on "source looks good" or programmatic-only tests.
- `REVIEW_PASS` is **FORBIDDEN** if Agent 3 has not tested the exact real user scenario.
- Agent 3 must apply GSD discipline and document it.

## Reviewer/Test GSD Discipline Plan

### A. Update reviewer prompt/templates/tooling

Target files to update or create:
1. `.planning/templates/agent3-ui-runtime-review-template.md` — add "Reviewer GSD Discipline" section.
2. `.planning/templates/agent3-ui-runtime-proof-checklist.md` — add GSD check items.
3. `tools/pm-agent3-reviewer-watch.sh` — inject GSD discipline preamble into generated reviewer prompt.
4. Current contour `REVIEWER_PROMPT.md` — mandatory "Reviewer GSD Discipline" section.

### B. Required Reviewer GSD checks

Agent 3 MUST, before any verdict:
1. Run GSD availability check:
   ```bash
   cd /opt/processmap-test
   command -v gsd || true
   command -v gsd-sdk || true
   test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
   test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
   ```
2. Record source/runtime truth:
   - `git status -sb`, `git branch --show-current`, `git rev-parse HEAD`
   - `curl -s http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)`
   - Served JS asset names
3. Test exact user scenario:
   - Real mouse canvas pan with `mouse.down` → `mouse.move` with steps → `mouse.up`
   - Real element drag (in edit mode, not just "prevented in view mode")
   - Large diagram, overlays off
4. Record before/after evidence with numbers.
5. Document why the verdict is justified.

### C. REVIEW_PASS forbidden conditions

Agent 3 MUST NOT issue REVIEW_PASS if:
- GSD discipline section is missing from REVIEW_REPORT.md.
- Real drag was not tested with actual mouse events.
- 5180 runtime was not verified fresh.
- Visible version/update row is missing or stale.
- Element drag is impossible without clear edit path.
- Lag remains materially present and is dismissed as "acceptable" without explicit user-facing threshold.

## Version / Update Ledger Plan

### Current state
- `frontend/src/config/appVersion.js`: `currentVersion: "v1.0.126"`
- `AppShell.jsx` footer shows: `Версия v1.0.126 · shaShort · date`
- Build-info generator (`scripts/generate-build-info.mjs`) hardcodes fallback contourId.

### Required changes

1. **Increment visible version**:
   - `v1.0.126` → `v1.0.127`
   - Update `frontend/src/config/appVersion.js`:
     - `currentVersion: "v1.0.127"`
     - Add new changelog entry at the TOP (newest first):
       ```js
       {
         version: "v1.0.127",
         changes: [
           "Добавлена Reviewer GSD-дисциплина: review обязан проверять реальный drag и runtime truth.",
           "Исправлена версионность: обновления теперь добавляют новую строку в журнал изменений.",
           "Переработана производительность drag диаграммы: убраны side-effects во время pointermove.",
           "Убран read-only по умолчанию: редактирование диаграммы стало доступно без дополнительного переключателя.",
         ],
       }
       ```

2. **Update build-info generator**:
   - In `scripts/generate-build-info.mjs`, change the hardcoded fallback `contourId` to:
     `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`
   - Or better: read from `process.env.PROCESSMAP_CONTOUR_ID` and only fallback to the new contour ID.

3. **Ensure version info is visible and NOT on canvas**:
   - `AppShell.jsx` footer already shows version. Ensure it displays the NEW version after rebuild.
   - No canvas overlay badge (already removed in previous contour, but verify).
   - Version must NOT intercept pointer events.

4. **Keep build-info mechanisms**:
   - `/build-info.json` must continue to work.
   - `window.__PROCESSMAP_BUILD_INFO__` must continue to work.
   - Served assets must be verified after rebuild.

### Verification
- Fresh 5180 browser shows `v1.0.127` in footer.
- `/build-info.json` shows updated timestamp and contourId.
- `window.__PROCESSMAP_BUILD_INFO__` matches.
- No version badge on canvas.

## Read-only / Edit Mode Plan

### Current state
- Default Diagram mode is **NavigatedViewer** (view-only).
- `forceEditorMode` state exists but defaults to `false`.
- Previous Agent 3 accepted "Element drag prevented in view mode" as a PASS criterion.
- User explicitly rejects this.

### Required decision

**Preferred**: Remove read-only as default. Make normal editable `Modeler` the default mode for Diagram tab, OR make edit mode the default and provide an explicit "View" toggle if needed.

**If Modeler default is too heavy for large diagrams**:
- Keep NavigatedViewer as initial render for speed.
- BUT: the moment the user interacts (clicks canvas, attempts drag), auto-promote to Modeler or provide a clearly visible "Редактировать BPMN" button that is ONE click away.
- The current "Редактировать BPMN" button requires ~15s Modeler init. This is NOT acceptable as the only edit path.

### Agent 2 must source-map
- Where `NavigatedViewer` is instantiated vs `Modeler`.
- Where `forceEditorMode` is set/cleared.
- How `readOnly` flag is passed to bpmn-js.
- How user enters edit mode today.

### Safe change options

**Option A — Modeler as default** (preferred if performance acceptable):
- Change default to Modeler.
- Remove `readOnly: true` from default config.
- Element drag becomes possible immediately.
- Risk: Modeler init on large diagrams is ~15s. May cause initial load regression.

**Option B — Lazy Modeler promotion on first interaction**:
- Start with NavigatedViewer for fast initial render.
- On first `pointerdown` on a BPMN shape, trigger `enterDiagramEditMode`.
- Show a brief "Switching to edit mode…" indicator.
- Once Modeler is ready, element drag works.
- Risk: First interaction still has latency.

**Option C — Keep viewer default but make edit toggle obvious and instant**:
- Keep NavigatedViewer default.
- Make "Редактировать BPMN" button MUCH more prominent (e.g., floating action button, not hidden in overflow menu).
- Ensure button is visible without scrolling.
- Once clicked, enter edit mode.
- Agent 3 must test element drag AFTER clicking the button.
- **This is the fallback if A or B causes load regression.**

### Hard requirements
- Element drag must be possible in the normal intended workflow.
- If default remains view-only, the edit path must be obvious and tested.
- "Element drag prevented because read-only" is NOT a pass.
- Element drag must not trigger auto-save (PUT `/bpmn`). Local canvas state may change, but durable mutation requires explicit save.

## Real Drag Reproduction Plan

### Baseline (before fix)

1. Fresh browser context on `http://clearvestnic.ru:5180/?cb=<timestamp>`.
2. Navigate to large Diagram session (`wewe / Описание процессов Долгопрудный`).
3. Ensure overlays off: `document.querySelectorAll('.fpcPropertyOverlay').length === 0`.
4. **Canvas pan baseline**:
   - `mouse.move(x, y)` on empty canvas.
   - `mouse.down()`.
   - `mouse.move(x+150, y+0, { steps: 10 })`.
   - `mouse.move(x+300, y+80, { steps: 10 })`.
   - `mouse.up()`.
   - Also test quick natural drag without excessive steps.
   - Record: duration, long tasks, pointermove count, transform change, subjective lag.
5. **Element drag baseline**:
   - Confirm default is editable OR explicit edit mode.
   - Pick BPMN task.
   - `mouse.down` on shape center.
   - `mouse.move` with steps.
   - `mouse.up`.
   - Verify element moved, no auto PUT/PATCH, no console errors.
6. **Side-effect audit during drag**:
   - React state updates per pointermove?
   - `selection.changed` events per pointermove?
   - `canvas.viewbox.changed` events per pointermove?
   - Decor fanout runs?
   - Property panel updates?
   - `commandStack.changed` fires?
   - Autosave queue receives entries?
   - Parent shell re-renders?

### After fix
Repeat all baseline scenarios and compare.

### Thresholds
- Reduce long task count by at least 50% vs baseline for the SAME scenario.
- Reduce total drag duration materially.
- No drag interaction above multi-second stall.
- Element drag must be usable.
- If metrics are noisy, run 3 attempts and report median. Do NOT cherry-pick quick drag only.

## Pointer / Drag Source Map Targets

### Source map results

| File | Role | Relation to contour |
|------|------|---------------------|
| `frontend/src/components/process/BpmnStage.jsx` | God file (~5850 lines) — lifecycle owner for viewer/modeler | Viewer/Modeler default mode; version badge already removed; may need edit mode change |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | Event bus wiring for viewer/modeler | `drag.start`/`drag.cleanup` flags; `selection.changed` and `canvas.viewbox.changed` handlers; `isDragInProgress` guard already added but may need strengthening |
| `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | Decor/derived fanout orchestration | May fire during selection/viewbox changes; needs drag suppression |
| `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsMode.js` | Edit/view mode boundary | `isDiagramEditMode`, `enterDiagramEditMode` — key for read-only default removal |
| `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsSelection.js` | Analytics selection on viewer | Selection-lite behavior; must not block element drag in edit mode |
| `frontend/src/features/process/bpmn/stage/interaction/elementSelectionEmitter.js` | Selection event emitter | Emits to parent components; may cause React re-render during drag |
| `frontend/src/features/process/hooks/useProcessTabs.js` | Tab state management | Parent shell churn; `flushFromActiveTab` causes PUT on tab switch |
| `frontend/src/components/AppShell.jsx` | App shell with footer version | Footer `footerHint` line; extend with contour id; version display |
| `frontend/src/config/appVersion.js` | Canonical version source | `currentVersion: "v1.0.126"` → must become `"v1.0.127"`; changelog array |
| `scripts/generate-build-info.mjs` | Build info generator | Hardcoded fallback contourId; must update to current contour |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | Decor manager | Overlay/decor application; may run during drag |
| `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js` | Selection focus decorations | May update during drag |
| `frontend/src/features/process/hooks/useDiagramMutationLifecycle.js` | Mutation/autosave lifecycle | Guards PUT/PATCH; must ensure drag does not trigger autosave |
| `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js` | BPMN coordinator | Orchestrates save/sync; drag must not trigger it |
| `tools/pm-agent3-reviewer-watch.sh` | Reviewer watcher script | Must inject GSD discipline into generated prompt |
| `.planning/templates/agent3-ui-runtime-review-template.md` | Reviewer template | Must add GSD discipline section |
| `.planning/templates/agent3-ui-runtime-proof-checklist.md` | Reviewer checklist | Must add GSD and real-drag check items |

## Decomposition-First Plan

If BpmnStage.jsx is touched for drag performance or edit mode, extraction is mandatory:

1. **DiagramEditModeBoundary** (extract to `frontend/src/features/process/bpmn/stage/interaction/diagramEditModeBoundary.js`)
   - Decide Viewer vs Modeler default.
   - Handle lazy promotion to Modeler.
   - Keep `forceEditorMode` logic bounded.

2. **DiagramDragSideEffectGuard** (extract to `frontend/src/features/process/bpmn/stage/interaction/diagramDragSideEffectGuard.js`)
   - Central `dragInProgress` ref management.
   - Gate all side-effect handlers during drag.
   - Resume on `drag.cleanup` or `mouseup`.

3. **DiagramPointerMoveCoalescer** (extract to `frontend/src/features/process/bpmn/stage/interaction/diagramPointerMoveCoalescer.js`)
   - RAF-coalesced UI updates during drag.
   - Avoid React setState per pointermove.

4. Keep existing modules:
   - `diagramAnalyticsMode.js` — extend, don't duplicate.
   - `wireBpmnStageRuntimeEvents.js` — add guards, don't bloat.

## Engine Evaluation Update Plan

Agent 2 must produce `ENGINE_EVALUATION_UPDATE.md`.

It must answer:
- Can bpmn-js meet real drag target after THIS contour?
- If yes, what remains?
- If no, what is next?
- Compare bpmn-js, GoJS, yFiles, JointJS+, React Flow/XYFlow, custom Canvas/Pixi/Konva.
- Recommend: keep optimizing bpmn-js OR prototype alternative viewer OR hybrid bpmn-js edit + alternative analytics viewer.

No library install. No migration in this contour.

## Hypotheses

| ID | Hypothesis | Test Method | Owner |
|----|-----------|-------------|-------|
| H1 | Review process is invalid because Agent 3 lacks GSD/testing gates. | Update reviewer prompt/tooling; verify Agent 3 documents GSD discipline. | Agent 2 |
| H2 | Versioning is confusing because semantic visible version never increments. | Bump to v1.0.127; add changelog entry; verify in 5180 footer. | Agent 2 |
| H3 | Read-only/viewer-first default blocks user expected element drag. | Source-map NavigatedViewer default; change to Modeler or explicit edit path; test element drag. | Agent 2 |
| H4 | Pointermove triggers React state updates. | Inject counters; check setState call count during drag. | Agent 2 |
| H5 | Pointermove triggers selection/property sync. | Monitor `selection.changed` and `syncAiQuestionPanelWithSelection` during drag. | Agent 2 |
| H6 | Pointermove triggers decor/derived fanout. | Monitor `useBpmnSettledDecorFanout` activity during drag. | Agent 2 |
| H7 | CommandStack/autosave pipeline does too much during element drag. | Check `commandStack.changed` and autosave queue during drag. | Agent 2 |
| H8 | useProcessTabs/parent shell churn still affects canvas. | Check ProcessStage re-render count during drag. | Agent 2 |
| H9 | bpmn-js/SVG engine itself cannot meet large diagram drag target. | If suppressing all React side effects does not improve drag, document as engine limit. | Agent 2 |

## Bounded Fix / Rollback Strategy

### Bounded fix options
- **Option A** (mandatory): Update reviewer prompts/templates with GSD discipline.
- **Option B** (mandatory): Version increment v1.0.126 → v1.0.127 + changelog entry + build-info update.
- **Option C** (mandatory): Remove/adjust default read-only OR provide explicit and obvious edit path.
- **Option D** (mandatory): Real drag baseline + after-fix comparison with strict metrics.
- **Option E**: Strengthen `dragInProgress` guard in `wireBpmnStageRuntimeEvents.js` to cover MORE handlers.
- **Option F**: Extract `DiagramDragSideEffectGuard` from BpmnStage if god file touched.
- **Option G**: RAF coalescing for pointermove UI updates.
- **Option H**: Engine evaluation update — recommend next contour if bpmn-js remains insufficient.

### Rollback
- If edit mode change causes stuck loading or broken selection, revert to viewer default but keep explicit edit toggle.
- If drag fix causes regression, revert drag changes and keep version/reviewer-GSD changes.

## Acceptance Criteria

Agent 3 should pass only if ALL are true:

**Reviewer/Test GSD:**
1. Reviewer GSD discipline documented in REVIEW_REPORT.
2. Reviewer ran GSD availability/use/fallback.
3. Reviewer tested exact real user scenario.

**Version/update:**
4. Visible version changed to v1.0.127 (or canonical version rule documented).
5. New update row/block exists in changelog/UI.
6. Marker is not on canvas.
7. build-info.json works.
8. window.__PROCESSMAP_BUILD_INFO__ works.
9. Fresh 5180 proof captured.

**Read-only/edit:**
10. Read-only is not blocking expected element drag.
11. If edit mode is required, clear edit path exists and Agent 3 tested it.
12. "Element drag prevented by read-only" is not pass.

**Real drag:**
13. Large no-overlays Diagram tested.
14. `.fpcPropertyOverlay = 0` confirmed.
15. Real mouse canvas drag tested with mouse.down/move/up.
16. Real element drag tested.
17. Before/after evidence exists.
18. Material improvement exists.
19. If still laggy, CHANGES_REQUESTED.

**Runtime safety:**
20. No stuck loading.
21. No repeated canvas reload cycles.
22. No PUT /bpmn from view interactions.
23. No PATCH /sessions from view interactions.
24. No versions spam regression.
25. No console errors.

**Architecture:**
26. Decomposition-first if BpmnStage/ProcessStage touched.
27. No god-file bloat.
28. Interaction modules bounded.

**Safety:**
29. No backend/schema/storage changes.
30. No BPMN XML mutation from view interactions.
31. No Product Actions/RAG/AG-UI changes.
32. Build/tests pass.

**Strict:**
33. REVIEW_PASS forbidden if user-visible lag remains materially present.
34. REVIEW_PASS forbidden if only quick-drag improved but stepped/natural drag remains bad.
35. REVIEW_PASS forbidden without median/3-run or stable evidence if metrics are noisy.
36. REVIEW_PASS forbidden if Reviewer GSD Discipline section missing.
37. REVIEW_PASS forbidden if element drag not tested in intended edit workflow.

## Non-goals

- No Product Actions implementation.
- No registry/реестр changes.
- No AG-UI implementation.
- No RAG implementation.
- No stage/prod deploy.
- No PR/merge/push.
- No backend/schema/storage unless blocked and explicitly justified.
- No BPMN XML semantics change.
- No full engine migration in this contour.
- No library install.
- No cosmetic-only fix.
- No review based only on source.
- No GSD repair/installation.

## Agent 2 Execution Plan

1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json, latest contour reports.
2. **Reviewer GSD discipline**:
   - Update `.planning/templates/agent3-ui-runtime-review-template.md` with GSD discipline section.
   - Update `.planning/templates/agent3-ui-runtime-proof-checklist.md` with GSD checks.
   - Update `tools/pm-agent3-reviewer-watch.sh` to inject GSD preamble.
   - Create bounded reviewer guidance file if needed.
3. **Version/update ledger**:
   - Bump `frontend/src/config/appVersion.js`: v1.0.126 → v1.0.127.
   - Add changelog entry.
   - Update `scripts/generate-build-info.mjs` fallback contourId.
   - Rebuild frontend, restart gateway, verify served assets.
   - Prove in 5180 browser.
4. **Read-only default removal/adjustment**:
   - Source-map NavigatedViewer vs Modeler default.
   - Choose Option A (Modeler default), B (lazy promotion), or C (obvious toggle).
   - Implement chosen option safely.
   - Ensure element drag is possible in intended workflow.
5. **Baseline real drag**:
   - Large no-overlays canvas.
   - Real mouse drag pan.
   - Real element drag.
   - 3 runs if metrics noisy.
   - Record all metrics.
6. **Source forensic**:
   - Pointer/drag stack in `wireBpmnStageRuntimeEvents.js`.
   - State updates during drag.
   - Decor/selection/panel updates during drag.
   - Parent shell churn.
7. **Decomposition/fix**:
   - Strengthen `dragInProgress` guard if needed.
   - Extract interaction controller if BpmnStage touched.
   - Suppress/coalesce drag-time side effects.
   - Keep autosave off during view/drag unless explicit save.
8. **Engine evaluation update**:
   - Produce `ENGINE_EVALUATION_UPDATE.md`.
9. **Validate**:
   - Build/tests.
   - Fresh 5180 browser.
   - Version/update row shows v1.0.127.
   - Real drag before/after.
   - Tab switch.
   - Selection/panel.
   - Network safety.
10. **Create reports**:
    - `EXEC_REPORT.md`
    - `REVIEWER_GSD_GATE_REPORT.md`
    - `VERSION_UPDATE_LEDGER_PROOF.md`
    - `READ_ONLY_REMOVAL_OR_EDIT_MODE_REPORT.md`
    - `REAL_DRAG_BASELINE.md`
    - `DRAG_LAG_ROOT_CAUSE.md`
    - `RUNTIME_BEFORE_AFTER.md`
    - `DECOMPOSITION_REPORT.md` if extraction happened
    - `ENGINE_EVALUATION_UPDATE.md`
    - `IMPLEMENTATION_NOTES.md`
    - `READY_FOR_REVIEW`

If blocked: `EXEC_BLOCKED.md`, no `READY_FOR_REVIEW`.

## Agent 3 Review Plan

1. **Reviewer GSD Discipline FIRST**:
   - Run GSD availability check and document in REVIEW_REPORT.
   - Run source/runtime truth and document.
   - No REVIEW_PASS without this section.

2. Read PLAN.md, EXEC_REPORT.md, and all Agent 2 reports.

3. Source/runtime version review:
   - Verify source HEAD.
   - Verify visible update/version row shows v1.0.127.
   - Verify app version increment.
   - Verify marker not on canvas.
   - Verify build-info.json.
   - Verify window build info.
   - Verify served assets.

4. Playwright real interaction review:
   - Fresh context/cache-busted 5180.
   - Open large Diagram.
   - Ensure overlays off.
   - Real mouse canvas drag pan: mouse.down → mouse.move with steps → mouse.up.
   - Real element drag: default if editable, or explicit edit mode then drag.
   - Run enough attempts to avoid cherry-picking.
   - Inspect long tasks/timings where possible.
   - Check DOM/SVG deltas.
   - Check no PUT/PATCH from view interactions.
   - Check no console errors.

5. Strict verdict:
   - If Reviewer GSD missing → CHANGES_REQUESTED.
   - If version/update row missing or still v1.0.126 → CHANGES_REQUESTED.
   - If marker on canvas → CHANGES_REQUESTED.
   - If read-only blocks expected element drag without clear edit path → CHANGES_REQUESTED.
   - If real drag still materially lags → CHANGES_REQUESTED.
   - If pass → REVIEW_REPORT.md + REVIEW_PASS.

## Risks

1. **BpmnStage.jsx is a god file** (~5850 lines). Any change risks unintended side effects. Decomposition-first is mandatory.
2. **Modeler default may slow initial load** (~15s on large diagrams). If this happens, fallback to Option C (obvious edit toggle).
3. **Real drag measurement is subjective**. Need concrete before/after numbers (duration, event count, long tasks).
4. **bpmn-js SVG engine may have inherent limits**. If suppression of React churn does not improve drag, user-perceived lag may remain. Must document evidence and recommend engine research contour.
5. **Dirty working tree** (34 files) makes it hard to isolate contour changes. Agent 2 must document exactly which files were changed for this contour.
6. **Previous REVIEW_PASS rejection means stricter scrutiny**. Agent 3 must be more rigorous than before.

## Gates

- [x] Gate 1 — Agent 1 GSD discipline completed
- [x] Gate 2 — source/runtime truth captured
- [x] Gate 3 — previous REVIEW_PASS rejected by user documented
- [x] Gate 4 — Reviewer/Test GSD plan defined
- [x] Gate 5 — version/update ledger plan defined
- [x] Gate 6 — read-only/default mode removal plan defined
- [x] Gate 7 — real drag reproduction plan defined
- [x] Gate 8 — pointer/drag source map targets defined
- [x] Gate 9 — decomposition-first plan defined
- [x] Gate 10 — material improvement criteria defined
- [x] Gate 11 — Agent 2 executor prompt ready
- [x] Gate 12 — Agent 3 reviewer prompt with GSD ready
- [x] Gate 13 — READY_FOR_EXECUTION marker created
