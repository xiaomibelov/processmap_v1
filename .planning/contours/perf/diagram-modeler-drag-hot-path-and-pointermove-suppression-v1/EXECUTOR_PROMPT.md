# Executor Prompt — perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1

**Role**: Agent 2 / Executor  
**Run ID**: `20260516T080003Z-79254`  
**Contour**: P0 frontend performance — BPMN Modeler drag hot path  
**Scope**: Frontend changes for drag performance + version ledger update only. No backend. No deploy. No PR.

---

## 0. Pre-flight — Read Required Files

Before writing code, read:
1. `PLAN.md` (this directory)
2. `RUNTIME_NAVIGATION.md` (this directory)
3. `RUNTIME_PROOF_CHECKLIST.md` (this directory)
4. `STATE.json` (this directory)
5. Previous contour reports:
   - `.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/EXEC_REPORT.md`
   - `.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/DRAG_LAG_ROOT_CAUSE.md`
   - `.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/RUNTIME_BEFORE_AFTER.md`

---

## 1. Source / Runtime Truth

Capture before any changes:

```bash
cd /opt/processmap-test
pwd
whoami
hostname
date -Is
git status -sb
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git diff --name-only
git diff --stat
```

Also capture:
- `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"`
- Current served JS asset hash from `curl -s "http://clearvestnic.ru:5180/?cb=$(date +%s)" | grep -o "assets/[^\"' ]*\.js"`
- Footer version from browser or HTML.

---

## 2. Version / Update Ledger

### 2.1 Bump version
- File: `frontend/src/config/appVersion.js`
- Change `currentVersion` from `"v1.0.127"` to `"v1.0.128"`.
- Add new changelog entry at index 0:
  ```js
  {
    version: "v1.0.128",
    changes: [
      "Оптимизирован hot path drag диаграммы: side effects подавлены во время pointermove.",
      "Pointermove обработка объединена через RAF: уменьшено число React-рендеров при drag.",
      "Autosave и durable-мутации отложены до окончания drag.",
      "Сохранена Reviewer GSD-дисциплина: runtime drag проверка обязательна.",
    ],
  }
  ```

### 2.2 Update build-info generator
- File: `scripts/generate-build-info.mjs`
- Update fallback `contourId` to `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`.

### 2.3 Build and restart
```bash
cd /opt/processmap-test/frontend && npm run build
# expect 0 errors
docker restart processmap_test-gateway-1
```

### 2.4 Verify
- `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"` shows updated timestamp and contourId.
- Footer shows `Версия v1.0.128`.
- Served JS asset hash changed from previous.
- Marker NOT on canvas.

---

## 3. Baseline Real Drag (Before Fix)

Use large Diagram (`wewe / Описание процессов Долгопрудный`).

### 3.1 Fresh browser
- Open `http://clearvestnic.ru:5180/?cb=<timestamp>`.
- Verify v1.0.127 visible.

### 3.2 Overlays off
- `document.querySelectorAll('.fpcPropertyOverlay').length === 0`

### 3.3 Quick canvas drag
- Real mouse: empty canvas area → down → quick move → up.
- ≥3 attempts.
- Record: duration, long tasks, max long task, viewport transform changed.

### 3.4 Stepped canvas drag
- Real mouse: empty canvas area → down → move with steps → up.
- ≥3 attempts if feasible.
- Record same metrics.

### 3.5 Element drag
- Pick visible BPMN shape.
- Real mouse: center → down → move with steps → up.
- ≥3 attempts.
- Record: element moved?, duration, long tasks, console errors.

### 3.6 Network safety
- Filter: PUT, PATCH, /bpmn, /sessions.
- Expect 0 from drag interactions.

---

## 4. Source Forensic

Investigate these areas. Do NOT change code yet — only read and document.

### 4.1 wireBpmnStageRuntimeEvents.js
- Check all `eventBus.on` handlers.
- Verify `isDragInProgress` guard coverage:
  - `selection.changed` in viewer ✅ (exists)
  - `selection.changed` in modeler ✅ (exists)
  - `canvas.viewbox.changed` in viewer ✅ (exists)
  - `canvas.viewbox.changed` in modeler ✅ (exists)
  - `commandStack.changed` in modeler ✅ (exists)
- Check for gaps: any handler that runs during drag and does non-critical work?

### 4.2 useBpmnSettledDecorFanout.js
- 5 `useEffect` blocks — do any fire during drag due to dependency changes?
- Check dependencies: `notesSig`, `readySignal`, `diagramDisplayMode`, `view`, `nodesKey`, `stepTimeUnit`, `bpmnMetaKey`, `robotMetaOverlayEnabled`, etc.
- If drag causes `view` or `diagramDisplayMode` to change, fanout fires.
- **Hypothesis**: `readySignal` or `view` may change during drag → fanout runs.

### 4.3 bpmnWiring.js
- `commandStack.changed` handler at line ~224.
- Emits `diagram.change` mutation.
- Does this fire during element drag?
- If yes, does it trigger autosave scheduling?

### 4.4 useDiagramMutationLifecycle.js
- `queueDiagramMutation` → filters empty `commandStack.changed`?
- Does it still queue autosave during continuous drag?
- Can we add drag guard to `queueDiagramMutation`?

### 4.5 BpmnStage.jsx
- `emitDiagramMutation` function.
- `suppressEmitDiagramMutationRef` — is it used during drag?
- Any `useEffect` that reacts to drag-related state changes?

### 4.6 ProcessStage.jsx
- `selectedElementContext` — does it recompute during drag?
- Any prop fanout to sidebar/panels during drag?

---

## 5. Decomposition / Fix Implementation

### 5.1 Rule: decomposition-first
- Any new drag logic goes into `frontend/src/features/process/bpmn/stage/interaction/`.
- Do not bloat `BpmnStage.jsx` or `wireBpmnStageRuntimeEvents.js` beyond necessary guard additions.

### 5.2 Fix Option Priority

Apply in this order based on evidence:

#### A. Extend drag guard coverage
If source forensic shows handlers not covered:
- Add `isDragInProgress` guard to any event handler that does non-critical work during drag.
- Ensure `contextMenuInteractionRef` is passed to all relevant handlers.

#### B. Suppress useBpmnSettledDecorFanout during drag
- Option 1: Add a `dragInProgressRef` prop to `useBpmnSettledDecorFanout` and early-return each fanout if drag active.
- Option 2: In `BpmnStage.jsx`, skip calling decor apply functions while drag is active (if they are invoked imperatively during drag).
- **Preferred**: Option 1 — bounded, explicit.

#### C. Suppress mutation/autosave during drag
- In `useDiagramMutationLifecycle.js` or `bpmnWiring.js`:
  - If drag is active, do not call `scheduleDiagramAutosave` for `commandStack.changed` events.
  - Instead, set a `pendingDragMutationRef` flag.
- On drag end (`drag.cleanup`):
  - If `pendingDragMutationRef` is set, emit one `diagram.change` mutation and schedule one autosave.

#### D. RAF coalesce any remaining drag-end updates
- Use existing `diagramPointerMoveCoalescer.js` (`scheduleRafForInstance`) to batch post-drag decor updates.

#### E. Suppress React setState in sidebar/panels during drag
- In `ProcessStage.jsx`:
  - If `selectedElementContext` changes during drag, check if the change is drag-induced.
  - If drag active, defer panel state updates until drag end.
- **Careful**: `selectedElementContext` is memoized; may not be the primary source of churn.

### 5.3 What NOT to change
- No backend/schema/storage.
- No Product Actions / RAG / AG-UI.
- No BPMN XML semantics.
- No full engine migration.
- No library install.

---

## 6. Validate

### 6.1 Build
```bash
cd /opt/processmap-test/frontend && npm run build
# must be 0 errors
```

### 6.2 Runtime version
- Footer shows v1.0.128.
- build-info.json contourId matches.
- JS asset hash changed.

### 6.3 Real drag after fix
Repeat Scenario B, C, D from Section 3.
- Record before/after metrics.
- Target improvement:
  - quick drag: ≤8 long tasks, ≤1,000ms total (vs current ~14 / ~1,800ms).
  - stepped drag: reduced or stable (not worse).
  - element drag: smooth, no stutter.

### 6.4 Selection / property panel
- After drag ends, selection updates correctly.
- Property panel shows correct element.
- AI question panel syncs correctly.

### 6.5 Network safety
- 0 PUT/PATCH during drag.
- 0 autosave during continuous drag.
- One autosave after drag end if element was moved.

### 6.6 Console errors
- 0 new errors.

---

## 7. Required Output Files

Create in contour directory:

1. **EXEC_REPORT.md** — execution summary, changes made, verification results.
2. **VERSION_UPDATE_LEDGER_PROOF.md** — version bump evidence, build-info, footer screenshot/description.
3. **REAL_DRAG_HOT_PATH_BASELINE.md** — before/after metrics for all drag scenarios.
4. **DRAG_HOT_PATH_ROOT_CAUSE.md** — what was found, what was fixed, what remains.
5. **POINTERMOVE_SIDE_EFFECTS_REPORT.md** — which side effects were suppressed, which remain, evidence.
6. **RUNTIME_BEFORE_AFTER.md** — runtime state before and after.
7. **IMPLEMENTATION_NOTES.md** — architectural decisions, decomposition choices, risks.
8. **DECOMPOSITION_REPORT.md** — if new modules extracted.
9. **ENGINE_LIMIT_NOTE.md** — if engine limit remains, with evidence and next prototype recommendation.
10. **READY_FOR_REVIEW** — marker file.

If blocked:
- Create **EXEC_BLOCKED.md** with reason and recommendation.
- Do NOT create READY_FOR_REVIEW.

---

## 8. Strict Reminders

- Do NOT push/commit/PR.
- Do NOT deploy stage/prod.
- Do NOT change backend.
- Do NOT change Product Actions / RAG / AG-UI.
- Do NOT install libraries.
- Do NOT mutate BPMN XML from view interactions.
- Do NOT durable-save from drag interactions.
- Test runtime 5180 rebuild/restart is allowed.
- If engine limit remains, document it honestly — do not fake pass.
