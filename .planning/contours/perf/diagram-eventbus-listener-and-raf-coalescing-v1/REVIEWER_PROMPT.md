# REVIEWER_PROMPT — Agent 3 / Reviewer

Contour ID: `perf/diagram-eventbus-listener-and-raf-coalescing-v1`
Run ID: `20260515T102714Z-14849`

---

## Scope

Review the execution of `perf/diagram-eventbus-listener-and-raf-coalescing-v1`.
Focus: frontend-only Diagram/BPMN eventBus listener cleanup and RAF coalescing.

## Read First

1. `PLAN.md`
2. `EXEC_REPORT.md`
3. `PERFORMANCE_BEFORE_AFTER.md`
4. `IMPLEMENTATION_NOTES.md`
5. `RUNTIME_PROOF_CHECKLIST.md`

## Source Code Review

Verify the files changed by Agent 2:

1. **Listener cleanup**:
   - `bindViewerStageEvents` and `bindModelerStageEvents` return a cleanup function.
   - Every `eventBus.on` has a corresponding `eventBus.off` with the same handler reference.
   - Cleanup is wired into instance replacement and component unmount.
   - No inline anonymous handlers passed to `.off`.

2. **RAF coalescing**:
   - `canvas.viewbox.changed` handler does not call overlay refresh directly.
   - One pending RAF per instance; cancel + reschedule pattern.
   - RAF token cancelled on cleanup.
   - Reference pattern from `useBpmnViewportSource.js` is followed.

3. **`readySignal` stabilization**:
   - `useBpmnSettledDecorFanout` no longer recomputes `readySignal` on every render.
   - `useMemo` or equivalent primitive guard is used.
   - Fanouts still fire on initial load and instance change.

4. **No unrelated changes**:
   - Only expected files are modified.
   - No changes to backend, package files, BPMN XML logic, Product Actions, RAG, AG-UI.
   - Viewport-culling logic untouched.
   - Versions head-check untouched.
   - Non-edit PUT guard untouched.

## Playwright / Browser Runtime Review

Use Playwright or manual browser review against http://clearvestnic.ru:5180.

Run the following scenarios and record results:

### Scenario B — Pan/Zoom Burst
- Perform 5 fast pan/zoom cycles.
- Record `.fpcPropertyOverlay` and `.djs-overlay` counts before, during, after.
- Expected: counts stable, no monotonic growth, overlays aligned.

### Scenario C — Selection Burst
- Click 10 BPMN elements one by one.
- Monitor Network: 0 `PUT /bpmn`, 0 `PATCH /sessions`.
- Expected: responsive, no console errors.

### Scenario D — Hover Burst
- Hover over 10 elements rapidly.
- Expected: no overlay flicker, no console errors.

### Scenario E — Tab Return
- Diagram → Analysis → Diagram.
- Diagram → XML → Diagram.
- Record overlay counts after each return.
- Expected: no duplicate overlays, counts stable, no network mutations.

### Scenario F — Stress Loop
- 3 cycles of pan/zoom + selection + tab switch.
- Record counts after each cycle.
- Expected: no unbounded DOM growth, no increasing lag.

### Console
- Check for new errors.
- Pre-existing `401` on `/api/auth/me` is acceptable.

## Verdict Rules

- If any listener lacks cleanup: **CHANGES_REQUESTED**.
- If RAF coalescing is missing or broken: **CHANGES_REQUESTED**.
- If `readySignal` still churns: **CHANGES_REQUESTED**.
- If any runtime scenario fails (unstable counts, mutations, errors): **CHANGES_REQUESTED**.
- If unrelated files changed: **CHANGES_REQUESTED**.
- If previous fixes regressed: **CHANGES_REQUESTED**.

If changes requested:
- Create `REWORK_REQUEST.md` with specific issues and reproduction steps.
- Do NOT create `REVIEW_PASS`.

If all checks pass:
- Create `REVIEW_REPORT.md` with verification table.
- Create `REVIEW_PASS` marker.

## Review Report Template

Include:
- Files changed and their roles.
- Listener cleanup verification (paired `.on`/`.off`).
- RAF coalescing verification.
- `readySignal` stabilization verification.
- Runtime scenario results with counts.
- Network safety confirmation.
- Console check.
- Scope boundary confirmation.
- Verdict: REVIEW_PASS or CHANGES_REQUESTED.
