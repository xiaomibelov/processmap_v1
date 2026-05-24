# Review report

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`  
Роль: Agent 4 / Reviewer  
Вердикт: `CHANGES_REQUESTED`

## Reviewer discipline

- Reviewer RAG preflight выполнен: `node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1" --query "review rules for this contour" --format md --top-k 10`.
- Product code не менялся.
- Проверялся фактический runtime `http://clearvestnic.ru:5180`, а не только отчеты executor lanes.
- Fresh authenticated browser context использовался для Hub, Hub -> Registry, workspace registry, populated project registry и empty workspace registry.

## Source/runtime truth

- `pwd`: `/opt/processmap-test`
- remote: `github.com/xiaomibelov/processmap_v1.git` (credential-bearing URL не дублируется).
- `git fetch origin`: success.
- launcher branch: `fix/lockfile-sync-test`
- launcher `HEAD`: `5b20bc2d1292f419647238eaf37dac55f9315942`
- `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- launcher status: dirty; tracked product-code changes and many untracked artifacts exist.
- staged diff: empty.
- implementation worktree: `/opt/processmap-test-agent2-uiux`
- implementation branch: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1-agent2`
- implementation `HEAD`: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- implementation status: dirty by contour changes; modified frontend files plus untracked `ProcessAnalyticsHub.jsx` and `registry/`.

## Five-plane proof

- `code`: fix exists as uncommitted dirty diff in `/opt/processmap-test-agent2-uiux`; no commit currently contains the fix. This does not satisfy the final code-plane proof required by the project contract.
- `workspace`: served build-info points to source worktree `/opt/processmap-test-agent2-uiux`; launcher checkout `/opt/processmap-test` remains dirty and is not the implementation source.
- `DB`: populated real data verified for `workspace=ws_org_default_main`, `project=b1c8a56b6e`: UI showed 152 rows, 149 complete, 3 incomplete. Empty workspace proof used synthetic nonexistent workspace `ws_empty_review_<timestamp>` and produced a zero-row shell.
- `env/compose`: active runtime includes `processmap_test-gateway-1` on `0.0.0.0:5180->80/tcp`, `processmap_test-api-1` on `8088`, plus postgres/redis containers.
- `serving mode`: `curl -I http://clearvestnic.ru:5180` returned `HTTP/1.1 200 OK` with `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0`.

## Runtime/build proof

- Served `/build-info.json`:
  - branch: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1-agent2`
  - sha: `d805e1c64c1107b9e3fe6854e031694bf741b187`
  - contourId: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`
  - dirty: `true`
  - sourceWorktree: `/opt/processmap-test-agent2-uiux`
- Focused tests: `node --test frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs` -> `11/11 PASS`.
- Production build: `npm run build` in `/opt/processmap-test-agent2-uiux/frontend` -> PASS.

## Positive findings

- Analytics Hub opens as a top-level `Аналитика` surface.
- Hub cards are visible: `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
- Hub `Открыть` action navigates to `surface=product-actions-registry` with `return_to=analytics`; registry page renders.
- Workspace and populated project registry states show the intended hierarchy: header/back, scope blocks, compact metrics, filters, AI controls, main table, pagination, secondary sources.
- AI controls are before the table and did not emit Product Actions/BPMN mutations during viewing.
- Empty workspace state preserves title, scope, metrics, filters, AI controls, table shell, pagination and sources; no fake rows were observed.
- Fresh browser run after rework captured no unsafe `PUT`, `PATCH`, or `DELETE`.
- Backend/schema/BPMN/RAG runtime files were not changed by the implementation worktree diff.

## Findings requiring rework

### 1. Code-plane proof is still dirty/uncommitted

Severity: `HIGH`

The served build-info now has the correct contour id, but it still reports `dirty: true` and `sha=d805e1c64c1107b9e3fe6854e031694bf741b187`, which is just `origin/main`. The actual implementation is an uncommitted diff in `/opt/processmap-test-agent2-uiux`.

This means the final proof cannot answer "which commit contains the fix". It also makes release/PR review unsafe because the build is not tied to a reproducible commit.

Required rework:
- Commit the bounded implementation on `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1-agent2`, or provide an explicit approved dirty-build exception for this contour.
- Rebuild and re-serve with build-info pointing to the real implementation commit, preferably `dirty=false`.

### 2. Project scope block loses the current project context

Severity: `HIGH`

In authenticated runtime, both the populated project direct route and the Hub -> Registry route showed real project data, but the registry scope block rendered:

- `Проект`
- `Не выбран`

Example verified URLs:
- `/app?surface=product-actions-registry&registry_scope=project&workspace=ws_org_default_main&project=b1c8a56b6e`
- `/app?surface=product-actions-registry&workspace=ws_org_default_main&project=b1c8a56b6e&session=4c515d1c6e&return_to=analytics&registry_scope=session`

The table rows clearly belong to `Описание процессов Долгопрудный`, but the scope block says the project is not selected. This violates the acceptance rule that `Workspace / Проект / Сессия` blocks must be useful and show current value, missing value, or disabled state.

Required rework:
- Ensure the project scope block displays the current project title when available, or at minimum the current project id when the title has not hydrated yet.
- For session scope, the project block must not read as absent while a route project and real project rows are present.

### 3. Empty workspace proof still creates a console 404

Severity: `MEDIUM`

The only available real workspace is `ws_org_default_main`, so empty workspace proof used `ws_empty_review_<timestamp>`. The UI preserved structure and showed zero rows, but the browser captured a console error from `404 /api/analysis/product-actions/registry/query`.

This may be acceptable as a nonexistent-workspace test artifact, but the current review gate says "no console errors". For a clean pass, either validate against a real empty workspace fixture or handle the not-found empty proof without a browser console error.

## Verdict

`CHANGES_REQUESTED`.

The UI direction is close and the previous unsafe presence `DELETE` blocker appears fixed, but `REVIEW_PASS` is not justified while the served implementation is dirty/uncommitted and the project scope block misreports active project context.
