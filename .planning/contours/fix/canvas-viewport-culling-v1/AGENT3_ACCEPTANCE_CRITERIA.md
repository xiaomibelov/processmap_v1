# Agent 3 Acceptance Criteria

## A. Performance Improvement (PASS required)

1. **Large diagram FPS during pan ≥ 45** (was ~30).
   - Measurement: Chrome DevTools FPS meter during 3-second continuous pan.
   - Pass if median FPS ≥ 45 across 3 trials.

2. **SVG node count during pan ≤ 1500** (was 3754).
   - Measurement: `document.querySelectorAll('svg *').length` during pan.
   - If using `display:none` fallback, visible node count must be ≤ 1500.
   - Pass if count ≤ 1500 during pan on large diagram.

3. **Long tasks during pan ≤ 50 ms total** (was 148 ms).
   - Measurement: Chrome DevTools Performance flame chart.
   - Pass if sum of all tasks > 50 ms during 3-second pan ≤ 50 ms.

4. **Small diagram FPS remains 60** (no regression).
   - Measurement: same as #1 on small diagram.
   - Pass if median FPS = 60 across 3 trials.

## B. Functionality Preservation (PASS required)

1. **Zoom in/out works correctly.**
   - Test: zoom to 0.1, 0.3, 0.5, 1.0, 2.0.
   - Pass if canvas renders without errors at all levels.

2. **Element selection works.**
   - Test: click on visible shape, click on visible connection.
   - Pass if selection highlight appears.

3. **Element drag/move works.**
   - Test: drag a task shape to a new position.
   - Pass if shape moves and connections update.

4. **Overlay badges appear when element is visible.**
   - Test: enable property overlays, pan element into viewport.
   - Pass if overlay appears after element becomes visible.

5. **Connection lines render correctly for viewport-crossing edges.**
   - Test: pan so only middle of a connection is visible.
   - Pass if connection line is visible and not clipped to a point.

6. **Selection handles appear for visible selected elements.**
   - Test: select element, pan it partially off-screen.
   - Pass if handles remain visible for on-screen portion.

## C. Code Quality (PASS required)

1. **No bpmn-js core files modified.**
   - Verification: `git diff --name-only` must not include `node_modules/`.

2. **Changes isolated to React wrapper/component and bounded decor files.**
   - Allowed files: `BpmnStage.jsx`, `wireBpmnStageRuntimeEvents.js`, `decorManager.js`, optional new utility module.

3. **No memory leaks introduced.**
   - Verification: heap snapshot after 5 pan cycles + 10 s wait must recover to baseline ±10%.

## D. Runtime (PASS required)

1. **:5177 serves current build.**
   - Verification: `curl -I http://localhost:5177` returns HTTP 200.

2. **No console errors.**
   - Verification: browser console during pan/zoom/selection shows 0 new errors.

3. **No 502 errors.**
   - Verification: Network tab shows no 502 responses during testing.

## Final Verdict

- **REVIEW_PASS** only if A + B + C + D pass.
- **CHANGES_REQUESTED** if any target in A missed, or any functionality in B broken, or any quality gate in C failed, or runtime unstable in D.
