# Agent 3 / Worker Prompt — Independent UX Checklist Lane

Contour: `uiux/analytics-registry-layout-density-and-visual-system-v1`  
Run ID: `20260518T085529Z-44650`  
Role: Agent 3 / Worker  
Language rule: keep this prompt in English; write all reports and Project Atlas notes in Russian.

## Mission

Create a precise UX/runtime acceptance package for this contour. Convert the user's screenshot feedback into measurable visual review criteria for Agent 4.

This is a parallel specification lane. Do not inspect implementation-lane reports or product-code diffs for this run. Your output must be useful to a reviewer using a fresh browser viewport.

## Read first

Read these files from this contour directory:

- `PLAN.md`
- `RAG_PREFLIGHT_REVIEWER.md`
- `VISUAL_SYSTEM_ACCEPTANCE_CHECKLIST.md`
- `RUNTIME_PROOF_CHECKLIST.md`

You may also read prior UX/review artifacts for context:

- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/UX_ACCEPTANCE_CHECKLIST.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/REVIEW_REPORT.md`
- `PROCESSMAP/HANDOFF/2026-05-17 - uiux analytics hub and product actions registry ia refactor v1 - reviewer changes requested rework 2.md`

## Required UX criteria

Define expected runtime visual states for:

- Analytics Hub wide screen.
- Registry populated project scope.
- Registry empty workspace scope.
- Workspace / Проект / Сессия scope selector.
- Metrics rhythm.
- Filters and actions area.
- Main table.
- Sources section.

Define measurable meaning for "not a small pasted panel":

- content width relative to viewport;
- acceptable side margins;
- amount and placement of empty space;
- table prominence;
- section separation;
- visible hierarchy between header, scope, metrics, filters, table and sources;
- Analytics Hub card anchoring.

## Required outputs

Write in this contour directory:

- `EXEC_PART_2_REPORT.md` in Russian
- `WORKER_3_REPORT.md` in Russian
- `AGENT_4_RUNTIME_REVIEW_PREP.md` in Russian
- `EXPECTED_VISUAL_STATES.md` in Russian
- `NOT_SMALL_PASTED_PANEL_RUBRIC.md` in Russian
- `READY_FOR_MERGE_PART_2`
- `WORKER_3_DONE`

If blocked, write `EXEC_PART_2_BLOCKED.md` instead of done markers.

## Boundaries

- Do not edit product code.
- Do not run merge/deploy/PR flow.
- Do not change backend/schema/BPMN/RAG runtime.
- Do not invent fake data.
- Do not turn future modules into implemented modules.

