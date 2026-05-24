# Agent 4 runtime review prep

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`

## Review start prerequisites

- `WORKER_2_DONE` exists.
- `WORKER_3_DONE` exists.
- Merge-level `EXEC_REPORT.md`, `EXECUTION_RUN_ID`, `READY_FOR_REVIEW` exist after both parts are merged.
- Source/runtime truth recorded again at review time.
- No secrets from `git remote -v` are copied into report.

## Required source/workspace proof

Record:

- `pwd`
- sanitized `git remote -v`
- `git fetch origin`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git status -sb`
- `git diff --name-only`
- `git diff --cached --name-only`

Review must explicitly classify:

- code plane: branch/commit that contains implementation.
- workspace plane: checkout/worktree being reviewed.
- DB plane: real returned Product Actions data for empty and populated scenarios.
- env/compose plane: active runtime/server stack.
- serving mode plane: build actually served by `http://clearvestnic.ru:5180`.

## Runtime serving checks

- `curl -I http://clearvestnic.ru:5180` returns `200`.
- Headers prove fresh/no-cache behavior or the expected equivalent.
- Fresh browser context with cache-busting query.
- Served build-info/window marker/UI badge matches reviewed source HEAD/contour.
- If served build != intended source, verdict is blocked until aligned.

## Browser scenarios

1. Open Analytics Hub.
2. Confirm cards: `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
3. Navigate from Hub to `Реестр действий`.
4. Open Product Actions Registry direct route.
5. Test empty workspace scope.
6. Test populated project scope with existing data.
7. Test filters/action area before table.
8. Test CSV/XLSX controls as compact utilities.
9. Test AI controls as read-only support before table.
10. Test sources section as secondary.
11. Test row expansion/detail if implemented; otherwise verify implementation report explains non-implementation.
12. Record screenshots for Hub, empty registry, populated registry, and any detail state.

## Network/console safety

During navigation/viewing:

- No unsafe `PUT`, `PATCH`, `DELETE`.
- No BPMN XML mutation.
- No Product Actions mutation.
- No blocking console errors.
- No repeated reload loops.
- No fake-data fallback requests or mock-source substitution.

## Pass conditions

Agent 4 can pass only if:

- Both worker lanes are present and coherent.
- Runtime is serving the reviewed build.
- IA acceptance criteria are visible in real screenshots.
- Empty and populated states both satisfy the expected structure.
- Data displayed is real and traceable to current source/data flow.
- Backend/schema/BPMN/RAG runtime stayed untouched unless separately approved.
- Branch/scope safety is documented, including dirty checkout risk if still present.

## Block / changes requested conditions

Use `CHANGES_REQUESTED` or block if:

- Served runtime does not match source HEAD/contour.
- Empty workspace scope hides the page structure or shows fake rows.
- Populated state uses invented values.
- AI controls mutate durable state or appear canonical.
- Sources dominate or merge with the main registry surface.
- Implementation changes backend/schema/BPMN/RAG or global shell without explicit scope.
- Branch contains unrelated product changes that cannot be separated.
