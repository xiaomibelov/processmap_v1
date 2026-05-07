# feature/product-actions-registry-bulk-ai-suggestions-v1

Дата: 2026-05-07

Контур: `feature/product-actions-registry-bulk-ai-suggestions-v1`

## Где мы / зачем

Session-level `ai.product_actions.suggest` already works as suggestions-only flow: AI suggests rows for one session, user reviews/selects, and accepted rows are saved into `interview.analysis.product_actions[]` through the existing analysis patch path.

This contour adds the next product step: run AI suggestions from `Реестр действий с продуктом` for selected workspace/project sessions, still with review and without auto-write.

## Что стало видимым

In `Реестр действий с продуктом` workspace/project scope:

- user can select visible sessions;
- helper filters select all visible / zero-action sessions / incomplete sessions;
- action `AI: предложить действия` runs a bounded bulk suggestion request;
- review is grouped by session;
- per-session suggestions/errors are visible;
- confidence/evidence, duplicate and incomplete markers are visible;
- `Принять выбранные` saves only selected rows into corresponding sessions.

## GSD status

| Check | Result |
| --- | --- |
| `gsd` | `GSD_UNAVAILABLE`: command not found |
| `gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
| `gsd-sdk query route.next-action ...` | unsupported / unknown command |
| `gsd-sdk query check.phase-ready ...` | unsupported / unknown command |
| Route | `GSD_FALLBACK_MANUAL_EXECUTION` |

## Source truth

| Area | Source |
| --- | --- |
| Product actions durable truth | `PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md` |
| AI module architecture | `PROCESSMAP/PROJECT ATLAS/22_AI слой и модули.md` |
| Registry UI surface | `PROCESSMAP/PROJECT ATLAS/09_UI UX поверхности.md` |
| Session-level AI stabilization | `PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai suggest session review v1.md` |
| Registry session summary consistency | `PROCESSMAP/HANDOFF/2026-05-07 - fix product actions registry workspace session summary consistency v1.md` |
| Backend registry aggregation | `PROCESSMAP/HANDOFF/2026-05-07 - backend product actions registry readonly aggregation v1.md` |

Worktree: `/tmp/processmap_product_actions_registry_bulk_ai_suggestions_v1`

Branch: `feature/product-actions-registry-bulk-ai-suggestions-v1`

Base/dependency: stacked on `fix/product-actions-ai-suggest-session-review-v1@9c6f4c4`; `origin/main@d92b16a` does not yet include that session-level stabilization.

## Precheck result

PASS:

- single-session `ai.product_actions.suggest` tests pass;
- controlled errors are covered by single-session tests;
- accepted rows save through `acceptAiProductActions -> patchInterviewAnalysis`;
- registry shows workspace/project sessions summary through backend aggregation.

No `BLOCKED_BY_SESSION_LEVEL_PRODUCT_ACTIONS_AI`.

## Bulk strategy

New backend endpoint:

```text
POST /api/analysis/product-actions/suggest-bulk
```

Input:

```json
{
  "session_ids": ["session_1", "session_2"],
  "options": {
    "max_suggestions": 20
  }
}
```

MVP cap: 10 unique sessions per request.

The endpoint does not implement a new AI provider path. It validates/caps selected sessions and sequentially runs the existing per-session `ai.product_actions.suggest` runner. This preserves:

- execution log per session;
- rate-limit check per session;
- prompt registry lookup per session;
- controlled per-session errors;
- no session save during suggest.

Per-session result schema:

```json
{
  "session_id": "session_1",
  "session_title": "Session title",
  "project_id": "project_1",
  "status": "success",
  "ok": true,
  "draft_id": "draft_x",
  "input_hash": "sha256:...",
  "source": "llm",
  "prompt_id": "seed_ai_product_actions_suggest_v2",
  "prompt_version": "v2",
  "suggestions": [],
  "warnings": [],
  "summary": {},
  "error_code": "",
  "error_message": ""
}
```

## Review/apply behavior

Frontend registry page:

- session summary rows now have AI selection checkboxes;
- bulk controls provide `Выбрать все видимые`, `Только без действий`, `Только неполные`;
- `AI: предложить действия` is disabled until selected sessions are within cap;
- AI review is grouped by session;
- duplicate suggestions are disabled by default;
- incomplete suggestions show missing-field count;
- per-session controlled errors are rendered in-place.

Apply:

```text
ProductActionsRegistryPanel
  -> apiGetSession(session_id) for accepted sessions only
  -> acceptAiProductActions()
  -> patchInterviewAnalysis(session_id, { product_actions })
```

The full session load happens only during explicit accept for sessions that have selected rows, not during bulk suggest.

## No-auto-write proof

Backend tests compare session before/after bulk suggest:

- `interview.analysis.product_actions[]` unchanged;
- BPMN XML unchanged;
- `diagram_state_version` unchanged;
- provider called once per successful session;
- execution log records per-session runs.

The bulk endpoint itself never calls storage save.

## Caps / rate-limit behavior

| Boundary | Behavior |
| --- | --- |
| Session cap | 10 unique sessions per bulk request |
| Empty session list | 422 `session_ids required` |
| Over cap | 422 `bulk_session_cap_exceeded` |
| Rate limit | handled by per-session runner; result is per-session error object |
| Provider/prompt setup | handled by per-session runner; result is per-session controlled error |

## Tests / build

Commands:

```bash
PYTHONPATH=backend python -m unittest backend.tests.test_product_actions_ai_suggest backend.tests.test_product_actions_registry_api backend.tests.test_ai_module_catalog_api
node --test src/lib/api.productActionsAi.test.mjs src/lib/apiRoutes.test.mjs src/components/process/analysis/ProductActionsRegistryPanel.test.mjs src/components/process/analysis/ProductActionsRegistryPage.test.mjs src/features/process/analysis/productActionsPersistence.test.mjs
git diff --check
npm --prefix frontend run build
```

Result:

- backend focused tests: 21 pass
- frontend targeted tests: 25 pass
- `git diff --check`: pass
- frontend build: pass, with existing Vite chunk-size warning

Fresh worktree note: `npm --prefix frontend ci` was required before build and reported existing audit warnings: 7 vulnerabilities (4 moderate, 3 high).

## Obsidian updates

Updated:

- `PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md`
- `PROCESSMAP/PROJECT ATLAS/22_AI слой и модули.md`
- `PROCESSMAP/PROJECT ATLAS/09_UI UX поверхности.md`
- `PROCESSMAP/PROJECT ATLAS/06_Backend API карта.md`
- `PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md`
- `PROCESSMAP/PROJECT ATLAS/15_Backlog контуров.md`
- `PROCESSMAP/PROJECT ATLAS/16_Журнал решений.md`

## Commit / push / PR

Commit: pending at handoff creation.

Push: pending at handoff creation.

PR: not created.

Merge/deploy: not performed.

## Explicit unchanged

| Area | Result |
| --- | --- |
| CSV/XLSX | no |
| Auto-write AI suggestions | no |
| Product actions save path | unchanged |
| BPMN XML | no mutation |
| Generic Interview autosave | unchanged |
| Notes extraction | unchanged |
| Taxonomy admin | no |
| Workspace-wide uncapped job | no |
| Prompt text semantics | unchanged |
| Merge/deploy/PR | no |
