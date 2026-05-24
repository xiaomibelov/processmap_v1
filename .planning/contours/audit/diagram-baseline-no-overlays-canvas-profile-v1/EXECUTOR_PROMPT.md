# EXECUTOR_PROMPT — audit/diagram-baseline-no-overlays-canvas-profile-v1

You are Agent 2 / Executor for ProcessMap.

## Identity & Scope
- Contour: `audit/diagram-baseline-no-overlays-canvas-profile-v1`
- Run ID: `20260515T112356Z-18129`
- Role: Agent 2 / Executor — profiling and evidence collection ONLY
- You do NOT write product code.
- You do NOT modify frontend/backend source files.
- You do NOT mutate BPMN XML, DB, .env, or durable truth.
- You do NOT commit/push/PR/deploy.

## Pre-flight
1. Read `PLAN.md` in this contour directory.
2. Read `RUNTIME_NAVIGATION.md`.
3. Read `RUNTIME_PROOF_CHECKLIST.md`.
4. Read `STATE.json`.
5. Read previous contour review reports:
   - `.planning/contours/audit/diagram-property-overlays-performance-gsd-v1/REVIEW_REPORT.md`
   - `.planning/contours/perf/diagram-property-overlays-viewport-culling-v1/REVIEW_REPORT.md`
   - `.planning/contours/fix/bpmn-versions-head-check-dedupe-v1/REVIEW_REPORT.md`
   - `.planning/contours/fix/diagram-non-edit-put-bpmn-guard-v1/REVIEW_REPORT.md`
   - `.planning/contours/perf/diagram-eventbus-listener-and-raf-coalescing-v1/REVIEW_REPORT.md`

## Source / Runtime Truth (re-capture at start)
Run and record:
```bash
cd /opt/processmap-test
pwd && whoami && hostname && date -Is
git status -sb
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
curl -s http://clearvestnic.ru:8088/health
curl -I http://clearvestnic.ru:5180
```

## Profiling Modes

Execute at minimum these 4 modes. Use Playwright/browser where feasible. Prefer deployed runtime `http://clearvestnic.ru:5180`.

### Mode 1 — Normal current Diagram
- Open runtime, open session `wewe` (or another available session), open Diagram tab.
- Property overlays as in normal user mode.
- Measure pan/zoom/selection/hover.

### Mode 2 — Overlays visually OFF
- Use UI toggle to turn visible overlays off.
- Verify `.fpcPropertyOverlay` count is 0 or near-0.
- Repeat pan/zoom/selection/hover.
- Compare to Mode 1.

### Mode 3 — ProcessMap decor pipeline isolated if possible
- Use existing UI/debug/toggle if available.
- If no safe toggle exists, use browser console to temporarily inspect whether `decorManager` functions are still invoked.
- Do NOT modify product code.
- Document what you find.

### Mode 4 — Pure-ish bpmn-js/SVG baseline
- No property overlays, no extra ProcessMap decorations if possible, no side panel interactions.
- Just pan/zoom/select.
- If impossible without code change, document limitation and source-based estimate.

### Optional Mode 5 — Large vs small diagram
- Find another session with larger/smaller diagram if available.
- Compare element counts and latencies.

## Runtime Scenarios (execute all)

### Scenario A — Baseline open
1. Open runtime.
2. Navigate to session.
3. Open Diagram tab.
4. Wait loaded/idle.
5. Capture:
   - time to visible canvas
   - `document.querySelectorAll('*').length`
   - `document.querySelectorAll('svg *').length`
   - `document.querySelectorAll('.djs-overlay').length`
   - `document.querySelectorAll('.fpcPropertyOverlay').length`
   - `document.querySelectorAll('[data-element-id]').length`
   - console errors
   - network mutations (PUT /bpmn, PATCH /sessions)

### Scenario B — Pan/zoom latency
1. Perform 5 pan/zoom cycles.
2. Measure DOM/overlay counts before/after.
3. Count network mutations.
4. Record console errors.

### Scenario C — Selection latency
1. Select 10 BPMN elements.
2. Measure DOM/overlay counts.
3. Record any React/render symptoms.
4. Confirm 0 mutations.

### Scenario D — Hover latency
1. Hover 10 BPMN elements.
2. Record flicker, UI delay, console errors.

### Scenario E — Tab return
1. Diagram → Analysis → Diagram.
2. Diagram → XML → Diagram.
3. Measure DOM/overlay counts after return.
4. Confirm no network/mutation regression.

### Scenario F — Overlays OFF comparison
1. Turn overlays off.
2. Repeat B/C/D.
3. Compare counts and subjective latency to overlays ON.
4. Answer: Is canvas still slow when `.fpcPropertyOverlay` is 0?

### Scenario G — Decor pipeline source/runtime check
1. Determine if overlay/decor calculations happen when overlays are off.
2. Use source map and browser evidence.
3. If runtime cannot show it, document source-level evidence (e.g., does `useBpmnSettledDecorFanout` still fire effects? does `decorManager` still get called?)

### Scenario H — Chrome Performance / trace if feasible
- If Playwright supports performance tracing, capture traces during pan/zoom and selection.
- Identify Scripting, Rendering, Painting, Layout, Long Tasks.
- If not feasible, document fallback.

## Measurement Plan

### DOM/SVG/overlay counts
Use these exact snippets (adjust selectors if needed and document):
```js
document.querySelectorAll('*').length
document.querySelectorAll('svg *').length
document.querySelectorAll('.djs-overlay').length
document.querySelectorAll('.fpcPropertyOverlay').length
document.querySelectorAll('[data-element-id]').length
```

### Network safety
Intercept or observe:
- PUT /bpmn
- PATCH /sessions
- /bpmn/versions?limit=1
- Any failed requests

### Timing
If possible:
- `performance.now()` around scripted interactions
- Playwright timing for pan/zoom/selection
- Chrome trace summary

### React/render churn
- Source-level inspect of props/deps in BpmnStage and ProcessStage
- Look for unstable dependency arrays, object literals passed as props, frequent state updates

### Derived map cost
- Inspect these files read-only:
  - `frontend/src/components/process/BpmnStage.jsx`
  - `frontend/src/components/ProcessStage.jsx`
  - `frontend/src/features/process/bpmn/stage/decor/decorManager.js`
  - `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js`
  - `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`
  - `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
- Document whether `useMemo` exists, whether deps are stable, whether maps rebuild on pan/zoom/selection/tab switch.

## Source Map Deliverable

Create `SOURCE_MAP.md` with exact paths, function names, line ranges, and analysis for each candidate in PLAN.md Section 8.

## Hypotheses Ranking

Create `HYPOTHESES_RANKING.md`. Rank H1–H10 with:
- Evidence for/against
- Confidence (High/Medium/Low)
- Which scenario/mode supports the conclusion

## Decision Matrix

Create `NEXT_CONTOUR_RECOMMENDATION.md` with decision matrix:

| Next Contour | When to choose | Evidence needed | Risk | Expected impact |
|-------------|----------------|-----------------|------|-----------------|
| perf/diagram-property-map-memoization-v1 | Heavy derived maps likely | Source map shows frequent rebuilds | Low | Medium |
| fix/diagram-decor-pipeline-disable-when-overlays-off-v1 | Decor pipeline runs with overlays off | Console/source proof of redundant calls | Low | Medium-High |
| perf/diagram-react-render-boundary-stabilization-v1 | React churn significant | Source map shows unstable props/deps | Low-Medium | Medium |
| perf/diagram-svg-css-repaint-reduction-v1 | Browser paint/layout dominates | Trace or DOM evidence | Medium | Medium |
| perf/diagram-readonly-lightweight-viewer-mode-v1 | Pure bpmn-js cost high | Mode 4 shows high lag even without decor | Medium | High |
| research/diagram-alternative-renderer-canvas-webgl-fit-v1 | SVG cannot handle target diagrams | All cheaper fixes insufficient | High | High |

Pick ONE primary next contour and ONE backup. Justify with evidence.

## Deliverables Checklist

- [ ] `EXEC_REPORT.md` — summary of what was done
- [ ] `BASELINE_PROFILE_REPORT.md` — full profiling results
- [ ] `SOURCE_MAP.md` — concrete source map
- [ ] `RUNTIME_EVIDENCE.md` — runtime observations
- [ ] `HYPOTHESES_RANKING.md` — ranked hypotheses
- [ ] `NEXT_CONTOUR_RECOMMENDATION.md` — decision matrix + recommendation
- [ ] `READY_FOR_REVIEW` — marker file
- [ ] `evidence/` directory with:
  - [ ] screenshots/
  - [ ] counts-before-after.md
  - [ ] network-summary.md
  - [ ] console-summary.md
  - [ ] performance-trace-summary.md (if feasible)
  - [ ] interaction-timings.md
  - [ ] decor-off-comparison.md

If blocked, create `EXEC_BLOCKED.md` and do NOT create `READY_FOR_REVIEW`.

## Final Command
After all files are written, run:
```bash
cd /opt/processmap-test
./tools/pm-agent-mirror-report.sh "audit/diagram-baseline-no-overlays-canvas-profile-v1" executor
```
