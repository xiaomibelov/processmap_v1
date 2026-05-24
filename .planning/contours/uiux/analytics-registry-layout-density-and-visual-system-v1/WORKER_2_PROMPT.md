# Agent 2 / Worker Prompt — Implementation Lane

Contour: `uiux/analytics-registry-layout-density-and-visual-system-v1`  
Run ID: `20260518T085529Z-44650`  
Role: Agent 2 / Worker  
Language rule: keep this prompt in English; write all reports and Project Atlas notes in Russian.

## Mission

Implement a bounded frontend-only visual/layout refinement for Analytics Hub and Product Actions Registry inner page so they feel like native polished ProcessMap workspace pages, not a narrow centered panel inside a large blank workspace.

## Read first

Read these files from this contour directory:

- `PLAN.md`
- `VISUAL_SYSTEM_ACCEPTANCE_CHECKLIST.md`
- `RUNTIME_PROOF_CHECKLIST.md`
- `BRANCH_SCOPE_CHECKLIST.md`
- `RAG_PREFLIGHT_PLANNER.md`

Also review relevant prior reports only as context:

- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/REVIEW_REPORT.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/UX_ACCEPTANCE_CHECKLIST.md`
- `PROCESSMAP/HANDOFF/2026-05-17 - uiux analytics hub and product actions registry ia refactor v1 - reviewer changes requested rework 2.md`

## Mandatory branch hygiene

Before editing product code, run and record:

- `pwd`
- `git remote -v` (do not print credentials in reports)
- `git fetch origin`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git status -sb`
- `git diff --name-only`
- `git diff --cached --name-only`

The launcher checkout is known dirty. You must either:

- work in a clean worktree/branch from `origin/main` with only bounded frontend changes, or
- explicitly document why the current checkout is safe for this visual-only contour.

If you cannot isolate safely, stop and create `EXEC_PART_1_BLOCKED.md`.

## Allowed implementation scope

Touch only Analytics Hub / Product Actions Registry frontend files and scoped styles. Expected candidates:

- `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/process/analysis/registry/`
- scoped CSS/style files already used by those components
- focused tests for these components if needed
- app version/build marker file if the established workflow requires a version row update

Do not modify global shell/header/sidebar, backend, schema, BPMN XML, RAG tools/runtime, durable Product Actions truth, AI behavior, package files, or unrelated diagram code.

## UX changes to implement

- Increase effective content max-width on wide screens while keeping comfortable side margins.
- Avoid the small centered card feeling.
- Make Analytics Hub cards larger, more anchored, and less isolated.
- Make `Реестр действий` the primary available Analytics module.
- Keep `Реестр свойств`, `Дашборды`, `Экспорт` as future modules without fake implementation.
- Strengthen Product Actions Registry hierarchy: header/navigation, scope selector, compact metrics, filters/actions, warning, main table, sources.
- Make the registry table the dominant object: wide container, clearer header, readable rows, persistent table shell in empty state, pagination visibly connected to the table.
- Make Workspace / Проект / Сессия scope controls meaningful: clear selected state, readable values/subtitles, no disabled-placeholder look for active controls.
- Keep metrics compact but visually useful; avoid oversized or all-gray blocks.
- Keep filters visible and structured.
- Keep AI controls in the primary action/filter area before the table.
- Keep CSV/XLSX compact utility actions.
- Keep `Вернуться` clear as navigation.
- Keep sources secondary and visually separated after pagination.
- Use subtle borders, clear background separation, calm readable typography, no heavy shadows or aggressive gradients.

## Runtime/data behavior to preserve

- Existing data flow.
- Empty workspace scope.
- Populated project scope.
- Session/project/workspace route semantics.
- AI controls behavior and placement before table.
- Sources after pagination/secondary area.
- No fake data.
- No unsafe Product Actions/BPMN writes from viewing/navigation.

## Verification expected

Run focused validation appropriate for touched frontend files. At minimum, try the existing focused Product Actions Registry/Analytics tests if present, and run a build if practical in the selected worktree. If a validation command is unavailable or blocked, document why in Russian.

## Required outputs

Write in this contour directory:

- `EXEC_PART_1_REPORT.md` in Russian
- `WORKER_2_REPORT.md` in Russian
- `BRANCH_HYGIENE_REPORT.md` in Russian
- `RUNTIME_VISUAL_SELF_CHECK.md` in Russian if runtime/browser evidence was collected
- `READY_FOR_MERGE_PART_1`
- `WORKER_2_DONE`

If blocked, write `EXEC_PART_1_BLOCKED.md` instead of done markers.

