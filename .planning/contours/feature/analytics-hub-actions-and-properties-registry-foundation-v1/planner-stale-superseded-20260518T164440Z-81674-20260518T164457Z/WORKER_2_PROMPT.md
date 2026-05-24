# Agent 2 / Worker prompt

Contour: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`  
Role: Agent 2 / Worker, implementation lane

Write all reports in Russian.

## Read first

- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/PLAN.md`
- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/ANALYTICS_RESTORE_REQUIREMENTS.md`
- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/ACTIONS_REGISTRY_INNER_PAGE_RULES.md`
- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/PROPERTIES_REGISTRY_FOUNDATION_PLAN.md`
- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/BRANCH_SCOPE_CHECKLIST.md`
- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/STATE.json`

## Branch hygiene is mandatory

The launcher checkout is dirty. Before product-code edits, use a clean worktree/branch from `origin/main` and apply only bounded Analytics/Registry files, or explicitly document why the current checkout is safe.

Do not silently keep adding product changes to a dirty non-merge-ready branch.

Record in reports:

```bash
pwd
git remote -v
git fetch origin
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git diff --name-only
git diff --cached --name-only
```

Redact credential-bearing remotes in reports.

## Implementation scope

- Restore/wire top-level `Аналитика`.
- Add module entries:
  - `Реестр действий`
  - `Реестр свойств`
  - `Дашборды`
- Do not add separate top-level `Экспорт` card/module in Analytics.
- Wire `Реестр действий` to the current Product Actions Registry page.
- Add `Реестр свойств` foundation page/placeholder.
- Keep `Дашборды` as future placeholder.
- Ensure `Вернуться` from inner pages returns to Analytics.
- Preserve/refine current Product Actions Registry inner-page visual rules.
- Update version row.

## Actions Registry visual gate

Inside `Реестр действий с продуктом`:

- one unified white content container;
- no gradients;
- no dotted borders;
- no colored metric cards;
- no internal shadows;
- light separators;
- table as primary content;
- CSV/XLSX in header;
- AI controls in primary area;
- sources separated and secondary;
- empty workspace scope still shows structure;
- populated project scope shows rows and controls;
- no fake data.

## Properties Registry foundation gate

Create a safe foundation only:

- title `Реестр свойств`;
- description `Сводный список свойств BPMN-элементов и процессных объектов.`;
- if real property data is safely accessible, show minimal read-only shell/table and document source;
- otherwise show structured placeholder with planned groups/types and no fake rows/counts.

Do not invent durable backend truth, mutate BPMN XML, or reuse Product Actions truth as properties truth.

## Non-goals

- No full dashboard implementation.
- No separate Export module/card.
- No backend/schema implementation unless source truth proves an existing frontend runtime requirement.
- No BPMN XML mutation.
- No Product Actions durable truth mutation.
- No RAG runtime or auto-indexer implementation.
- No AI auto-write.
- No package install.
- No global shell/header/sidebar redesign.
- No PR/merge/deploy.

## Required outputs

- `WORKER_2_REPORT.md`
- `SOURCE_MAP_WORKER_2.md`
- `ANALYTICS_RESTORE_IMPLEMENTATION_REPORT.md`
- `ACTIONS_REGISTRY_NAVIGATION_REPORT.md`
- `PROPERTIES_REGISTRY_FOUNDATION_REPORT.md`
- `VERSION_UPDATE_LEDGER_PROOF.md`
- `WORKER_2_VALIDATION_RESULTS.md`
- `WORKER_2_DONE`
- `READY_FOR_MERGE_PART_1`

If blocked, create `EXEC_PART_1_BLOCKED.md` and do not create done/merge markers.
