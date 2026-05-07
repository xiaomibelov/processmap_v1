# feature/admin-ai-provider-settings-and-product-actions-prompt-v1

Дата: 2026-05-07

Контур: `feature/admin-ai-provider-settings-and-product-actions-prompt-v1`

## Где мы / зачем / что стало видимым

Admin AI modules, prompt registry, execution log and Product Actions AI review flow already existed.

This contour makes Product Actions AI configurable and diagnosable:

- Admin -> AI modules has a DeepSeek provider settings block.
- Admin can save/replace API key, edit Base URL and verify availability.
- Existing API key is not returned to frontend; UI sees only `has_api_key`.
- `ai.product_actions.suggest` has active global prompt version `seed_ai_product_actions_suggest_v2`.
- Product Actions AI setup/provider failures return controlled codes instead of expected raw 500-style failures.

## GSD status

| Check | Result |
| --- | --- |
| `which gsd` | `gsd not found` |
| `gsd --version` | command not found |
| `which gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk` |
| `gsd-sdk --version` | `gsd-sdk v0.1.0` |
| `gsd-sdk query route.next-action feature/admin-ai-provider-settings-and-product-actions-prompt-v1` | unsupported/unknown command |
| `gsd-sdk query check.phase-ready ...` | unsupported/unknown command |
| Route | `GSD_FALLBACK_MANUAL_IMPLEMENTATION` |

## Source truth

| Field | Value |
| --- | --- |
| Worktree | `/tmp/processmap_admin_ai_provider_product_actions_prompt_v1` |
| Branch | `feature/admin-ai-provider-settings-and-product-actions-prompt-v1` |
| Base | `origin/main` |
| Base commit | `66b3dfb fix: make product actions registry session summary consistent (#308)` |
| Dependency status | registry session summary fix already merged in `origin/main` |
| Main worktree | dirty/unrelated, not used |

Read/used context:

- `PROCESSMAP/PROJECT ATLAS/22_AI слой и модули.md`
- `PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md`
- `PROCESSMAP/PROJECT ATLAS/09_UI UX поверхности.md`
- `PROCESSMAP/PROJECT ATLAS/06_Backend API карта.md`
- handoff `fix product actions registry workspace session summary consistency v1`
- Admin AI modules and prompt registry source code/tests

Actual Obsidian vault paths were not present in this clean worktree; updates were written to:

- `docs/obsidian_fallback/project_atlas_updates/feature-admin-ai-provider-settings-and-product-actions-prompt-v1/`

## Provider settings contract

New admin-scoped endpoints:

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/admin/ai/provider-settings` | secret-safe provider summary |
| POST | `/api/admin/ai/provider-settings` | save/replace DeepSeek API key and Base URL |
| POST | `/api/admin/ai/provider-settings/verify` | verify DeepSeek availability |

Security behavior:

- existing key is never returned;
- response uses `has_api_key`;
- frontend input clears after save;
- empty key on save preserves existing key while allowing Base URL updates;
- tests assert saved/summary responses do not contain raw key.

## Prompt seed summary

Seeded module:

- `module_id`: `ai.product_actions.suggest`
- active prompt: `seed_ai_product_actions_suggest_v2`
- scope: `global`
- version: `v2`
- status: `active`

`seed_ai_product_actions_suggest_v1` is archived so environments that already seeded v1 can advance to the product-actions-specific prompt.

Prompt content now explicitly instructs extraction of only physical employee actions involving product/ingredient/semi-finished product/ready meal/container/package/packaging, and returns structured candidates with evidence/confidence/warnings.

## Controlled error behavior

`POST /api/sessions/{session_id}/analysis/product-actions/suggest` now returns:

- `AI_PROVIDER_NOT_CONFIGURED` when no provider key is available;
- `AI_PROMPT_NOT_CONFIGURED` when no active prompt exists after seed;
- `AI_PROVIDER_ERROR` for provider execution failure.

All paths still record execution log entries and redact provider secret/base URL from errors.

## Tests/build

Commands:

```bash
PYTHONPATH=backend python -m unittest backend.tests.test_ai_module_catalog_api backend.tests.test_ai_prompt_registry_seeds backend.tests.test_product_actions_ai_suggest
npm --prefix frontend ci
node --test src/features/admin/pages/AdminAiModulesPage.test.mjs src/lib/apiRoutes.test.mjs src/components/process/interview/ProductActionsPanel.test.mjs
git diff --check
npm --prefix frontend run build
```

Results:

- backend focused tests: PASS, 15 tests.
- frontend targeted tests: PASS, 21 tests.
- `git diff --check`: PASS.
- frontend build: PASS.
- `npm ci`: PASS, with existing audit warnings 4 moderate / 3 high.
- accidental first frontend command ran the full suite and failed on unrelated/stale tests before targeted rerun; not used as validation.

## Obsidian updates

Updated fallback files:

- `22_AI слой и модули.md`
- `21_Выгрузка действий с продуктом.md`
- `09_UI UX поверхности.md`
- `06_Backend API карта.md`
- `14_Журнал runtime evidence.md`
- `15_Backlog контуров.md`
- `16_Журнал решений.md`

## Commit/push/PR status

- Commit target: `feat: configure ai provider and product actions prompt`
- Push: pending at handoff creation time
- PR: not created
- Merge/deploy: no

## Explicit unchanged

| Area | Result |
| --- | --- |
| AI bulk | no |
| product_actions auto-write | no |
| product_actions save path | unchanged |
| BPMN XML | no change |
| CSV/XLSX | no |
| notes extraction | no change |
| generic autosave | no change |
| merge/deploy | no |
