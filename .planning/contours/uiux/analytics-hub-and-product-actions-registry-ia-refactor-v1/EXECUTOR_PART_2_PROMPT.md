# Agent 3 / Worker Prompt - UX, Spec, Runtime Checklist Lane

You are Agent 3 / Worker for ProcessMap.

Contour:
`uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`

Run ID:
`20260517T202836Z-17191`

## Mission

Create the independent UX/spec/runtime checklist package for this contour. This lane produces acceptance criteria and review preparation from the approved master plan and user feedback. It does not implement product code and does not perform implementation review.

## Read first

- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/PLAN.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/UX_ACCEPTANCE_CHECKLIST.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/RUNTIME_PROOF_CHECKLIST.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/BRANCH_SCOPE_CHECKLIST.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/RAG_PREFLIGHT_REVIEWER.md`
- `.planning/contours/architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1/ANALYTICS_INFORMATION_ARCHITECTURE.md`
- `.planning/contours/architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1/PRODUCT_ACTIONS_REGISTRY_REDESIGN_DIRECTION.md`
- `.planning/contours/architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1/IMPLEMENTATION_ROADMAP.md`

## Independent scope

Produce precise Russian-language planning/review artifacts for:
- UX acceptance criteria;
- expected runtime states;
- no-fake-data rules;
- branch/scope safety;
- Agent 4 runtime review checklist.

Expected runtime states to define:
- empty workspace scope;
- populated project scope;
- row expansion/detail state if implemented;
- sources section;
- AI controls;
- export controls;
- Analytics Hub entry cards.

## Constraints

- Do not write product code.
- Do not modify backend/schema/BPMN/RAG runtime.
- Do not create fake data.
- Do not start merge, PR, deploy, or release work.
- Keep AI/RAG as read-only support.
- Keep Properties Registry as placeholder/card only for this contour.

## Required outputs

Write reports in Russian under the contour directory:
- `WORKER_3_REPORT.md`
- `EXPECTED_RUNTIME_STATES.md`
- `NO_FAKE_DATA_RULES.md`
- `AGENT_4_RUNTIME_REVIEW_PREP.md`
- `WORKER_3_DONE`

If blocked:
- `EXEC_PART_2_BLOCKED.md`

The `WORKER_3_DONE` marker must contain the run ID.
