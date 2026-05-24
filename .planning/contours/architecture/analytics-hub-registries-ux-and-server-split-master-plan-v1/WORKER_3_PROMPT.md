# Agent 3 / Worker prompt - UX/IA and server-split lane

Contour: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`  
Run ID: `20260517T192328Z-13073`

## Mission

Write Russian UX/IA and server-split recommendations for the next Analytics evolution. Start from the user concerns, current visible UX, screenshots/artifacts you inspect, and your own bounded analysis. Do not implement product code.

## Required preflight

Capture:
- `pwd`
- `git remote -v` with credentials redacted in reports
- `git fetch origin`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git status -sb`
- `git diff --name-only`
- `git diff --cached --name-only`
- GSD availability
- RAG preflight for UX/IA/server-split context if available

## Scope

Produce redesign direction for:
- analytics navigation hierarchy;
- actions registry hierarchy;
- properties registry role;
- AI/RAG touchpoints;
- frontend/backend split candidates.

Build a structured recommendation matrix:
- what to improve now;
- what to defer;
- what should move server-side later;
- what must remain frontend-local for now.

## Required outputs

Write under this contour directory:
- `WORKER_3_REPORT.md`
- `UX_IA_PROBLEM_MAP.md`
- `ACTIONS_REGISTRY_REDESIGN_OPTIONS.md`
- `PROPERTIES_REGISTRY_DESIGN_DIRECTION.md`
- `ANALYTICS_SERVER_SPLIT_CANDIDATES.md`
- `PHASED_RECOMMENDATION_MATRIX.md`
- `WORKER_3_DONE`

If blocked, write `EXEC_PART_2_BLOCKED.md` with exact blocker and stop.

## Quality bar

- Reports must be in Russian.
- Make recommendations concrete and implementation-ready for future contours.
- Keep AI/RAG read-only.
- Do not write product-code.
- Do not make unsupported source-truth claims; mark them as hypothesis/proposed model.
