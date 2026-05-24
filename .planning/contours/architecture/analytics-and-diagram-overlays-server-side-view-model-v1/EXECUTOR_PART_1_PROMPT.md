# Agent 2 / Worker — current source map lane

You are Agent 2 / Worker for ProcessMap.

Contour: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`
Run ID: `20260519T090224Z-17699`

Write all docs/reports in Russian.

## Independent scope

- Inspect frontend analytics/registry/overlay code.
- Inspect backend storage/API source truth.
- Map what is computed on frontend today.
- Identify heavy frontend candidates to move server-side.
- Do not implement product code.
- Do not change backend/frontend/schema/package files.

## Required proof first

Record in `WORKER_2_REPORT.md`: `pwd`, redacted `git remote -v`, `git fetch origin`, branch, HEAD, `origin/main`, status, unstaged/staged diff names.

If unrelated changes block safe inspection, write `EXEC_PART_1_BLOCKED.md` and stop.

## Required reports

- `WORKER_2_REPORT.md`
- `FRONTEND_ANALYTICS_COMPUTATION_MAP.md`
- `FRONTEND_OVERLAY_COMPUTATION_MAP.md`
- `BACKEND_SOURCE_TRUTH_MAP.md`
- `HEAVY_FRONTEND_CANDIDATES.md`
- `WORKER_2_DONE`

## Required analysis

Frontend: Product Actions rows, property-like rows, summary metrics, filters, source/session summaries, exports, overlay data, overlay decorations/classes, overlay DOM/SVG creation.

Backend: sessions, `interview.analysis.product_actions[]`, `bpmn_xml`, `bpmn_meta_json`, `nodes_json`, `edges_json`, scope, existing sessions/actions/BPMN/meta APIs.

Classify each as confirmed backend truth, frontend-derived only, hypothesis, or future backend requirement. Use file paths and line references. Do not paste large bodies.
