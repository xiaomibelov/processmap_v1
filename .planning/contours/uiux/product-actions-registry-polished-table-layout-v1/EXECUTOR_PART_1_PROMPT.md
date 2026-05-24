# EXECUTOR_PART_1_PROMPT — Implementation Lane

Role: Agent 2 / Worker  
Contour: `uiux/product-actions-registry-polished-table-layout-v1`  
Run ID: `20260518T101901Z-54062`

You are responsible for the bounded implementation lane for the Product Actions Registry page. Write all reports in Russian.

## Required first steps

1. Read the planning pack in `.planning/contours/uiux/product-actions-registry-polished-table-layout-v1/`.
2. Capture source/workspace truth before any product-code edit:
   - `pwd`
   - `git remote -v` but do not print secrets in reports
   - `git fetch origin`
   - `git branch --show-current`
   - `git rev-parse HEAD`
   - `git rev-parse origin/main`
   - `git status -sb`
   - `git diff --name-only`
   - `git diff --cached --name-only`
3. Branch hygiene is mandatory. The launcher checkout is known dirty. Use a clean worktree/branch from `origin/main` and apply only bounded registry UI changes, or document why the current checkout is safe in `BRANCH_HYGIENE_REPORT.md`. If you cannot isolate safely, write `EXEC_PART_1_BLOCKED.md` and stop.

## Implementation scope

Implement bounded UI changes for Product Actions Registry using existing React/Vite/CSS/Tailwind patterns already present in the repository. Do not migrate to TypeScript, do not install shadcn/ui, and do not add dependencies.

Touch only registry-related frontend components/styles unless a strictly necessary adjacent frontend edit is proven in your source map. Preserve all existing data flow, API contracts, Product Actions durable truth, AI behavior, BPMN XML, backend, schema, and RAG runtime.

## UX requirements

- Header hierarchy: make `Реестр действий с продуктом` visually stronger; subtitle readable and secondary; `Вернуться` compact and navigation-like; CSV/XLSX only once in the header as compact utility actions.
- Metrics dashboard: compact card/dashboard; values prominent but not huge; labels small/uppercase/secondary; subtle semantic coloring for `Полных` and `Неполных`; filtered count must not duplicate total with heavy emphasis.
- Filters: group main filters as `Группа`, `Товар`, `Тип`, `Этап`, `Категория`; group secondary filters as `Роль`, `Полнота`, `Сбросить`; applied filters must be visually detectable; reset can be calmer link/text action.
- AI block: keep label `AI-предложения`; make selection controls secondary toggle chips (`Все видимые`, `Без действий`, `Неполные`); make `AI: предложить действия` the primary CTA; place `Выбрано для AI: 0/10` next to the CTA and style it secondary; keep AI controls in the primary actions area, not in sources.
- Warning banner: soften incomplete-row warning; keep it above the table; add `Показать только неполные` only if safe and bounded; do not make it look like a critical system error.
- Table: make the table the main working area; add checkbox column only if existing selection logic supports it safely; sticky header is desirable if feasible without layout regressions; improve row separation, hover state, header calmness, consistent badges `Полная`/`Неполная`, compact tags, less dominant BPMN code.
- Row expansion/detail: implement only if safe and bounded; otherwise create a clear extension point/report.
- Layout: clearer spacing between sections; card-like section backgrounds where useful; avoid one continuous gray sheet and a narrow pasted-panel feel; use workspace width better while preserving readable margins.
- Export: CSV/XLSX only once, in the header area.
- Version: update the version row/build marker using the existing project pattern.

## Non-goals

No global ProcessMap shell/header/sidebar redesign. No Analytics Hub redesign beyond preserving navigation compatibility. No backend/schema/durable truth/BPMN/RAG changes. No AI behavior changes beyond visual placement. No package install. No fake data. No broad refactor. No merge, PR, or deploy.

## Required reports

Write these files under `.planning/contours/uiux/product-actions-registry-polished-table-layout-v1/`:

- `WORKER_2_REPORT.md`
- `SOURCE_MAP_WORKER_2.md`
- `UX_SPEC_IMPLEMENTATION_REPORT.md`
- `VISUAL_BEFORE_AFTER_REPORT.md`
- `VERSION_UPDATE_LEDGER_PROOF.md`
- `WORKER_2_VALIDATION_RESULTS.md`
- `WORKER_2_DONE`

If blocked, write `EXEC_PART_1_BLOCKED.md` instead of `WORKER_2_DONE`.

## Validation expectation

Run focused tests/build/lint checks that fit the actual repo patterns and your touched files. If a runtime check is feasible, include screenshots and evidence. Do not claim final visual acceptance; Agent 4 performs final runtime review.
