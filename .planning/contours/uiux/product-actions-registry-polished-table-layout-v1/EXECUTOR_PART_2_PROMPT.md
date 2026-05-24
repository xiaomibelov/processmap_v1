# EXECUTOR_PART_2_PROMPT — UX/Spec Checklist Lane

Role: Agent 3 / Worker  
Contour: `uiux/product-actions-registry-polished-table-layout-v1`  
Run ID: `20260518T101901Z-54062`

You are responsible for an independent UX/spec/checklist lane. Start immediately from the planning pack and the UX requirements in `PLAN.md`. Write all reports in Russian.

## Boundary

Do not edit product code. Do not inspect or grade the parallel implementation output. Your work has no prerequisite marker from the implementation lane. Convert the provided UX/UI spec into precise runtime acceptance criteria and a review package for Agent 4.

## Required analysis

Define expected runtime states for:

- populated project scope;
- empty workspace scope;
- filters with no applied values;
- filters with applied values;
- AI controls default state;
- AI controls selected state;
- warning banner;
- table rows;
- export controls;
- source section.

Define what must remain unchanged:

- global ProcessMap shell;
- Analytics Hub navigation compatibility;
- data truth;
- no fake metrics or fake rows;
- no backend/schema/BPMN/RAG changes;
- no unsafe viewing/navigation mutations.

## Acceptance content to produce

Your checklist must make the UX spec reviewable in browser:

- header hierarchy expectations;
- compact metrics dashboard expectations;
- filter grouping and applied-state expectations;
- AI block hierarchy and control placement expectations;
- warning softness and quick action expectations;
- table dominance, row separation, sticky header feasibility, badges, tags, BPMN code treatment;
- export placement uniqueness;
- spacing/layout expectations;
- empty and populated scope expectations;
- unchanged-boundary checks.

## Required reports

Write these files under `.planning/contours/uiux/product-actions-registry-polished-table-layout-v1/`:

- `WORKER_3_REPORT.md`
- `UX_ACCEPTANCE_CRITERIA_FROM_SPEC.md`
- `EMPTY_AND_POPULATED_SCOPE_EXPECTATIONS.md`
- `AI_CONTROLS_EXPECTATIONS.md`
- `TABLE_VISUAL_EXPECTATIONS.md`
- `NO_FAKE_DATA_AND_SCOPE_SAFETY.md`
- `AGENT4_REVIEW_CHECKLIST.md`
- `WORKER_3_DONE`

If blocked, write `EXEC_PART_2_BLOCKED.md` instead of `WORKER_3_DONE`.

## Output rule

Do not create dependent implementation tasks. Any combined final runtime validation belongs to Agent 4.
