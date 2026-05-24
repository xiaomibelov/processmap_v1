# Agent 3 / Reviewer Prompt

## Contour
- **ID**: `fix/diagram-5180-version-proof-and-canvas-lag-regression-v1`
- **Run ID**: `20260515T193732Z-46002`
- **Scope**: P0 combined runtime-version-proof and Diagram canvas lag/reload regression fix for ProcessMap test runtime on clearvestnic.ru:5180

## Read Before Reviewing
1. `PLAN.md`
2. `EXEC_REPORT.md`
3. `RUNTIME_VERSION_PROOF.md`
4. `REGRESSION_ROOT_CAUSE.md`
5. `RUNTIME_BEFORE_AFTER.md`
6. `DELIVERY_LOOP_NOTES.md`
7. `IMPLEMENTATION_NOTES.md`
8. `RUNTIME_PROOF_CHECKLIST.md`
9. `STATE.json`

## Review Checklist

### A. Source / Runtime Version Review
- [ ] Verify source HEAD matches `git rev-parse HEAD` in working tree.
- [ ] Verify build marker file exists in source (`frontend/src/generated/buildInfo.js` or build script).
- [ ] Verify `frontend/public/build-info.json` exists in source.
- [ ] Verify `curl http://clearvestnic.ru:5180/build-info.json` returns current SHA and timestamp.
- [ ] Verify served `index.html` asset references match `frontend/dist/assets/` hashes.
- [ ] Verify container/build evidence is documented in `DELIVERY_LOOP_NOTES.md`.
- [ ] If runtime version is stale or does not match source → **REVIEW_BLOCKED** or **CHANGES_REQUESTED**.

### B. Browser Runtime Review (Playwright Fresh Context)
1. Open fresh browser context.
2. Navigate to `http://clearvestnic.ru:5180/?cb=<timestamp>`.
3. Verify `window.__PROCESSMAP_BUILD_INFO__` exists and shows:
   - `sha` or `shaShort` matching source HEAD.
   - `timestamp` within reasonable window of build/deploy.
   - `contourId` matching this contour.
4. Take screenshot of UI marker if visible.
5. Authenticate (token injection or dev bypass).
6. Open Diagram session (`wewe` / `Описание процессов Долгопрудный` known baseline).

### C. Cold Open Review
- [ ] No repeated skeleton/canvas loading cycles.
- [ ] `diagramReady` does not flap (true→false→true) without user action.
- [ ] BpmnStage does not remount repeatedly.
- [ ] Console has 0 NEW errors.

### D. Tab Switch Review
- [ ] Analysis ↔ Diagram does not feel like full reload.
- [ ] XML ↔ Diagram does not feel like full reload.
- [ ] No skeleton flash on return to already-loaded Diagram.
- [ ] `.djs-container` count stays at 1 across tab switches.
- [ ] DOM/SVG counts stable.

### E. Pan/Zoom Review
- [ ] Pan/zoom is usable after stable load.
- [ ] Transform updates smoothly.
- [ ] No visible lag or stutter.

### F. Selection / Property Panel Review
- [ ] Selection-lite works in analytics/view mode.
- [ ] Property panel opens and updates correctly.
- [ ] No `djs-bendpoint` or `djs-segment-dragger` in view mode.
- [ ] No `fpcFocusDim` mass update in analytics mode.

### G. Network / Mutation Safety
- [ ] 0 PUT `/bpmn` from view interactions.
- [ ] 0 PATCH `/sessions` from view interactions.
- [ ] `versions?limit=1` polls only as background behavior (pre-existing).
- [ ] No versions spam regression.

### H. Scope Compliance
- [ ] Only frontend files modified for lag fix.
- [ ] No backend changes.
- [ ] No `.env` changes attributable to this contour.
- [ ] No `package.json` / `package-lock.json` changes unless build flow required and documented.
- [ ] No BPMN XML mutation logic changed.
- [ ] No Product Actions / RAG / AG-UI files modified.
- [ ] No secrets exposed.

## Verdict Rules

### REVIEW_BLOCKED
Use if:
- Runtime version proof is completely missing.
- `curl` to 5180 build-info fails.
- Browser marker does not match source HEAD.
- Cannot open 5180 at all.

### CHANGES_REQUESTED
Use if:
- Runtime version proof exists but shows stale build.
- No material lag/reload improvement observed.
- Tab switch still feels like reload.
- Skeleton still flaps.
- Pan/zoom still unusable.
- New console errors introduced.
- PUT/PATCH triggered by view interactions.
- Scope violations detected.

### REVIEW_PASS
Use ONLY if ALL criteria pass:
- Runtime version proof is present and verified fresh.
- Material improvement in lag/reload behavior.
- All safety checks pass.
- Scope compliance confirmed.

## Output
- Create `REVIEW_REPORT.md` with detailed findings per checklist section.
- Create `REVIEW_PASS` marker file if verdict is pass.
- If CHANGES_REQUESTED or REVIEW_BLOCKED, document specific required changes.
