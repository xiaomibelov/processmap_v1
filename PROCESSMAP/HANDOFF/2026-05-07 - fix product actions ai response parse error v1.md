# fix/product-actions-ai-response-parse-error-v1

Дата: 2026-05-07

Контур: `fix/product-actions-ai-response-parse-error-v1`

## Где мы

DeepSeek provider в Admin был настроен и verify проходил, но `POST /api/sessions/{sid}/analysis/product-actions/suggest` мог возвращать ошибку парсинга malformed JSON и попадать в общий `AI_PROVIDER_ERROR`. Из-за этого UI показывал misleading copy про доступность DeepSeek.

## Зачем

Разделить две разные ситуации:

- provider доступен, но AI вернул невалидный JSON;
- provider/key/network действительно не работают.

## Что стало видимым

- Malformed AI JSON возвращает controlled `AI_RESPONSE_PARSE_ERROR`.
- Session panel и registry bulk review показывают: `AI вернул ответ в некорректном формате. Попробуйте повторить или уточните prompt в Admin → AI модули.`
- Provider errors больше не используются для parse failures.
- Markdown-wrapped valid JSON still parses.
- Product actions suggestions remain review-only.

## GSD status

| Item | Result |
| --- | --- |
| GSD CLI | `GSD_UNAVAILABLE`: `gsd` not found |
| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
| `route.next-action` | unsupported |
| `check.phase-ready` | unsupported |
| Route | manual GSD fallback |

## Source truth

| Field | Value |
| --- | --- |
| Worktree | `/tmp/processmap_product_actions_ai_response_parse_error_v1` |
| Branch | `fix/product-actions-ai-response-parse-error-v1` |
| Base / origin/main / merge-base | `6a4138109121f97a9bc5200e3cd6c75f8521d47b` |
| Latest main | `Feature/product actions export csv xlsx v1 (#312)` |

## Root cause

`backend/app/ai/product_actions_suggest.py` calls `_deepseek_chat_json()`.

`backend/app/ai/deepseek_questions.py` extracts a JSON candidate and then calls `json.loads(cand)`. When DeepSeek returns malformed JSON, `json.JSONDecodeError` escapes into `backend/app/routers/product_actions_ai.py`, where the broad provider exception handler converted it to `AI_PROVIDER_ERROR`.

Frontend then mapped that provider error to availability copy, even though provider verify was fine.

## Controlled error behavior

- Added `ProductActionsAiResponseParseError`.
- `json.JSONDecodeError` and `no json in response` are normalized to `AI_RESPONSE_PARSE_ERROR`.
- Execution log records `error_code=AI_RESPONSE_PARSE_ERROR` with safe truncated diagnostics only.
- Raw model output is not returned to frontend and not stored in execution summary.
- `AI_PROVIDER_NOT_CONFIGURED`, `AI_PROMPT_NOT_CONFIGURED`, `AI_PROVIDER_ERROR`, and rate-limit behavior remain separate.

## Prompt/parser changes

- Existing parser already strips markdown fences through `_extract_json_candidate`; covered by test.
- Added seed prompt version `seed_ai_product_actions_suggest_v3`.
- Archived seed v2.
- v3 adds only bounded output-format instruction: valid JSON object, no markdown, no comments, no trailing commas.
- Product-action extraction semantics unchanged.

## No-auto-write proof

Suggest endpoint still returns draft suggestions only. Tests assert malformed response does not mutate:

- `interview.analysis.product_actions[]`;
- `bpmn_xml`.

Accepted rows still go through existing review/apply path, not generic autosave.

## Tests / build

| Command | Result |
| --- | --- |
| `PYTHONPATH=backend python -m unittest backend.tests.test_product_actions_ai_suggest` | PASS |
| `PYTHONPATH=backend python -m unittest backend.tests.test_ai_prompt_registry_seeds backend.tests.test_ai_prompt_registry_foundation` | PASS |
| `node --test frontend/src/components/process/interview/ProductActionsPanel.test.mjs frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` | PASS |
| `git diff --check` | PASS |
| `npm --prefix frontend run build` | PASS after local `npm --prefix frontend ci`; generated `node_modules/` and `dist/` are ignored |

## Obsidian updates

Updated:

- `PROCESSMAP/PROJECT ATLAS/22_AI слой и модули.md`
- `PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md`
- `PROCESSMAP/PROJECT ATLAS/09_UI UX поверхности.md`
- `PROCESSMAP/PROJECT ATLAS/06_Backend API карта.md`
- `PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md`
- `PROCESSMAP/PROJECT ATLAS/15_Backlog контуров.md`
- `PROCESSMAP/PROJECT ATLAS/16_Журнал решений.md`

## Commit / push / PR

- Commit: pending before final handoff.
- Push: no.
- PR: no.
- Merge/deploy: no.

## Explicit unchanged

| Constraint | Result |
| --- | --- |
| Provider key security | unchanged |
| Product actions save path | unchanged |
| Product actions auto-write | no |
| BPMN XML | no changes |
| Bulk AI | no new behavior |
| CSV/XLSX | no changes |
| Notes extraction | no changes |
| Merge/deploy | no |
