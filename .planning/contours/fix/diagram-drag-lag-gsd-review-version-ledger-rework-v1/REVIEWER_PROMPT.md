# Agent 3 / Reviewer Prompt

## Identity
- Contour: `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`
- Run ID: `20260515T231647Z-58762`
- Role: Agent 3 / Reviewer
- Scope: Verify reviewer GSD discipline, version/update ledger, read-only/edit mode fix, real mouse drag performance, decomposition quality, engine evaluation, and runtime safety.

## Pre-flight
1. Read `PLAN.md`, `EXECUTOR_PROMPT.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`.
2. Read all Agent 2 reports:
   - `EXEC_REPORT.md`
   - `REVIEWER_GSD_GATE_REPORT.md`
   - `VERSION_UPDATE_LEDGER_PROOF.md`
   - `READ_ONLY_REMOVAL_OR_EDIT_MODE_REPORT.md`
   - `REAL_DRAG_BASELINE.md`
   - `DRAG_LAG_ROOT_CAUSE.md`
   - `RUNTIME_BEFORE_AFTER.md`
   - `DECOMPOSITION_REPORT.md` (if exists)
   - `ENGINE_EVALUATION_UPDATE.md`
   - `IMPLEMENTATION_NOTES.md`

## 0. Reviewer GSD Discipline — MANDATORY

Agent 3 MUST execute this section BEFORE any other review work.

### 0.1 GSD Availability Check
```bash
cd /opt/processmap-test

echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
```
- Record result in REVIEW_REPORT.md under "Reviewer GSD Discipline".

### 0.2 Source / Runtime Truth
```bash
cd /opt/processmap-test
pwd && git status -sb && git branch --show-current && git rev-parse HEAD
curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"
```
- Record: branch, HEAD, build-info SHA, build-info contourId, served assets.

### 0.3 Exact User Scenario Identification
Before testing, document the exact user scenario:
- Large diagram (`wewe / Описание процессов Долгопрудный` or equivalent).
- Overlays OFF.
- Canvas drag: hold LMB on empty canvas and drag.
- Element drag: hold LMB on BPMN element and move it.
- User expects BOTH to be smooth.

### 0.4 GSD Mode Documentation
In REVIEW_REPORT.md, include:
```markdown
## Reviewer GSD Discipline
- GSD mode: <GSD_NATIVE / GSD_PROCESSMAP_WRAPPER / GSD_FALLBACK_MANUAL_REVIEW_ONLY>
- Commands run: <list>
- Source/runtime truth: <summary>
- Exact user scenario reproduced: <yes/no + description>
- Why review verdict is justified: <reasoning>
```

**NO REVIEW_PASS if this section is missing.**

## 1. Source / Runtime Version Review

```bash
cd /opt/processmap-test
pwd && git status -sb && git branch --show-current && git rev-parse HEAD
```

| Check | Method |
|-------|--------|
| Source HEAD matches working tree | `git rev-parse HEAD` |
| Visible version shows v1.0.127 | Playwright screenshot of footer or updates page |
| Build marker not on canvas | Playwright screenshot of Diagram tab |
| `build-info.json` matches HEAD | `curl -s http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)` |
| `window.__PROCESSMAP_BUILD_INFO__` matches | Browser devtools evaluation |
| Served assets match `frontend/dist/assets/` | Compare JS/CSS filenames |
| New update row/block exists | Check AppShell footer or /updates page |

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
- Confirm footer or app shell shows `v1.0.127`.
- Confirm update/changelog row exists.

### 2.3 Read-only / Edit Mode Check
- Check if diagram is editable by default.
- If view mode default: verify "Редактировать BPMN" or equivalent edit toggle is clearly visible and ONE click away.
- If edit mode default: verify `.djs-palette` is present and element drag works.
- **"Element drag prevented because read-only" is NOT a pass unless the UI clearly indicates read-only AND edit mode is one click away.**

### 2.4 Real Mouse Canvas Pan
```js
await page.mouse.move(x, y);               // empty canvas area
await page.mouse.down();
await page.mouse.move(x + 200, y, { steps: 20 });
await page.mouse.move(x + 400, y + 100, { steps: 20 });
await page.mouse.up();
```
- Also test quick natural drag without excessive steps.
- Record:
  - Duration from down to up.
  - Subjective smoothness (honest note).
  - Whether viewport transform changed.
  - Any visible stutter or freeze.
  - Console errors.
  - Long tasks if measurable.

### 2.5 Real Element Drag
- In intended edit workflow (default edit or after explicit toggle).
- Pick BPMN task.
- `mouse.down` on shape center.
- `mouse.move` with steps.
- `mouse.up`.
- Record:
  - Element position changed.
  - Lag visible.
  - Whether PUT `/bpmn` or PATCH `/sessions` fires automatically.
  - Console errors.

### 2.6 DOM / Network Safety During Drag
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

### 2.7 Before/After Evidence
- Agent 2 must provide `RUNTIME_BEFORE_AFTER.md`.
- Reviewer must independently confirm the after state matches reported improvement OR document discrepancy.
- If metrics are noisy, reviewer should run at least 2 attempts and not cherry-pick.

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
- [ ] Reviewer GSD Discipline section missing from REVIEW_REPORT.md.
- [ ] GSD availability check not run or not documented.
- [ ] Source/runtime truth not recorded.
- [ ] Version still shows v1.0.126 (no increment).
- [ ] No new update row/block visible.
- [ ] Version marker still overlays canvas / top-left badge remains.
- [ ] Real mouse drag canvas pan was not tested by reviewer.
- [ ] Real element drag was not tested in intended edit workflow.
- [ ] Programmatic zoom/click is the only drag evidence.
- [ ] Read-only default blocks expected element drag without clear edit path.
- [ ] No material improvement in drag smoothness AND no clear engine-limit evidence.
- [ ] Stepped/natural drag still materially lags but dismissed as "acceptable".
- [ ] Stuck loading regression observed.
- [ ] PUT `/bpmn` or PATCH `/sessions` triggered by view-only drag.
- [ ] New console errors introduced.
- [ ] Build fails.
- [ ] Scope violations (backend, BPMN XML mutation, Product Actions, etc.).
- [ ] `ENGINE_EVALUATION_UPDATE.md` missing.

**REVIEW_PASS** only if ALL of the following:
- [ ] Reviewer GSD Discipline section present and complete.
- [ ] Version incremented to v1.0.127 and visible.
- [ ] New update row/block exists.
- [ ] Version marker removed from canvas and visible in non-canvas area.
- [ ] Real mouse drag canvas pan tested and improved OR exact engine limit documented with evidence.
- [ ] Real element drag tested in intended edit workflow.
- [ ] Element drag behavior correct (moves in edit mode, clear path if view mode default).
- [ ] No PUT/PATCH from view interactions.
- [ ] No new console errors.
- [ ] Build passes.
- [ ] Decomposition-first followed.
- [ ] `ENGINE_EVALUATION_UPDATE.md` present and evidence-based.
- [ ] Fresh 5180 runtime proof captured.

## 5. Output

If pass:
- `REVIEW_REPORT.md` with all sections above filled.
- `REVIEW_PASS` marker in report.

If changes requested:
- `REVIEW_REPORT.md` with specific deficiencies listed.
- `CHANGES_REQUESTED` marker.
- `REWORK_REQUEST.md` with actionable items.
- Do NOT create `REVIEW_PASS`.
