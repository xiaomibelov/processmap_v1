# Reviewer Prompt — perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1

**Role**: Agent 3 / Reviewer  
**Run ID**: `20260516T080003Z-79254`  
**Contour**: P0 frontend performance — BPMN Modeler drag hot path  
**Scope**: Strict runtime review with real drag testing. No source-only pass allowed.

---

## 0. Reviewer GSD Discipline — Mandatory

Before any review work, run and document:

```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
```

- If GSD available: use GSD review/check discipline.
- If GSD unavailable: continue as `GSD_FALLBACK_MANUAL_REVIEW_ONLY`.
- **Explicitly record** GSD mode in REVIEW_REPORT.md.

---

## 1. Read Required Files

Read ALL of these before testing:

1. `PLAN.md`
2. `EXEC_REPORT.md`
3. `VERSION_UPDATE_LEDGER_PROOF.md`
4. `REAL_DRAG_HOT_PATH_BASELINE.md`
5. `DRAG_HOT_PATH_ROOT_CAUSE.md`
6. `POINTERMOVE_SIDE_EFFECTS_REPORT.md`
7. `RUNTIME_BEFORE_AFTER.md`
8. `IMPLEMENTATION_NOTES.md`
9. `DECOMPOSITION_REPORT.md` (if exists)
10. `ENGINE_LIMIT_NOTE.md` (if exists)
11. `RUNTIME_PROOF_CHECKLIST.md`

---

## 2. Source / Runtime Version Review

| Check | How to verify |
|-------|---------------|
| Source HEAD matches working tree | `git rev-parse HEAD` |
| Branch is expected | `git branch --show-current` |
| Visible update/version row shows v1.0.128 | Browser: footer/status bar text |
| App version increment follows canonical rule | `frontend/src/config/appVersion.js` |
| Marker NOT on canvas | `document.querySelectorAll('[data-testid="build-info-badge"]').length` or visual inspection |
| build-info.json matches HEAD | `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"` |
| window.__PROCESSMAP_BUILD_INFO__ matches | Browser evaluate |
| Served assets match frontend/dist | Compare JS hash in HTML vs dist/assets |
| JS asset hash changed from previous | Compare with baseline |

---

## 3. Playwright Real Interaction Review

### 3.1 Fresh context
- New browser context.
- Cache-busted URL: `http://clearvestnic.ru:5180/?cb=<timestamp>`.
- Wait for app load.

### 3.2 Navigate to large Diagram
- Use known route or project/session.
- If not known, use `wewe / Описание процессов Долгопрудный`.
- Wait for diagram tab active and shapes visible.

### 3.3 Ensure overlays off
```js
const overlayCount = document.querySelectorAll('.fpcPropertyOverlay').length;
// MUST be 0
```

### 3.4 Scenario B — Real mouse canvas drag quick/natural
1. Move mouse to empty canvas area (not scrubber, not toolbar).
2. `mouse.down()`.
3. `mouse.move(deltaX, deltaY)` — quick, no artificial steps.
4. `mouse.up()`.
5. Run ≥3 attempts.
6. Record per attempt:
   - duration (ms)
   - long task count
   - long task total duration
   - viewport transform changed? (boolean)
   - console errors
   - DOM total node count before/after
   - SVG node count before/after
7. Compute median.

### 3.5 Scenario C — Real mouse canvas drag stepped/stress
1. Same setup.
2. `mouse.down()`.
3. `mouse.move(deltaX, deltaY, { steps: 20 })`.
4. `mouse.up()`.
5. Run ≥3 attempts if feasible.
6. Record same metrics.
7. Compute median.

### 3.6 Scenario D — Real element drag
1. Pick visible BPMN shape (task or event).
2. `mouse.move()` to shape center.
3. `mouse.down()`.
4. `mouse.move(deltaX, deltaY, { steps: 8 })`.
5. `mouse.up()`.
6. Verify:
   - element transform changed (moved locally)
   - no console errors
   - no PUT/PATCH during drag
   - no massive long-task burst
7. Run ≥3 attempts.
8. Record median.

### 3.7 Network filters during all scenarios
Watch for:
- `PUT` requests
- `PATCH` requests
- `/bpmn` endpoints
- `/sessions` endpoints
- `/bpmn/versions` with `limit=1`

Expect:
- 0 PUT/PATCH from view interactions
- Normal background polling only

---

## 4. Verdict Rules

### CHANGES_REQUESTED if ANY of:
- [ ] Reviewer GSD Discipline section missing from REVIEW_REPORT.md.
- [ ] Version/update row missing or still v1.0.127 only.
- [ ] Marker overlays canvas.
- [ ] build-info.json missing or stale.
- [ ] Real mouse canvas drag NOT tested.
- [ ] Real mouse element drag NOT tested.
- [ ] Fresh 5180 browser NOT used.
- [ ] Only programmatic zoom/click/DOM count tested.
- [ ] PUT/PATCH observed during drag.
- [ ] Console errors introduced.
- [ ] Build fails.
- [ ] Quick drag material lag remains with NO engine-limit evidence.
- [ ] Stepped drag catastrophic regression with NO explanation.
- [ ] Source/runtime truth does not match.

### REVIEW_PASS only if ALL of:
- [x] Reviewer GSD Discipline documented.
- [x] Version shows v1.0.128 (or canonical next) with update row.
- [x] Marker not on canvas.
- [x] build-info.json and window build info verified.
- [x] Fresh 5180 proof captured.
- [x] Large no-overlays Diagram tested.
- [x] `.fpcPropertyOverlay = 0` confirmed.
- [x] Real mouse canvas drag quick/natural tested (≥3 attempts, median recorded).
- [x] Real mouse canvas drag stepped/stress tested (≥3 attempts if feasible).
- [x] Real element drag tested.
- [x] Before/after comparison documented.
- [x] Material improvement achieved OR engine limit documented with evidence AND user-visible drag is materially better.
- [x] 0 PUT/PATCH from drag interactions.
- [x] 0 new console errors.
- [x] Build passes.
- [x] Decomposition-first followed.

### Engine limit pass rule
If app-side side effects are proven eliminated but bpmn-js SVG still produces material long tasks:
- REVIEW_PASS is **NOT** allowed as "lag solved".
- ALLOWED as "app-side hot path cleaned" **only if**:
  - quick drag is materially better than before;
  - remaining cost is attributed to bpmn-js with profiler evidence;
  - `ENGINE_LIMIT_NOTE.md` recommends next prototype contour.

---

## 5. Output

Create in contour directory:

1. **REVIEW_REPORT.md** with:
   - Reviewer GSD Discipline section
   - Source/runtime version review table
   - Real drag test results (all scenarios, all attempts, medians)
   - Before/after comparison
   - Network safety check
   - Console errors check
   - Verdict (CHANGES_REQUESTED or REVIEW_PASS)
   - Reviewer proof block (branch, HEAD, build-info, version, served JS)

2. If pass:
   - **REVIEW_PASS** marker file.
   - **REVIEW_RUN_ID** file with run id.

3. If changes requested:
   - List specific changes needed.
   - Do NOT create REVIEW_PASS.

---

## 6. Strict Reminders

- REVIEW_PASS forbidden if user-visible drag lag remains materially present.
- REVIEW_PASS forbidden if real drag not tested.
- REVIEW_PASS forbidden if Reviewer GSD Discipline missing.
- REVIEW_PASS forbidden if version/update row not updated.
- REVIEW_PASS forbidden if 5180 marker stale.
- REVIEW_PASS forbidden if only source/build passed.
