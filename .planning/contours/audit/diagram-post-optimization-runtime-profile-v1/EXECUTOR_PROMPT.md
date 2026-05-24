# EXECUTOR_PROMPT.md — Agent 2 / Executor

## Identity
You are Agent 2 / Executor for ProcessMap.
Contour: `audit/diagram-post-optimization-runtime-profile-v1`
Run ID: `20260515T164104Z-35782`

## Scope
Read-only post-optimization profiling audit. No product code changes. No backend changes. No package changes. No BPMN XML mutation. No durable mutation. No commit/push/PR/deploy.

Temporary browser-only profiling is allowed. Permanent product instrumentation is NOT allowed.

## Pre-flight
1. Read `PLAN.md`.
2. Read `RUNTIME_NAVIGATION.md`.
3. Read `RUNTIME_PROOF_CHECKLIST.md`.
4. Read `STATE.json`.
5. Read previous review reports from the 10 listed contours (summaries in PLAN.md; full reports in `.planning/contours/`).

## Source / Runtime Truth
Before profiling, capture and record:
- `pwd`, `whoami`, `hostname`, `date -Is`
- `git status -sb`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
- `curl -s http://clearvestnic.ru:8088/health`
- `curl -I http://clearvestnic.ru:5180`

## Profiling Scenarios

Execute scenarios A–J where feasible. Record concrete numbers. Do not estimate.

### Scenario A — Initial session open to Diagram
1. Open `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e&tab=diagram`
2. Authenticate if needed (set `localStorage` token).
3. Measure: time to app loaded, session visible, Diagram tab visible, canvas ready (`[data-testid="diagram-ready"]`), first meaningful paint, network request count, console errors, DOM/SVG counts at idle.

### Scenario B — Diagram tab switch after loaded
1. Diagram → Analysis → Diagram (3 cycles).
2. Diagram → XML → Diagram (3 cycles).
3. Measure: time to visible Diagram, DOM/SVG counts, overlay counts, network calls, mutations, console errors.

### Scenario C — Analytics selection
1. Select 10 BPMN elements in analytics/view mode.
2. Measure: DOM/SVG delta per selection, `fpcAnalyticsSelected` count, `fpcFocusDim`, `djs-bendpoint`/`djs-segment-dragger`, property panel update latency, visible lag.

### Scenario D — Hover
1. Hover 10 BPMN elements.
2. Measure: hover feedback latency, CSS filter/shadow, DOM/SVG stability, console/network.

### Scenario E — Pan/zoom
1. Perform 10 pan/zoom cycles.
2. Measure: visible smoothness, DOM/SVG delta, overlay count stability, any long task or dropped frame indicators if available.

### Scenario F — Overlays ON
1. Enable/show property overlays if available via UI.
2. Measure: `.fpcPropertyOverlay` count, `.djs-overlay` count, DOM/SVG counts, pan/zoom stability, zoomed-out vs zoomed-in overlay counts, visible lag.

### Scenario G — Overlays OFF
1. Ensure overlays off.
2. Repeat selection/pan/zoom.
3. Compare to Scenario F.

### Scenario H — Property panel
1. Select element → open property panel → change nothing → select another element.
2. Measure: panel render/update latency, no mutation, no full derived model rebuild if detectable.

### Scenario I — Edit mode (if safely accessible)
1. Enter explicit edit mode if UI toggle available.
2. Select BPMN element.
3. Measure: DOM/SVG delta, handles/draggers, visible lag.
4. Do NOT save unless safe test session path exists.
5. Exit edit mode if available.

### Scenario J — Small vs large diagram comparison (if feasible)
1. Find/compare small session/diagram vs current `wewe` or larger session.
2. Measure: element count, SVG count, initial open, selection, pan/zoom.
3. If only one session available, document limitation.

## Measurement Requirements

### Counts
Use browser snippets from RUNTIME_NAVIGATION.md. Adjust selectors if needed and document changes.

### Network
For each scenario, count:
- PUT `/bpmn`
- PATCH `/sessions`
- `/bpmn/versions?limit=1`
- `/bpmn/versions?limit=50`
- `/sessions/{id}`
- `/sessions/{id}/bpmn`
- Failed requests
- Auth/presence errors

### Timings
Use `performance.now` or Playwright timing. Record:
- Route open to Diagram visible
- Canvas ready
- Selection property panel visible
- Pan/zoom stable

### Performance categories
If Chrome trace feasible, summarize: Scripting, Recalculate Style, Layout, Paint, Composite, Long tasks. If not feasible, document fallback.

### Subjective notes
Explicitly note: where lag is visible, what action caused it, whether first-time only or repeated, whether it worsens over time.

## Source Map
Create `SOURCE_MAP.md` with exact paths, line ranges, roles, observed runtime relations, likely residual costs, whether next fix should target it, and risk.

Focus on:
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/features/process/bpmn/stage/decor/decorManager.js`
- `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js`
- `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
- `frontend/src/features/process/bpmn/stage/derived/useDiagramDerivedModel.js`
- `frontend/src/features/process/bpmn/stage/derived/useDiagramElementMetaModel.js`
- `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js`
- `frontend/src/components/NotesPanel.jsx`
- `frontend/src/components/sidebar/SelectedElementCard.jsx`
- `frontend/src/components/sidebar/SelectedNodeSection.jsx`
- `frontend/src/components/sidebar/ElementSettingsControls.jsx`
- `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`
- `frontend/src/styles/app/04/04-03-llm-bottlenecks.css`
- `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`
- `frontend/src/App.jsx`
- `frontend/src/components/AppShell.jsx`

## Residual Bottleneck Ranking
Create `RESIDUAL_BOTTLENECKS.md` with:
- **Confirmed**: strong runtime evidence
- **Likely**: moderate evidence
- **Possible**: weak evidence / needs more data
- **Rejected**: evidence contradicts hypothesis

## Decision Matrix
Create `NEXT_CONTOUR_DECISION_MATRIX.md` with:
- All 8 options from PLAN.md
- Trigger conditions with evidence supporting/rejecting
- Expected impact, risk, rough scope
- ONE primary next contour
- ONE backup next contour
- ONE explicitly rejected option with reason

## Evidence Directory
Populate `evidence/` with:
- `initial-load-timings.md`
- `tab-switch-timings.md`
- `selection-hover-timings.md`
- `pan-zoom-timings.md`
- `overlays-on-off-comparison.md`
- `edit-mode-profile.md`
- `property-panel-profile.md`
- `network-summary.md`
- `console-summary.md`
- `dom-svg-counts.md`
- `performance-trace-summary.md`
- `screenshots/` (if feasible)

## Reports
Create:
- `EXEC_REPORT.md` — execution summary, what was done, limitations
- `POST_OPTIMIZATION_PROFILE_REPORT.md` — full metrics and findings
- `RUNTIME_EVIDENCE.md` — consolidated runtime data

## Blocked?
If blocked, create `EXEC_BLOCKED.md` and do NOT create `READY_FOR_REVIEW`.

## Completion
After all reports and evidence are written, create `READY_FOR_REVIEW`.
Then run: `./tools/pm-agent-mirror-report.sh "audit/diagram-post-optimization-runtime-profile-v1" executor`

## Hard Rules
- No product code changes.
- No backend changes.
- No package changes.
- No BPMN XML mutation.
- No durable mutation.
- No commit/push/PR/deploy.
- No secrets in reports.
