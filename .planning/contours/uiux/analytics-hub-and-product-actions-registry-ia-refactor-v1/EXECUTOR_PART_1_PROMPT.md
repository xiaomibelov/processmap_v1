# Agent 2 / Worker Prompt - Implementation Lane

You are Agent 2 / Worker for ProcessMap.

Contour:
`uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`

Run ID:
`20260517T202836Z-17191`

## Mission

Implement the bounded frontend IA/UI refactor for Analytics Hub and Product Actions Registry. Do not write backend code, schema changes, BPMN XML mutation logic, RAG runtime changes, or global shell/header/sidebar redesign.

## Read first

- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/PLAN.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/UX_ACCEPTANCE_CHECKLIST.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/BRANCH_SCOPE_CHECKLIST.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/RAG_PREFLIGHT_PLANNER.md`
- `.planning/contours/architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1/PRODUCT_ACTIONS_REGISTRY_REDESIGN_DIRECTION.md`
- `.planning/contours/architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1/ANALYTICS_INFORMATION_ARCHITECTURE.md`

## Branch hygiene

The current launcher checkout has dirty-history risk. Before product-code edits, either:
- create/use a clean worktree or branch from current `origin/main` and apply only bounded Analytics/Registry changes, or
- explicitly document why continuing the current checkout is safe.

Do not silently continue a dirty non-merge-ready tree. If safe isolation is not possible, create:
`.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/EXEC_PART_1_BLOCKED.md`

## Implementation scope

Touch only frontend files required for:
- Analytics Hub entry into Product Actions Registry;
- Product Actions Registry page hierarchy;
- main registry table;
- optional expandable row/detail affordance;
- secondary `Источники данных` section;
- AI controls placement;
- compact scope/metrics/filters/actions;
- related tests/styles/version marker.

Expected file area may include:
- `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/process/analysis/registry/**`
- related Analytics/Registry tests
- narrowly related styles
- version/build-info file by existing repo pattern

## UX requirements

- Keep `Аналитика` as top-level surface.
- Keep cards: `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
- Make `Реестр действий` visually lead into redesigned registry.
- Keep `Реестр свойств` as placeholder/card only.
- Separate `Workspace`, `Проект`, `Сессия` into useful visual scope blocks.
- Reduce metrics visual weight.
- Place AI controls in the primary action/filter area before the table.
- Keep CSV/XLSX compact utility actions.
- Keep `Вернуться` clear as navigation.
- Make table the primary content.
- Make `Источники данных` secondary and clearly separated.
- Empty workspace scope must still show structure: title, scope, metrics, filters/actions, AI controls, table shell/headers or deliberate empty table shell, empty-state message, pagination shell if appropriate.
- Add expandable row/detail pattern if feasible with existing data. If not feasible, document why and leave a clear extension point.

## Non-goals

- No backend changes.
- No schema changes.
- No BPMN XML mutation.
- No Product Actions durable truth changes.
- No RAG runtime changes.
- No AI auto-write.
- No full Properties Registry implementation.
- No Diagram performance work.
- No global shell/header/sidebar redesign.
- No package install.
- No fake data or fake metrics.
- No merge, PR, or deploy.

## Required outputs

Write reports in Russian under the contour directory:
- `WORKER_2_REPORT.md`
- `BRANCH_SCOPE_REPORT.md`
- `IMPLEMENTATION_SCOPE_REPORT.md`
- `RUNTIME_SELF_CHECK.md` if you run local runtime checks
- `WORKER_2_DONE`

If blocked:
- `EXEC_PART_1_BLOCKED.md`

The `WORKER_2_DONE` marker must contain the run ID.
