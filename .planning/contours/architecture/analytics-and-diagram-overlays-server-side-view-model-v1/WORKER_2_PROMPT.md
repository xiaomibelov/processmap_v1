# Agent 2 / Worker — current source map lane

You are Agent 2 / Worker for ProcessMap.

Contour: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`
Run ID: `20260519T090224Z-17699`

## Output language

Write all docs/reports in Russian.

## Scope

Independent source map lane:
- Inspect frontend analytics/registry/overlay code.
- Inspect backend storage/API source truth.
- Map what is computed on frontend today.
- Identify heavy frontend candidates to move server-side.
- Do not implement product code.
- Do not change backend/frontend/schema/package files.

## Required runtime/source truth first

Record compactly in `WORKER_2_REPORT.md`:
- `pwd`
- `git remote -v` with credentials redacted
- `git fetch origin`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git status -sb`
- `git diff --name-only`
- `git diff --cached --name-only`

If unrelated changes block safe inspection, write `EXEC_PART_1_BLOCKED.md` and stop.

## Required analysis

### Frontend analytics map

Find where frontend currently:
- builds Product Actions Registry rows;
- builds current/future property-like rows;
- computes summary metrics;
- applies filters;
- builds source/session summaries;
- prepares exports;
- builds diagram overlay data;
- applies overlay decorations/classes;
- creates overlay DOM/SVG elements.

### Backend/source truth map

Identify backend truths:
- sessions;
- `interview.analysis.product_actions[]`;
- `bpmn_xml`;
- `bpmn_meta_json`;
- `nodes_json` / `edges_json`;
- project/workspace/session scope;
- existing APIs for sessions/actions/BPMN/meta.

Classify each item as:
- confirmed backend truth;
- frontend-derived only;
- hypothesis;
- future backend requirement.

## Suggested starting areas

- `frontend/src/components/process/analysis/`
- `frontend/src/features/process/analysis/`
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/features/process/bpmn/stage/`
- `frontend/src/features/process/stage/`
- `frontend/src/lib/api.js`
- `frontend/src/lib/apiRoutes.js`
- `backend/app/routers/product_actions_registry.py`
- `backend/app/routers/sessions.py`
- `backend/app/_legacy_main.py`
- `backend/app/storage.py`
- `backend/app/models.py`

## Required reports

Write under:
`.planning/contours/architecture/analytics-and-diagram-overlays-server-side-view-model-v1/`

- `WORKER_2_REPORT.md`
- `FRONTEND_ANALYTICS_COMPUTATION_MAP.md`
- `FRONTEND_OVERLAY_COMPUTATION_MAP.md`
- `BACKEND_SOURCE_TRUTH_MAP.md`
- `HEAVY_FRONTEND_CANDIDATES.md`
- `WORKER_2_DONE`

If blocked:
- `EXEC_PART_1_BLOCKED.md`

## Required report quality

- Use file paths and line references.
- Do not paste large file bodies.
- Distinguish confirmed source evidence from hypotheses.
- Do not propose mutation of BPMN XML or Product Actions durable truth.
- Mark existing backend endpoints separately from draft future endpoints.
