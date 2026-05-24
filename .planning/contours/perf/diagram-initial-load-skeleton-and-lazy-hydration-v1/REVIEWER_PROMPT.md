# Agent 3 / Reviewer Prompt

## Identity
- **Contour**: `perf/diagram-initial-load-skeleton-and-lazy-hydration-v1`
- **Run ID**: `20260515T173112Z-38823`
- **Role**: Agent 3 / Reviewer
- **Scope**: Verify bounded implementation, runtime behavior, and no regressions.

## Pre-Review Checklist

Before review:
1. Read `PLAN.md` in this contour directory.
2. Read `EXEC_REPORT.md`.
3. Read `LOAD_PATH_SOURCE_MAP.md`.
4. Read `PERFORMANCE_BEFORE_AFTER.md`.
5. Read `IMPLEMENTATION_NOTES.md`.
6. Read `DECOMPOSITION_REPORT.md` if present.
7. Read `RUNTIME_PROOF_CHECKLIST.md`.

## Source Review

### Bounded Implementation
- [ ] Changes are limited to Diagram load/hydration performance.
- [ ] No backend files modified.
- [ ] No `.env` changes.
- [ ] No `package.json` / `package-lock.json` changes introduced by this contour.
- [ ] No BPMN XML mutation logic changed.
- [ ] No Product Actions / RAG / AG-UI files modified for this contour.
- [ ] No secrets exposed.

### Decomposition-First Verification
- [ ] If `ProcessStage.jsx` touched, line count did not increase significantly (target: flat or reduced).
- [ ] If `BpmnStage.jsx` touched, line count did not increase significantly (target: flat or reduced).
- [ ] New modules are bounded and single-responsibility.
- [ ] Heavy logic extracted BEFORE optimization added.

### Previous Fixes Preserved
- [ ] Overlay viewport culling preserved (`decorManager.js` viewport culling logic intact).
- [ ] Versions dedupe preserved (`bpmnVersionsListRequestRef` + cooldown ref in ProcessStage).
- [ ] Non-edit PUT guard preserved (`suppressEmitDiagramMutationRef` + wiring guards).
- [ ] Decor-off guard preserved (`propertiesOverlayDidClearRef` in `useBpmnSettledDecorFanout`).
- [ ] Selection-lite analytics mode preserved (analytics refs in BpmnStage).
- [ ] Derived maps render boundary preserved (primitive key deps in `useDiagramElementMetaModel`, `useDiagramDodQualityModel`).
- [ ] Repaint reduction preserved (CSS files untouched or bounded).

### Code Quality
- [ ] No `console.log` spam in new files.
- [ ] No broad refactor outside contour.
- [ ] Build passes (`npm run build` ✅).
- [ ] Existing tests still pass or pre-existing failures documented.

## Playwright Runtime Review

### Environment
- Runtime: `http://clearvestnic.ru:5180`
- Session: `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`)
- Browser: Playwright Chromium (resized to 1400×900)
- Auth: via `localStorage.setItem('fpc_auth_access_token', ...)` with dev admin credentials

### Scenario A — Cold Open Diagram
- [ ] Skeleton visible during load.
- [ ] Canvas visible before `diagram-ready` or earlier than baseline.
- [ ] `diagram-ready` marker appears.
- [ ] Record DOM/SVG counts at ready.

### Scenario B — Warm Tab Switch
- [ ] Analysis → Diagram shows visual feedback faster than baseline.
- [ ] XML → Diagram shows visual feedback faster than baseline.
- [ ] DOM stable on return (no leak).

### Scenario C — Interactions After Canvas First Paint
- [ ] Pan/zoom works.
- [ ] Analytics selection works.
- [ ] Property panel opens and updates correctly.
- [ ] Overlays appear after deferred hydration (if enabled).

### Scenario D — Safety
- [ ] 0 PUT `/bpmn` from load/tab switch/view interactions.
- [ ] 0 PATCH `/sessions` from load/tab switch/view interactions.
- [ ] `versions?limit=1` background polls only (≤ 5).
- [ ] Console: no new errors (pre-existing 401 on auth refresh acceptable).

### Regression Checks
- [ ] Overlay viewport culling preserved.
- [ ] Versions dedupe preserved.
- [ ] Non-edit PUT guard preserved.
- [ ] Decor-off guard preserved.
- [ ] Selection-lite analytics mode preserved.
- [ ] Derived maps / render boundary preserved.

## Strict Verdict

### If any issue remains (even minor):
- Create `CHANGES_REQUESTED`.
- Create `REWORK_REQUEST.md` with specific issues.
- **No `REVIEW_PASS`**.

### If all pass:
- Create `REVIEW_REPORT.md` with detailed findings.
- Create `REVIEW_PASS`.

## Notes
- If Playwright auth token injection fails, document the barrier and rely on source review + build/test evidence. Do not block on auth if internal consistency is strong.
- If before/after timing cannot be measured automatically, accept Agent 2's documented evidence if it is internally consistent and plausible.
