# Agent 3 / Reviewer Prompt

## Contour
- **ID**: `fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1`
- **Run ID**: `20260515T213952Z-52794`
- **Branch**: `fix/lockfile-sync-test`
- **Scope**: P0 decomposition-first fix for Diagram stuck loading state, canvas lifecycle readiness, visible runtime version marker, and usable BPMN canvas on clearvestnic.ru:5180

## Pre-Flight Checklist

1. Read `PLAN.md` in this directory.
2. Read `EXEC_REPORT.md`.
3. Read `DECOMPOSITION_REPORT.md`.
4. Read `LOADING_STATE_MACHINE_REPORT.md`.
5. Read `RUNTIME_VERSION_VISIBLE_PROOF.md`.
6. Read `STUCK_LOADING_ROOT_CAUSE.md`.
7. Read `RUNTIME_BEFORE_AFTER.md`.
8. Read `IMPLEMENTATION_NOTES.md`.
9. Read `RUNTIME_PROOF_CHECKLIST.md`.

## Source Review

### Scope Compliance
- [ ] Only frontend files modified for this contour.
- [ ] No backend changes.
- [ ] No `.env` changes attributable to this contour.
- [ ] No `package.json` / `package-lock.json` changes unless required for build-info generation.
- [ ] No BPMN XML mutation logic changed.
- [ ] No Product Actions / RAG / AG-UI files modified.
- [ ] No secrets exposed.

### Decomposition Quality
- [ ] New modules are bounded and single-responsibility.
- [ ] `BpmnStage.jsx` line count did not increase (or increased only due to import/integration lines).
- [ ] Heavy logic extracted BEFORE new features added.
- [ ] No broad refactor outside contour.

### Code Quality
- [ ] No `console.log` spam.
- [ ] Build passes (`npm run build` succeeds, 0 errors).
- [ ] Existing relevant tests pass.

## Runtime Version Review

Run:
```bash
cd /opt/processmap-test
git rev-parse HEAD
curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"
```

Verify:
- [ ] Source HEAD matches working tree.
- [ ] `build-info.json` SHA matches HEAD.
- [ ] `build-info.json` `contourId` equals `fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1`.
- [ ] Served JS/CSS assets match `frontend/dist/assets/`.
- [ ] `window.__PROCESSMAP_BUILD_INFO__` matches build-info.json.

## Playwright / Browser Runtime Review

### Fresh Context Setup
1. Open fresh browser context.
2. Navigate to `http://clearvestnic.ru:5180/?cb=<timestamp>`.
3. Authenticate.

### Visible Version Marker
- [ ] Version marker is visible in top/header or clearly visible in the same view as Diagram tab.
- [ ] Marker shows app version + short SHA + timestamp.
- [ ] Marker does not depend on footer being visible.

### Diagram Loading (Cold Open)
1. Open a session with Diagram.
2. Wait up to **20 seconds**.
3. Screenshot.
- [ ] "Загрузка диаграммы…" does NOT remain visible.
- [ ] Canvas is rendered OR explicit error panel with retry is shown.
- [ ] No repeated skeleton/canvas reload cycles.

### Diagram Loading (Warm Tab Switch)
1. From Analysis tab → Diagram. Wait **10 seconds**.
- [ ] Canvas renders or errors within 10s.
2. From XML tab → Diagram. Wait **10 seconds**.
- [ ] Canvas renders or errors within 10s.
3. Record any skeleton flash.

### DOM Stability
```js
document.querySelectorAll('.djs-container').length  // must be 1
document.querySelectorAll('.diagramSkeleton').length  // must be 0 after ready
document.querySelectorAll('.djs-bendpoint').length   // must be 0 in view mode
document.querySelectorAll('.djs-segment-dragger').length // must be 0 in view mode
document.querySelectorAll('.fpcPropertyOverlay').length  // overlays-off check if applicable
```
- [ ] `.djs-container` count stable at 1.
- [ ] No skeleton flapping.

### Interaction
- [ ] Pan/zoom usable after ready.
- [ ] Selection-lite works (shape click selects element).
- [ ] Property panel opens and updates.
- [ ] Overlays-off scenario works (if tested).
- [ ] No bpmn-js edit handles in view mode.

### Network / Mutation Safety
Filter network:
- PUT `/bpmn`
- PATCH `/sessions`
- `/bpmn/versions?limit=1`

- [ ] 0 PUT `/bpmn` from view interactions (shape click, zoom, pan, selection).
- [ ] 0 PATCH `/sessions` from view interactions.
- [ ] No versions spam (only expected background polls).

### Console
- [ ] 0 NEW console errors.
- [ ] 0 NEW console warnings.

## Strict Verdict Rules

**REVIEW_PASS is FORBIDDEN if ANY of the following are true:**

1. Diagram remains stuck at "Загрузка диаграммы…" after timeout (10s warm / 20s cold).
2. Visible version marker is missing or hidden.
3. Only source review passes but runtime browser test fails.
4. No material user-visible improvement.
5. Scope violations detected.
6. Build fails.
7. Skeleton flaps repeatedly.
8. Canvas remounts on tab switch.

## Review Output

If PASS:
- Write `REVIEW_REPORT.md` with evidence tables.
- Write `REVIEW_PASS` empty marker file.

If CHANGES_REQUESTED:
- Write `REVIEW_REPORT.md` with specific failures, screenshots, line references.
- Do NOT write `REVIEW_PASS`.
- List required rework items.

## Important
- Do not issue REVIEW_PASS based on source review alone.
- Fresh browser proof is MANDATORY.
- Screenshot-state failure is a HARD BLOCK.
