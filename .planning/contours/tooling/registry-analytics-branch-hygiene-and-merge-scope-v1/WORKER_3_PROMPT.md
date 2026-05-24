You are Agent 3 / Worker for ProcessMap.

Contour:
tooling/registry-analytics-branch-hygiene-and-merge-scope-v1

Run ID:
20260517T191023Z-10717

Your role:
Independent validation and runtime/test preservation planning.

Language contract:
- Write all reports in Russian.
- Do not print secrets.
- Sanitize remotes before reporting; never include tokens.

Read first:
- .planning/contours/tooling/registry-analytics-branch-hygiene-and-merge-scope-v1/PLAN.md
- .planning/contours/tooling/registry-analytics-branch-hygiene-and-merge-scope-v1/RAG_PREFLIGHT_PLANNER.md
- .planning/contours/tooling/registry-analytics-branch-hygiene-and-merge-scope-v1/RAG_PREFLIGHT_REVIEWER.md
- Existing completed contour reports for:
  - feature/process-analytics-hub-and-registry-navigation-v1
  - uiux/product-actions-registry-inner-page-safe-redesign-v1

Hard scope:
- This is not a UI implementation task.
- Do not write product code.
- Do not merge, deploy, push, or open a PR.
- Do not delete unrelated files.
- Do not run destructive git cleanup.
- Do not touch `.env`, secrets, or secret-like files.

Independent work:
1. Record source/runtime truth for your own report.
2. Inspect completed review and runtime evidence for Analytics Hub and Registry redesign.
3. Build a preservation checklist for changes that must survive branch isolation:
   - Analytics Hub exists;
   - `Реестр действий` is nested under Analytics;
   - `Реестр свойств`, `Дашборды`, `Экспорт` placeholders exist;
   - Registry works in populated project scope;
   - empty workspace scope keeps table shell and page structure;
   - AI controls appear before the table;
   - sources section appears after pagination;
   - visible/runtime version proof remains coherent with the accepted release story;
   - console/network stay clean for real runtime paths.
4. Identify focused tests and runtime checks that must be rerun once a clean branch is assembled.
5. Audit whether evidence/generated files appear to be mixed with source scope.
6. Prepare a checklist for Agent 4 to review the final merge-scope plan.

Required outputs under this contour directory:
- `WORKER_3_REPORT.md`
- `RUNTIME_VALIDATION_PRESERVATION_PLAN.md`
- `PRODUCT_CHANGE_PRESERVATION_CHECKLIST.md`
- `EVIDENCE_AND_GENERATED_ARTIFACTS_AUDIT.md`
- `TESTS_TO_RERUN_AFTER_ISOLATION.md`
- `AGENT4_REVIEW_CHECKLIST.md`
- `WORKER_3_DONE`

If blocked:
- Write `EXEC_PART_2_BLOCKED.md` with exact blocker, commands run, and safest next action.
- Do not create `WORKER_3_DONE`.

Completion marker:
Create `WORKER_3_DONE` only after all required reports exist.
