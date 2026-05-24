# Agent 3 / Reviewer Prompt

## Identity
- Contour: `fix/diagram-real-drag-performance-and-engine-decomposition-v1`
- Run ID: `20260515T223804Z-56109`
- Role: Agent 3 / Reviewer
- Scope: Verify version marker relocation, real mouse drag performance, decomposition quality, engine evaluation, and runtime safety.

## Pre-flight
1. Read `PLAN.md`, `EXECUTOR_PROMPT.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`.
2. Read all Agent 2 reports:
   - `EXEC_REPORT.md`
   - `VERSION_MARKER_RELOCATION_PROOF.md`
   - `REAL_DRAG_BASELINE.md`
   - `DRAG_LAG_ROOT_CAUSE.md`
   - `RUNTIME_BEFORE_AFTER.md`
   - `DECOMPOSITION_REPORT.md` (if exists)
   - `ENGINE_EVALUATION.md`
   - `IMPLEMENTATION_NOTES.md`

## 1. Source / Runtime Version Review

```bash
cd /opt/processmap-test
pwd && git status -sb && git branch --show-current && git rev-parse HEAD
```

| Check | Method |
|-------|--------|
| Source HEAD matches working tree | `git rev-parse HEAD` |
| Build marker not on canvas | Playwright screenshot of Diagram tab |
| Build marker visible in bottom/app shell | Playwright screenshot of footer |
| `build-info.json` matches HEAD | `curl -s http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)` |
| `window.__PROCESSMAP_BUILD_INFO__` matches | Browser devtools evaluation |
| Served assets match `frontend/dist/assets/` | Compare JS/CSS filenames |

## 2. Playwright Real Interaction Review

### 2.1 Fresh Context Setup
- New Playwright browser context.
- URL: `http://clearvestnic.ru:5180/?cb=<timestamp>` (cache-busted).
- Authenticate if needed.
- Navigate to large Diagram session (`wewe / Описание процессов Долгопрудный` or equivalent).
- Ensure overlays off:
  ```js
  document.querySelectorAll('.fpcPropertyOverlay').length === 0
  ```

### 2.2 Version Marker Visual Check
- Screenshot full page.
- Confirm NO top-left canvas overlay with SHA/contour text.
- Confirm footer or app shell shows version + SHA + timestamp + contour.

### 2.3 Real Mouse Canvas Pan
```js
await page.mouse.move(x, y);               // empty canvas area
await page.mouse.down();
await page.mouse.move(x + 200, y, { steps: 20 });
await page.mouse.move(x + 400, y + 100, { steps: 20 });
await page.mouse.up();
```
- Record:
  - Duration from down to up.
  - Subjective smoothness (honest note).
  - Whether viewport transform changed.
  - Any visible stutter or freeze.
  - Console errors.

### 2.4 Real Element Drag
- If view mode: attempt to drag a BPMN task. If it does not move, document as expected view-mode behavior.
- If edit mode: click "Редактировать BPMN", wait for Modeler init, then drag a task with steps.
- Record:
  - Element position changed (if edit mode).
  - Lag visible.
  - Whether PUT `/bpmn` or PATCH `/sessions` fires automatically.
  - Console errors.

### 2.5 DOM / Network Safety During Drag
```js
document.querySelectorAll('*').length
document.querySelectorAll('svg *').length
document.querySelectorAll('.djs-container').length
document.querySelectorAll('.fpcPropertyOverlay').length
document.querySelectorAll('.djs-overlay').length
document.querySelectorAll('.fpcFocusDim').length
document.querySelectorAll('.fpcAnalyticsSelected').length
document.querySelectorAll('.djs-bendpoint').length
document.querySelectorAll('.djs-segment-dragger').length
window.__PROCESSMAP_BUILD_INFO__
```
- Network filter during drag: ensure 0 `PUT /bpmn`, 0 `PATCH /sessions` from view interactions.
- `versions?limit=1` may poll in background — acceptable if not spam.

### 2.6 Before/After Evidence
- Agent 2 must provide `RUNTIME_BEFORE_AFTER.md`.
- Reviewer must independently confirm the after state matches reported improvement or document discrepancy.

## 3. Code Review (if files changed)

- Only frontend files allowed.
- No backend changes.
- No `.env` changes attributable to this contour.
- No Product Actions / RAG / AG-UI changes.
- Decomposition-first: if BpmnStage.jsx touched, verify extraction happened before behavior change.
- No `console.log` spam in new files.
- Build passes (`npm run build` 0 errors).

## 4. Strict Verdict Rules

**CHANGES_REQUESTED** if ANY of the following:
- [ ] Version marker still overlays canvas / top-left badge remains.
- [ ] Real mouse drag canvas pan was not tested by reviewer.
- [ ] Real element drag or view-mode prevention was not tested.
- [ ] Programmatic zoom/click is the only drag evidence.
- [ ] No material improvement in drag smoothness AND no clear engine-limit evidence.
- [ ] Stuck loading regression observed.
- [ ] PUT `/bpmn` or PATCH `/sessions` triggered by view-only drag.
- [ ] New console errors introduced.
- [ ] Build fails.
- [ ] Scope violations (backend, BPMN XML mutation, Product Actions, etc.).
- [ ] `ENGINE_EVALUATION.md` missing.

**REVIEW_PASS** only if ALL of the following:
- [ ] Version marker removed from canvas and visible in non-canvas area.
- [ ] Real mouse drag canvas pan tested and improved OR exact engine limit documented with evidence.
- [ ] Element drag behavior correct (moves in edit mode, prevented in view mode).
- [ ] No PUT/PATCH from view interactions.
- [ ] No new console errors.
- [ ] Build passes.
- [ ] Decomposition-first followed.
- [ ] `ENGINE_EVALUATION.md` present and evidence-based.
- [ ] Fresh 5180 runtime proof captured.

## 5. Output

If pass:
- `REVIEW_REPORT.md` with all sections above filled.
- `REVIEW_PASS` marker in report.

If changes requested:
- `REVIEW_REPORT.md` with specific deficiencies listed.
- No `REVIEW_PASS`.
