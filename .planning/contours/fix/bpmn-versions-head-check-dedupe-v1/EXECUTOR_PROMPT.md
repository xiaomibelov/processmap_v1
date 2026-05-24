# Agent 2 Executor Prompt

## Contour

- **Contour ID**: `fix/bpmn-versions-head-check-dedupe-v1`
- **Run ID**: `20260515T082930Z-7955`
- **Scope**: Frontend bounded fix for repeated BPMN versions head-check requests
- **Backend changes**: FORBIDDEN unless source proof shows frontend cannot fix and EXEC_BLOCKED is created first.

## Input Artifacts

Read these before starting:
1. `PLAN.md`
2. `RUNTIME_NAVIGATION.md`
3. `RUNTIME_PROOF_CHECKLIST.md`
4. `STATE.json`
5. Previous audit/review reports in `.planning/contours/audit/diagram-property-overlays-performance-gsd-v1/`

## Baseline Before Code

1. Reproduce versions head-check spam:
   - Open runtime at `http://clearvestnic.ru:5180`.
   - Open session `wewe` or any session with BPMN diagram.
   - Open Diagram tab; do NOT open history modal.
   - Open browser DevTools Network tab.
   - Filter by `bpmn/versions`.
   - Wait 10–30 seconds. Count `GET /bpmn/versions?limit=1` requests.
2. Record counts for:
   - Scenario A: normal Diagram idle
   - Scenario B: overlays visible + pan/zoom
   - Scenario C: tab switch cycle (Diagram → Analysis → Diagram → XML → Diagram)
3. Confirm root-cause hypothesis from PLAN.md H1–H11.

## Implementation Bounds

**Allowed changes:**
- `frontend/src/components/ProcessStage.jsx` — guard useEffect B (~line 5253), add cooldown ref.
- Minor helper changes in same file if needed (e.g., `lastHeadCheckAtRef`).

**Forbidden changes:**
- Backend files.
- `package.json` / lock files.
- `frontend/src/lib/api.js` or `apiRoutes.js` contract.
- BPMN XML mutation logic.
- Overlay viewport-culling logic.
- Product Actions / RAG / AG-UI.
- `.env` files.
- Commit / push / PR / deploy.

## Exact Implementation Tasks

1. **Guard useEffect B** (`refreshLatestBpmnRevisionHead` auto-trigger):
   - Remove `draft?.bpmn_xml_version` from the dependency array of the useEffect that auto-calls `refreshLatestBpmnRevisionHead`.
   - Keep `sid` in the dependency array so it still runs once on session load.
   - Keep `refreshLatestBpmnRevisionHead` callback available for explicit callers.

2. **Add cooldown / debounce:**
   - Add a ref `const lastHeadCheckRef = useRef({ sid: "", atMs: 0 });` near other refs.
   - In `refreshLatestBpmnRevisionHead` or in the useEffect, skip the call if the same `sid` was checked within `HEAD_CHECK_COOLDOWN_MS` (suggest 5000–10000 ms).
   - Explicit callers (import load, history modal open, explicit refresh button) should **bypass** the cooldown or reset it.

3. **Preserve explicit callers:**
   - Line ~5904 after BPMN import: keep `await refreshLatestBpmnRevisionHead()`.
   - History modal open: useEffect A (~line 5248) already calls `refreshSnapshotVersions`; keep it.
   - After save/publish: the save response already updates `latestBpmnVersionHead` directly (lines ~2045–2050). Do not add extra head-check there unless proven necessary.

4. **Ensure no regression:**
   - `refreshSnapshotVersions` must still work for history modal (full list) and for head-check (limit=1).
   - `bpmnVersionsListRequestRef` in-flight dedupe must remain intact.

## Validation Checklist

- [ ] Build passes (`npm run build` or project equivalent).
- [ ] Scenario A: 0 or 1 `versions?limit=1` call after initial load in 30s.
- [ ] Scenario B: no versions calls during pan/zoom/overlays.
- [ ] Scenario C: no versions calls during tab switch.
- [ ] Scenario D: history modal still loads versions list.
- [ ] Scenario E: version badge / draft-ahead state still correct after save.
- [ ] No PUT /bpmn or PATCH session introduced by fix.
- [ ] No new console errors.
- [ ] Overlay viewport-culling still works (`.fpcPropertyOverlay` visible, no DOM duplication).

## Deliverables

Create these files in the contour directory:

1. `EXEC_REPORT.md` — what was done, which hypothesis confirmed, files changed.
2. `NETWORK_BEFORE_AFTER.md` — request counts per scenario before and after fix.
3. `IMPLEMENTATION_NOTES.md` — any deviations from plan, risks encountered, cooldown value chosen.
4. `READY_FOR_REVIEW` — empty marker file.

If blocked:
- Create `EXEC_BLOCKED.md` explaining why.
- Do NOT create `READY_FOR_REVIEW`.

## Final Command

After finishing, run:
```bash
cd /opt/processmap-test
./tools/pm-agent-mirror-report.sh "fix/bpmn-versions-head-check-dedupe-v1" executor
```
