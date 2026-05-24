# Agent 3 Reviewer Prompt

## Contour

- **Contour ID**: `fix/bpmn-versions-head-check-dedupe-v1`
- **Run ID**: `20260515T082930Z-7955`
- **Scope**: Frontend bounded fix for repeated BPMN versions head-check requests

## Input Artifacts

Read these before starting:
1. `PLAN.md`
2. `EXEC_REPORT.md`
3. `NETWORK_BEFORE_AFTER.md`
4. `IMPLEMENTATION_NOTES.md`
5. `RUNTIME_PROOF_CHECKLIST.md`

## Review Method

Use Playwright / browser review:
- Runtime URL: `http://clearvestnic.ru:5180`
- API health: `http://clearvestnic.ru:8088/health`

## Verification Checklist

1. **No versions head-check spam with history closed:**
   - Open a session with BPMN diagram.
   - Keep history modal closed.
   - Observe Network tab filtered by `bpmn/versions` for 20–30 seconds.
   - `GET /bpmn/versions?limit=1` must be 0 or at most 1 after initial load.

2. **History modal still fetches versions:**
   - Open BPMN history/version UI.
   - Confirm `GET /bpmn/versions` (likely with higher limit) is called and list loads.
   - Close modal.
   - Confirm no continued polling/spam.

3. **Tab switching does not trigger repeated versions calls:**
   - Cycle Diagram → Analysis → Diagram → XML → Diagram.
   - Count `versions?limit=1` during cycle. Must be 0 (session already loaded).

4. **Overlay pan/zoom does not trigger versions spam:**
   - Enable property overlays.
   - Pan and zoom.
   - Count `versions?limit=1`. Must be 0.

5. **No new console errors:**
   - Check browser console for new errors/warnings related to versions, hooks, or BPMN.

6. **No new mutation requests:**
   - Confirm no unexpected `PUT /bpmn` or `PATCH /sessions/` appeared.

7. **No unrelated files changed:**
   - Review `git diff --name-only`. Only `frontend/src/components/ProcessStage.jsx` (and potentially tightly coupled helpers in same file) should be modified.
   - Reject if backend, package files, overlay files, or AG-UI files are changed.

8. **Overlay viewport-culling still acceptable:**
   - Enable overlays.
   - Verify `.fpcPropertyOverlay` elements are visible and DOM count is stable (no duplication on pan/zoom/tab switch).
   - Reference: previous audit shows ~180 `.fpcPropertyOverlay` elements for a typical diagram.

## Review Verdict

### If any item fails (even minor):
- Write `REWORK_REQUEST.md` with:
  - Which checklist item failed.
  - Evidence (screenshot, network log excerpt, console error).
  - Specific change requested.
- Do NOT write `REVIEW_PASS`.
- Do NOT write `REVIEW_REPORT.md` as final.

### If all items pass:
- Write `REVIEW_REPORT.md` summarizing verification results.
- Write `REVIEW_PASS` empty marker file.

## Final Command

After finishing, run:
```bash
cd /opt/processmap-test
./tools/pm-agent-mirror-report.sh "fix/bpmn-versions-head-check-dedupe-v1" reviewer
```
