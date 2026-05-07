# fix/admin-ai-modules-archive-and-session-open-regressions-v1

Дата: 2026-05-07

Контур: `fix/admin-ai-modules-archive-and-session-open-regressions-v1`

## Где мы / зачем / что стало видимым

Before stabilization of `ai.product_actions.suggest`, two blocker regressions were fixed:

- Admin -> AI modules prompt archive no longer crashes prompt list reload.
- Workspace/Explorer session rows open the session on the first click.

Visible result:

- `Архивировать prompt` can archive a prompt without taking down the Admin AI modules page.
- Expected archive/list errors are rendered as controlled UI copy, not raw `internal_server_error`.
- Workspace session rows preserve project/session context and route directly to the session.
- Explorer project/session CTAs remain explicit: `Открыть проект` and `Открыть сессию`.

## GSD status

| Check | Result |
| --- | --- |
| `which gsd` | `gsd not found` |
| `gsd --version` | command not found |
| `which gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk` |
| `gsd-sdk --version` | `gsd-sdk v0.1.0` |
| `gsd-sdk query route.next-action fix/admin-ai-modules-archive-and-session-open-regressions-v1` | unsupported/unknown command |
| `gsd-sdk query check.phase-ready ...` | unsupported/unknown command |
| Route | `GSD_FALLBACK_MANUAL_IMPLEMENTATION` |

## Source truth

| Field | Value |
| --- | --- |
| Worktree | `/tmp/processmap_admin_ai_archive_session_open_regressions_v1` |
| Branch | `fix/admin-ai-modules-archive-and-session-open-regressions-v1` |
| Base | fresh `origin/main` |
| Base commit | `5d3c68a feat: configure ai provider and product actions prompt (#309)` |
| Dependency status | Admin provider/product-actions prompt contour merged in `origin/main` |
| Main worktree | not used for edits |

Read/used context:

- `PROCESSMAP/HANDOFF/2026-05-07 - feature admin ai provider settings and product actions prompt v1.md`
- fallback Project Atlas updates for Admin AI/provider contour
- source code and tests for Admin prompt registry, WorkspaceDashboard, App session activation and WorkspaceExplorer

Actual Obsidian vault paths were not present in this clean worktree; updates were written to:

- `docs/obsidian_fallback/project_atlas_updates/fix-admin-ai-modules-archive-and-session-open-regressions-v1/`

## Runtime repro

Admin archive root cause was reproduced directly against a temp SQLite DB:

```text
seed_existing_ai_prompts()
archive_prompt_version("seed_ai_product_actions_suggest_v2")
seed_existing_ai_prompts()
```

Before fix, the second seed raised:

```text
ValueError: archived prompt cannot be activated
```

After fix, the second seed returns `ok: true`, skips the archived seed and leaves no active prompt for `ai.product_actions.suggest` until Admin activates or creates one.

Session open root cause was source-mapped:

- WorkspaceDashboard passed only `session_id` to `onOpenSession` in row/card/latest/action paths.
- App `openWorkspaceSession` returned `{ ok: true }`, dropping the orchestration result.
- This could lose `project_id`/`session_id` context and cause first click to behave like project open.

## Fixes

Admin archive:

- `seed_existing_ai_prompts()` now skips active seeds that already exist with `status="archived"`.
- Admin prompt list/active endpoints wrap seed failures as controlled `validation_error`.
- Admin UI maps generic `internal_server_error` prompt action failures to controlled copy and keeps the page usable.

Session open:

- WorkspaceDashboard passes full session rows to `onOpenSession`.
- App `openWorkspaceSession` preserves `projectId` and `sessionId` in the returned result.
- Explorer session CTA says `Открыть сессию`.

## Tests/build

Commands:

```bash
PYTHONPATH=backend python -m unittest backend.tests.test_ai_prompt_registry_seeds backend.tests.test_ai_prompt_registry_foundation backend.tests.test_ai_module_catalog_api
node --test src/features/admin/pages/AdminAiModulesPage.test.mjs src/features/process/hooks/useProcessTabs.session-entry-tab.test.mjs src/features/explorer/workspaceOpenAffordance.source.test.mjs
git diff --check
npm --prefix frontend run build
```

Results:

- backend focused tests: PASS, 16 tests.
- frontend targeted tests: PASS, 12 tests.
- `git diff --check`: PASS.
- frontend build: PASS.
- `npm ci`: PASS, with existing audit warnings 4 moderate / 3 high.
- frontend `node --test` emits a Vite/esbuild shutdown line `The build was canceled`, while TAP exits PASS 12/12.

## Obsidian updates

Updated fallback files:

- `22_AI слой и модули.md`
- `09_UI UX поверхности.md`
- `14_Журнал runtime evidence.md`
- `15_Backlog контуров.md`
- `16_Журнал решений.md`

## Commit/push/PR status

- Commit target: `fix: stabilize ai prompt archive and session open navigation`
- Push: pending at handoff creation time
- PR: not created
- Merge/deploy: no

## Explicit unchanged

| Area | Result |
| --- | --- |
| AI product suggestions | no change |
| AI bulk | no |
| Prompt texts | unchanged |
| Provider semantics | unchanged |
| product_actions save path | unchanged |
| BPMN XML | no change |
| CSV/XLSX | no |
| Merge/deploy | no |
