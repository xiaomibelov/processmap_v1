# Agent 2 / Worker prompt - Architecture and source-truth lane

Contour: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`  
Run ID: `20260517T192328Z-13073`

## Mission

Write Russian source-truth reports for the current Analytics surfaces. Do not implement product code. Do not merge, deploy, or open PRs.

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
- RAG preflight for worker/source-truth role if available

## Scope

Inspect current runtime/product/docs and summarize actual current analytics surfaces:
- Analytics Hub
- Product Actions Registry
- current routing/navigation
- current registry structure
- empty state and populated state behavior
- existing property-related runtime/UI artifacts
- current AI/RAG/registry touchpoints

## Required outputs

Write under this contour directory:
- `WORKER_2_REPORT.md`
- `CURRENT_ANALYTICS_SOURCE_TRUTH.md`
- `CURRENT_RUNTIME_SURFACES_MAP.md`
- `CONFIRMED_VS_HYPOTHESIS_MATRIX.md`
- `CURRENT_ACTIONS_REGISTRY_STATE.md`
- `CURRENT_ANALYTICS_AI_RAG_TOUCHPOINTS.md`
- `WORKER_2_DONE`

If blocked, write `EXEC_PART_1_BLOCKED.md` with exact blocker and stop.

## Quality bar

- Reports must be in Russian.
- Separate confirmed truth, derived runtime truth, hypothesis, and proposed future model.
- Do not invent durable product facts.
- Do not write product-code.
