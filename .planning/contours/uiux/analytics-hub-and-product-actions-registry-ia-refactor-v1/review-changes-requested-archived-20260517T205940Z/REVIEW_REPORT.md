# Review report: Analytics Hub + Product Actions Registry IA refactor

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`  
Вердикт: `CHANGES_REQUESTED`

## Reviewer GSD discipline

- RAG preflight reviewer выполнен.
- Obsidian-first context прочитан: `EPIC BOARD`, `ACTIVE TASKS`, Git/release contract, релевантный handoff по контуру.
- Product code reviewer не менял.
- Проверялся фактически served runtime `http://clearvestnic.ru:5180`, а не только source/report.

## Source/runtime truth

- `pwd`: `/opt/processmap-test`
- remote: `origin` указывает на `github.com/xiaomibelov/processmap_v1.git` (credential-bearing URL в отчет не копируется).
- `git fetch origin`: success.
- branch: `fix/lockfile-sync-test`
- `HEAD`: `5b20bc2d1292f419647238eaf37dac55f9315942`
- `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- staged diff: empty.
- launcher/workspace diff: dirty, 20 modified tracked product files plus many untracked artifacts.
- Agent 2 implementation worktree: `/opt/processmap-test-agent2-uiux`, branch `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1-agent2`, base/head `d805e1c64c1107b9e3fe6854e031694bf741b187`, changes uncommitted.

## Five-plane proof

- `code`: implementation exists as uncommitted changes in `/opt/processmap-test-agent2-uiux`; served runtime is built from `/opt/processmap-test` dirty branch `fix/lockfile-sync-test`.
- `workspace`: active served checkout is `/opt/processmap-test`; clean Agent 2 worktree is not the serving mount.
- `DB`: authenticated browser runtime showed real populated registry data for `workspace=ws_org_default_main` / `project=b1c8a56b6e`: 152 rows, 149 complete, 3 incomplete. Empty workspace `ws_empty_review_<timestamp>` showed zero-row shell, not fake rows.
- `env/compose`: docker stack includes `processmap_test-gateway-1` on `:5180`, mounted `/opt/processmap-test/frontend/dist -> /usr/share/nginx/html`; API on `:8088`.
- `serving mode`: nginx serves static `frontend/dist`; `curl -I` returned `HTTP 200` with `Cache-Control: no-cache, no-store, must-revalidate`.

## Findings

### HIGH: served build-info does not match this contour

Runtime `frontend/dist/build-info.json` and `window.__PROCESSMAP_BUILD_INFO__` report:

- branch: `fix/lockfile-sync-test`
- sha: `5b20bc2d1292f419647238eaf37dac55f9315942`
- contourId: `uiux/product-actions-registry-inner-page-safe-redesign-v1`
- dirty: `true`

This review contour is `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`. The reviewer prompt explicitly requires build-info/version to match source HEAD/contour. This gate fails.

### HIGH: served checkout contains unrelated product changes outside this contour

`git diff --stat` in `/opt/processmap-test` includes BPMN/stage/runtime files not in the bounded Agent 2 scope, for example:

- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/components/process/InterviewStage.jsx`
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
- `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js`
- `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx`
- multiple BPMN CSS files

Agent 2's clean worktree diff is narrower and does not include those files, but the runtime reviewed on `:5180` is served from the dirty `/opt/processmap-test/frontend/dist`, not from the clean implementation worktree.

### HIGH: navigation/viewing emitted unsafe DELETE requests

Authenticated fresh browser review recorded:

- `DELETE http://clearvestnic.ru:5180/api/sessions/4c515d1c6e/presence`
- repeated once during navigation/viewing

The contour's runtime safety checklist says navigation/viewing must not emit unsafe `PUT/PATCH/DELETE`. Even if this is presence cleanup rather than BPMN/Product Actions mutation, it violates the literal gate and needs explicit handling or a documented allowlist in the review contract.

### MEDIUM: console contained a runtime 404 error during the review flow

Fresh browser context collected one console error: `Failed to load resource: the server responded with a status of 404 (Not Found)`. The empty workspace UI displayed `not_found` while preserving structure. This may be expected for nonexistent workspace proof, but it should not remain as a blocking console error if the final pass gate requires clean console.

## Positive runtime evidence

- Analytics Hub opened after authenticated token injection.
- Hub showed `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
- Hub navigation to `Реестр действий` opened the registry page.
- Registry showed distinct scope tabs: `Workspace`, `Проект`, `Сессия`.
- Compact metrics were present: 5 metric cards.
- Filters and AI controls were positioned before the table.
- Main registry table was primary content; sources block appeared below table as a secondary `details` section.
- Populated workspace/project state used real data: 25 visible rows from 152 total.
- Empty workspace state retained header, scope, metrics, filters, AI controls, table shell, empty state, pagination, and secondary sources block.

Screenshots:

- `reviewer-auth-runtime-analytics-hub.png`
- `reviewer-auth-runtime-hub-to-registry.png`
- `reviewer-auth-runtime-registry-workspace.png`
- `reviewer-auth-runtime-registry-project.png`
- `reviewer-auth-runtime-registry-empty-workspace.png`

## Source tests

Command:

```bash
node --test frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs
```

Result: `25/25 PASS`.

## Verdict

`CHANGES_REQUESTED`.

The IA itself is visible and mostly satisfies the visual acceptance criteria, but this contour cannot receive `REVIEW_PASS` until the runtime is rebuilt/served from the correct contour source with matching build-info, unrelated dirty product changes are excluded from the reviewed build, and navigation safety/console gates are resolved or explicitly scoped.
