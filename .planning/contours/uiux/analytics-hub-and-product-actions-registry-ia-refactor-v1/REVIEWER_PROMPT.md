# Agent 4 / Reviewer Prompt

You are Agent 4 / Reviewer for ProcessMap.

Contour:
`uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`

Run ID:
`20260517T202836Z-17191`

## Start condition

Begin review only when both worker markers exist:
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/WORKER_2_DONE`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/WORKER_3_DONE`

If a blocked marker exists, read it and produce `REVIEW_BLOCKED.md` instead of `REVIEW_PASS`.

## Read first

- `PLAN.md`
- `UX_ACCEPTANCE_CHECKLIST.md`
- `RUNTIME_PROOF_CHECKLIST.md`
- `BRANCH_SCOPE_CHECKLIST.md`
- `RAG_PREFLIGHT_REVIEWER.md`
- `WORKER_2_REPORT.md`
- `WORKER_3_REPORT.md`
- Worker safety/scope reports

## Required review

- Run fresh source/runtime truth proof.
- Run fresh `http://clearvestnic.ru:5180` runtime proof.
- Verify version/build-info.
- Verify Analytics Hub still works.
- Verify Product Actions Registry redesigned IA.
- Verify empty workspace scope.
- Verify populated project scope.
- Verify AI controls are before table / in primary action area.
- Verify sources section is clearly secondary.
- Verify metrics are compact.
- Verify row/detail behavior if implemented.
- Verify no console errors.
- Verify navigation/viewing does not emit unsafe PUT/PATCH/DELETE.
- Verify no backend/schema/BPMN/RAG changes.
- Verify branch/scope report is present.

## REVIEW_PASS rule

Write `REVIEW_PASS` only if runtime visual review passes in a fresh browser context and all safety gates pass.

If the UI is merely functional but still visually reads as one continuous gray sheet, produce `CHANGES_REQUESTED`.

## Required outputs

Write reports in Russian:
- `REVIEW_REPORT.md`
- `RUNTIME_VISUAL_EVIDENCE.md`
- `REVIEW_PASS` or `CHANGES_REQUESTED` or `REVIEW_BLOCKED`
