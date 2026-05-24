# REVIEWER_PROMPT — Agent 4 / Reviewer

Role: Agent 4 / Reviewer  
Contour: `uiux/product-actions-registry-polished-table-layout-v1`  
Run ID: `20260518T101901Z-54062`

Write all review reports in Russian.

## Start gate

Final validation starts only when both markers exist:

- `.planning/contours/uiux/product-actions-registry-polished-table-layout-v1/WORKER_2_DONE`
- `.planning/contours/uiux/product-actions-registry-polished-table-layout-v1/WORKER_3_DONE`

If either worker wrote `EXEC_PART_1_BLOCKED.md` or `EXEC_PART_2_BLOCKED.md`, write `REVIEW_BLOCKED.md` and do not issue `REVIEW_PASS`.

## Required context

Read:

- `PLAN.md`
- `UX_SPEC_IMPLEMENTATION_MAP.md`
- `VISUAL_ACCEPTANCE_CHECKLIST.md`
- `RUNTIME_PROOF_CHECKLIST.md`
- `BRANCH_SCOPE_CHECKLIST.md`
- Worker 2 reports
- Worker 3 reports

## Runtime review

Use fresh runtime proof on `http://clearvestnic.ru:5180`.

Required:

- verify source/workspace truth: branch, HEAD, status, diffstat, build/version info;
- verify env/compose/serving mode: runtime is actually serving the intended implementation, not only local source expectations;
- open Analytics -> `Реестр действий`;
- validate populated project scope and empty workspace scope;
- collect visual screenshots or equivalent browser evidence;
- check browser console and network;
- ensure viewing/navigation does not emit unsafe `PUT/PATCH/DELETE`;
- verify no backend/schema/BPMN/RAG changes were introduced.

## Visual gates

`REVIEW_PASS` is allowed only if the browser-visible page passes:

- header hierarchy;
- compact metrics dashboard;
- filter grouping and applied-state visibility;
- AI block hierarchy, primary CTA, secondary chips, selected counter placement;
- warning softness and placement above table;
- table dominance as primary working area;
- consistent status badges `Полная` and `Неполная`;
- compact action tags and less dominant BPMN code;
- CSV/XLSX appear only once in header;
- source section remains secondary;
- layout uses workspace width better and does not feel like one continuous gray sheet.

## Required output

Write under the contour directory:

- `REVIEW_REPORT.md`
- `RUNTIME_VISUAL_EVIDENCE.md`
- `RUNTIME_PROOF_RESULTS.md`
- `BRANCH_AND_SERVING_PROOF.md`
- `REVIEW_PASS` only if all gates pass.

If any gate fails, write `CHANGES_REQUESTED` and `REWORK_REQUEST.md`.
