# AI notes extraction preview/apply boundary audit v1

Дата: 2026-05-07

Контур: `audit/ai-notes-extraction-preview-apply-boundary-v1`

Вердикт: `AI_NOTES_EXTRACTION_PREVIEW_APPLY_BOUNDARY_REQUIRED`

> [!summary]
> Текущий `ai.process.extract_from_notes` через `POST /api/sessions/{session_id}/notes` сохраняет заметки и сразу применяет извлеченные DeepSeek/fallback graph changes в session truth. Это противоречит новой AI-архитектуре: AI suggestions не должны становиться domain truth без явного preview/apply.

## 1. GSD / source truth

| Поле | Значение |
| --- | --- |
| GSD CLI | `GSD_UNAVAILABLE`: `gsd` не найден |
| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
| SDK route query | `route.next-action` unsupported |
| SDK phase-ready query | `check.phase-ready` unsupported |
| Route | `GSD_FALLBACK_MANUAL_AUDIT` |
| Worktree | `/tmp/processmap_ai_notes_extraction_audit_v1` |
| Branch | `audit/ai-notes-extraction-preview-apply-boundary-v1` |
| HEAD / origin/main / merge-base | `19990c6c1355a338f96a63a4f92b72cefaee4049` |
| Base includes | Admin AI modules `#296`, AI questions runtime `#297`, path reports runtime `#298`, top header AI removal `#299` |
| Product code | не менялся |

Source commands:

```bash
which gsd || true
gsd --version || true
which gsd-sdk || true
gsd-sdk --version || true
gsd-sdk query route.next-action audit/ai-notes-extraction-preview-apply-boundary-v1 || true
gsd-sdk query check.phase-ready audit/ai-notes-extraction-preview-apply-boundary-v1 --pick next_step || true
git fetch origin
git status -sb
git log --oneline --decorate -10 origin/main
rg -n "def post_notes|extract_process|notes_extract_process|apiPostNote|ai.process.extract_from_notes" backend frontend
```

## 2. Context sources

| Source | Used for |
| --- | --- |
| `PROCESSMAP/PROJECT ATLAS/22_AI слой и модули.md` | confirms `ai.process.extract_from_notes` is legacy, enabled, writes domain state and requires preview-first migration |
| `PROCESSMAP/HANDOFF/2026-05-07 - backend migrate ai questions to ai runtime v1.md` | confirms AI questions are already runtime/log/rate-limit migrated; notes extraction unchanged |
| `PROCESSMAP/HANDOFF/2026-05-07 - backend migrate path reports to ai runtime v1.md` | confirms path reports are migrated; notes extraction unchanged |
| `PROCESSMAP/HANDOFF/2026-05-07 - uiux remove top header ai button and contextualize ai actions v1.md` | confirms AI settings now live in Admin and contextual AI actions remain |
| `/tmp/processmap_ai_module_architecture_v1/docs/specs/ai-module-architecture-and-admin-prompt-registry-v1.md` | architecture decision: AI suggestions are not truth; notes extraction must become preview-first |

## 3. Current notes extraction flow

| Step | Source proof | Current behavior |
| --- | --- | --- |
| Frontend submit | `frontend/src/App.jsx:1587` | `addNote(text)` is the user entry point for global notes |
| Frontend AI wrapper | `frontend/src/App.jsx:1596` | wraps call in client-side `executeAi({ toolId: "notes_extract_process", inputHash, mode: "live" })` |
| API client | `frontend/src/lib/api.js:412` | `apiPostNote()` posts to the notes endpoint and returns full session payload |
| Route | `frontend/src/lib/apiRoutes.js:110` | `POST /api/sessions/{session_id}/notes` |
| Backend endpoint | `backend/app/_legacy_main.py:5339` | `post_notes()` loads session, checks diagram CAS, extracts process, mutates session and saves |
| Input schema | `backend/app/schemas/legacy_api.py:139` | accepts `notes`, optional `base_diagram_state_version`, `base_bpmn_xml_version`, `rev` |
| LLM settings | `backend/app/_legacy_main.py:5358` | loads global LLM settings through `load_llm_settings()` |
| DeepSeek/fallback | `backend/app/ai/deepseek_client.py:364` | `extract_process()` tries DeepSeek, then silently falls back to parser |
| Save | `backend/app/_legacy_main.py:5400` | `st.save(s)` persists mutated session and returns `s.model_dump()` |

Current flow:

```text
User submits note text
  -> frontend executeAi client wrapper
  -> POST /api/sessions/{sid}/notes
  -> backend CAS check
  -> s.notes = input notes
  -> DeepSeek extract_process(notes)
  -> fallback parser if DeepSeek unavailable/fails
  -> roles/start_role/nodes/edges/questions recompute
  -> diagram truth write + save
  -> full session response
```

## 4. DeepSeek and fallback behavior

| Area | Source proof | Current behavior |
| --- | --- | --- |
| DeepSeek call | `backend/app/ai/deepseek_client.py:327` | uses `deepseek-chat`, posts raw notes as user message, asks for JSON with `nodes`, `edges`, `roles` |
| Prompt source | `backend/app/ai/deepseek_client.py:338` | hardcoded system prompt in code |
| Missing API key | `backend/app/ai/deepseek_client.py:329` | returns `None`, no error surfaced |
| Provider/JSON failure | `backend/app/ai/deepseek_client.py:369` | exception is swallowed |
| Fallback parser | `backend/app/ai/deepseek_client.py:123` | `_stub_extract_v2()` derives nodes, edges and roles locally |
| Apply behavior | `backend/app/_legacy_main.py:5373` | endpoint applies whichever extraction object was returned |

Important consequence: DeepSeek failure usually does not block the endpoint. It silently downgrades to fallback parser and still mutates process truth.

## 5. Write map

| Field / state | Source proof | Mutation |
| --- | --- | --- |
| `notes` | `backend/app/_legacy_main.py:5356` | replaced with request `inp.notes` before extraction |
| `roles` | `backend/app/_legacy_main.py:5375` | keeps existing roles if present; otherwise uses extracted roles |
| `start_role` | `backend/app/_legacy_main.py:5383` | set to first role if missing or invalid; cleared when no roles |
| `nodes_json` / `s.nodes` | `backend/app/_legacy_main.py:5390` | merges existing nodes with extracted nodes through `_merge_nodes()` |
| `edges_json` / `s.edges` | `backend/app/_legacy_main.py:5391` | replaces current edges with extracted edges |
| `questions_json` / `s.questions` | `backend/app/_legacy_main.py:3305` | `_recompute_session()` rebuilds questions and merges question states |
| Mermaid / analytics | `backend/app/_legacy_main.py:3333` | `_recompute_session()` rerenders mermaid and recomputes analytics |
| `version` | `backend/app/_legacy_main.py:3340` | `_recompute_session()` increments session version |
| `diagram_state_version` | `backend/app/_legacy_main.py:911` | `_mark_diagram_truth_write()` increments diagram state version |
| write audit metadata | `backend/app/_legacy_main.py:927` | stores last write actor, timestamp and changed keys |
| durable storage columns | `backend/app/storage.py:2616` | save payload includes roles, start_role, notes, nodes, edges, questions and diagram state |

The endpoint marks changed keys as `["notes", "roles", "start_role", "nodes", "edges", "questions"]` before saving.

## 6. Confirmation boundary today

There is no explicit review/apply boundary.

| User action | What it confirms today |
| --- | --- |
| Submit note text in UI | confirms sending the note; also indirectly triggers extraction and graph mutation |
| No preview diff | user does not inspect candidate nodes/edges/questions/roles before persistence |
| No selected apply | user cannot accept only selected extracted entities |
| No extraction draft | there is no intermediate draft record or response-only suggestion object |

The frontend has a client-side `executeAi` wrapper and input hash, but it is not durable backend AI execution evidence and does not prevent backend writes.

## 7. Runtime foundation gap

| Runtime capability | Current notes extraction status |
| --- | --- |
| Module catalog | present: `backend/app/ai/module_catalog.py:155` defines `ai.process.extract_from_notes` as legacy |
| Backend execution log | not wired in `post_notes()` |
| Backend rate limit | not wired in `post_notes()` |
| Prompt registry lookup | not wired in `post_notes()` or `extract_process()` |
| Prompt fallback | only hardcoded prompt/fallback parser exists |
| Input privacy | DeepSeek receives raw notes; backend execution log currently absent, so no input-hash-only durable record exists |

Catalog proof: `ai.process.extract_from_notes` is enabled, `status="legacy"`, `writes_domain_state=True`, `review_apply_required=True`, endpoint `POST /api/sessions/{session_id}/notes`, risk `current path can auto-apply extracted/fallback graph`.

## 8. Risk map

| Risk | Impact | Source / reason | Mitigation |
| --- | --- | --- | --- |
| AI/fallback auto-writes graph | bad extraction becomes process truth | endpoint saves nodes/edges immediately | introduce extraction preview endpoint and apply endpoint |
| Fallback silently applies | local parser output may be treated as AI result | `extract_process()` swallows DeepSeek errors | return draft with `source=fallback` and warnings |
| Stale overwrite | edges are replaced after CAS pass | `s.edges = extracted_edges` | apply endpoint must require current diagram base version and diff preview |
| Existing graph drift | `_merge_nodes()` plus edge replacement can mix old/new model state | current endpoint has no user-selected merge strategy | preview diff should show add/update/delete/conflict buckets |
| Questions mutate indirectly | recompute changes `questions_json` after graph changes | `_recompute_session()` rebuilds questions | preview must include derived questions and apply should declare affected fields |
| Roles/start role drift | extracted roles can seed global roles/start role | current logic uses extracted roles when existing roles absent | review UI should show role changes separately |
| No durable AI evidence | support cannot trace provider, prompt version, latency, input hash | no backend runtime logging | migrate module to AI runtime after preview/apply split |
| No module rate limit | extraction can be expensive and repeated | no `check_ai_rate_limit()` in endpoint | rate-limit preview execution before provider/fallback execution |
| Prompt governance missing | prompt lives in code | `deepseek_client.py` hardcoded system prompt | active prompt lookup with hardcoded fallback, no prompt text change during migration |

## 9. Target preview/apply flow

Target module id: `ai.process.extract_from_notes`.

```text
User submits notes
  -> preview endpoint records/checks AI runtime execution
  -> active prompt lookup by session -> project -> workspace -> org -> global
  -> fallback to current hardcoded prompt if no active prompt
  -> returns extraction draft, not session mutation
  -> UI shows diff against current session graph
  -> user edits/selects roles, nodes, edges, derived questions
  -> apply endpoint performs CAS check
  -> only selected accepted changes write to session truth
```

Draft response should include:

| Field | Purpose |
| --- | --- |
| `module_id` | `ai.process.extract_from_notes` |
| `execution_id` | runtime log link |
| `draft_id` | stable preview draft id if persisted |
| `source` | `llm`, `fallback`, or `mixed` |
| `prompt_id` / `prompt_version` | only when active prompt was found |
| `input_hash` | hash of notes/input, not raw input in execution log |
| `candidate_roles` | extracted role changes |
| `candidate_nodes` | extracted nodes with evidence/confidence |
| `candidate_edges` | extracted edges with evidence/confidence where possible |
| `candidate_questions` | derived questions preview |
| `diff` | add/update/delete/conflict buckets against current session |
| `warnings` | provider/fallback/schema/CAS warnings |

## 10. Endpoint proposal

| Endpoint | Behavior | Writes domain truth |
| --- | --- | --- |
| `POST /api/sessions/{session_id}/notes/extraction-preview` | accepts notes and base diagram version, returns extraction draft/diff | no |
| `POST /api/sessions/{session_id}/notes/extraction-apply` | accepts draft id or selected candidate payload plus base diagram version, applies accepted changes | yes |
| `POST /api/sessions/{session_id}/notes` | legacy compatibility only during transition | yes today; should be deprecated or narrowed later |

Preview endpoint rules:

- call `check_ai_rate_limit()` before provider/fallback execution;
- record execution log with `module_id="ai.process.extract_from_notes"`;
- log `input_hash`, provider/model, prompt version when present, status, latency, usage if available;
- do not store raw notes in execution log;
- if DeepSeek fails, return fallback draft with warning instead of silently applying fallback output;
- keep current hardcoded prompt as fallback without prompt text changes.

Apply endpoint rules:

- require CAS against current `diagram_state_version`;
- write only user-selected roles/nodes/edges/questions/notes changes;
- keep storage truth in existing session fields;
- return existing session contract after apply;
- mark changed keys explicitly and increment `diagram_state_version`.

## 11. Review UI proposal

The review UI should be contextual inside the notes/process surface, not global header AI.

Required panels:

| Panel | Purpose |
| --- | --- |
| Notes input | submit notes for extraction preview |
| Extraction summary | provider/fallback source, warnings, confidence summary |
| Graph diff | added/updated/conflicting nodes and edges |
| Roles diff | new roles and proposed `start_role` |
| Questions diff | derived candidate questions |
| Selection controls | accept/reject per candidate or per bucket |
| Apply action | explicit apply with conflict handling |

UX rule: fallback output must be visibly marked as fallback-derived, because it is lower-trust than provider output.

## 12. Migration plan

| Step | Contour | Goal |
| --- | --- | --- |
| 1 | `backend/notes-extraction-ai-preview-endpoint-v1` | add preview endpoint returning extraction draft/diff without session mutation |
| 2 | `uiux/notes-extraction-preview-review-panel-v1` | add review UI for draft roles/nodes/edges/questions |
| 3 | `backend/notes-extraction-apply-boundary-v1` | add explicit apply endpoint with CAS and selected writes |
| 4 | `backend/migrate-notes-extraction-to-ai-runtime-v1` | route preview execution through execution log, rate limits and prompt registry lookup/fallback |

Temporary compatibility:

- keep legacy `POST /api/sessions/{session_id}/notes` until frontend review/apply is live;
- do not change prompt text during the split;
- do not migrate product actions, path reports, AI questions or BPMN XML in this contour.

## 13. Next implementation contours

1. `backend/notes-extraction-ai-preview-endpoint-v1`
2. `uiux/notes-extraction-preview-review-panel-v1`
3. `backend/notes-extraction-apply-boundary-v1`
4. `backend/migrate-notes-extraction-to-ai-runtime-v1`

## 14. Final decision

> [!important]
> `ai.process.extract_from_notes` must be split into preview and apply before it is considered aligned with the AI module architecture. Current behavior is legacy-compatible but architecturally unsafe because AI/fallback extraction can mutate graph truth without explicit user acceptance.

Final verdict: `AI_NOTES_EXTRACTION_PREVIEW_APPLY_BOUNDARY_REQUIRED`.

## 15. Explicit unchanged

| Constraint | Result |
| --- | --- |
| Product/backend behavior changed | no |
| Frontend changed | no |
| DB/schema changed | no |
| Prompt texts changed | no |
| AI jobs run | no |
| Endpoint behavior changed | no |
| Notes extraction migrated | no |
| Product actions changed | no |
| BPMN XML changed | no |
| Export changed | no |
| Merge/deploy/PR | no |
