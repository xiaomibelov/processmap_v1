# fix/product-actions-ai-suggest-session-review-v1

Дата: 2026-05-07

Контур: `fix/product-actions-ai-suggest-session-review-v1`

## Где мы / зачем

`ai.product_actions.suggest` уже был подключён к single-session ProductActionsPanel, но перед workspace/bulk AI нужно было стабилизировать один session flow: контролируемые ошибки, нормализованный suggestion schema, review/select/edit и сохранение только accepted rows.

Цель контура: доказать, что AI suggestions работают на уровне одной session и не auto-write'ят `interview.analysis.product_actions[]`.

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
| AI module rules | `PROCESSMAP/PROJECT ATLAS/22_AI слой и модули.md` |
| UI surface | `PROCESSMAP/PROJECT ATLAS/09_UI UX поверхности.md` |
| Prior provider/prompt setup | `PROCESSMAP/HANDOFF/2026-05-07 - feature admin ai provider settings and product actions prompt v1.md` |
| Prior archive/navigation fix | `PROCESSMAP/HANDOFF/2026-05-07 - fix admin ai modules archive and session open regressions v1.md` |

Worktree: `/tmp/processmap_product_actions_ai_suggest_session_review_v1`

Branch: `fix/product-actions-ai-suggest-session-review-v1`

Base: `origin/main@d92b16a fix: stabilize ai prompt archive and session open navigation (#310)`

## Backend AI behavior

Endpoint remains:

```text
POST /api/sessions/{session_id}/analysis/product-actions/suggest
```

Contract stabilized:

- endpoint remains read-only against session truth;
- execution log and rate-limit path remain backend-owned;
- provider/prompt/setup errors stay controlled;
- rate-limit response now carries `message=AI_RATE_LIMIT_EXCEEDED` while preserving `error=ai_rate_limit_exceeded`;
- every suggestion row exposes:
  - `step_id`
  - `bpmn_element_id`
  - `step_label`
  - `product_name`
  - `product_group`
  - `action_type`
  - `action_stage`
  - `action_object`
  - `action_object_category`
  - `action_method`
  - `role`
  - `confidence`
  - `evidence_text`
  - `warnings`
  - `missing_fields`
  - `duplicate_of`
  - `duplicate_reason`

No provider setup or prompt text semantics changed in this contour.

## Frontend review behavior

ProductActionsPanel keeps the existing single-session review flow:

- `Предложить действия через AI` calls the suggest endpoint;
- suggestions render with confidence/evidence/warnings;
- duplicate rows are visible and not selected by default;
- incomplete rows show an incomplete-field count;
- setup/provider/rate-limit errors render as readable guidance;
- `Принять выбранные` stays disabled unless there are selectable accepted rows.

The API wrapper now preserves controlled error payloads from the backend so UI can render backend `message`/`input_hash` context without collapsing to a generic error.

## Accept/save path

Accepted rows are saved only through the existing interview-analysis persistence helper:

```text
ProductActionsPanel
  -> acceptAiProductActions()
  -> patchInterviewAnalysis(session_id, { product_actions: ... })
```

Duplicate-only or empty selected rows do not trigger a save.

## No-auto-write proof

Backend focused tests compare session state before/after suggest:

- `interview.analysis.product_actions[]` unchanged;
- BPMN XML unchanged;
- diagram state version unchanged;
- provider is not called on rate-limit block;
- execution log records success/error state.

The suggest endpoint does not call product-action persistence and does not save the session.

## Tests / build

```bash
git diff --check
PYTHONPATH=backend python -m unittest backend.tests.test_product_actions_ai_suggest backend.tests.test_ai_prompt_registry_seeds backend.tests.test_ai_module_catalog_api
node --test src/lib/api.productActionsAi.test.mjs src/components/process/interview/ProductActionsPanel.test.mjs src/features/process/analysis/productActionsPersistence.test.mjs
npm --prefix frontend run build
```

Result:

- `git diff --check`: pass
- backend focused tests: 16 pass
- frontend targeted tests: 20 pass
- frontend build: pass, with existing Vite chunk-size warning

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
| Workspace/bulk AI | no |
| CSV/XLSX export | no |
| Product actions save path | unchanged |
| Product actions auto-write | no |
| BPMN XML | no mutation |
| Generic Interview autosave | unchanged |
| Notes extraction | unchanged |
| Taxonomy admin | no |
| Prompt text semantics | unchanged |
| Merge/deploy/PR | no |
