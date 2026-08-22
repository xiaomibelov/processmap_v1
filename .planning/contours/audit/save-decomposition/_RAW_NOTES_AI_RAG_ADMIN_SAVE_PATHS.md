# Backend Save/Update/Delete Paths Audit

**Contour:** `audit/save-decomposition`  
**Scope:** Notes, AI product-actions, RAG, Admin, Telemetry, Analytics write paths  
**Sources:** `backend/app/routers/{notes,product_actions_ai,rag,admin,error_events,analytics,feature_flags}.py`, `backend/app/services/*`, `backend/app/storage.py`, `frontend/src/lib/api.js`, prior `MICROSERVICE_AUDIT.md`.  
**Date:** 2026-06-24

---

## Executive Summary

- All persistence uses raw SQL through `backend/app/storage.py` (`_connect()` returns a SQLite/Postgres-compatible transaction context).  
- **Notes** live in dedicated tables; no optimistic locking. Write operations are simple INSERT/UPDATE with per-row org filtering.
- **AI product-actions** suggestions are mostly read-only with respect to durable DB tables; they write an append-only `ai_execution_log` row and, for batch flows, persist a draft blob inside `sessions.interview.analysis.product_actions_batch_draft`.
- **RAG** indexing writes `rag_documents`, `rag_chunks`, and `rag_sources`; it uses a SHA-256 content-hash to skip no-op re-indexes.
- **Admin** writes span `users`/`org_memberships` (user CRUD), `ai_prompt_versions` (prompt lifecycle), the filesystem `_llm_settings.json` (provider settings), and `feature_flags` plus Redis overlay.
- **Telemetry** is append-only into `error_events`.
- **Analytics snapshots** (`analytics_*_snapshots`) are computed on demand and after session recompute/update paths; they are not directly written by the auto-pass or report routers themselves.

---

## 1. Notes

### Domain tables

| Table | Purpose | Schema definition |
|---|---|---|
| `note_threads` | Discussion threads scoped to a session/project/workspace/element | `backend/app/storage.py:1416` |
| `note_comments` | Comments inside a thread, with optional `reply_to_comment_id` | `backend/app/storage.py:1439` |
| `note_comment_mentions` | `@user` mentions inside a comment | `backend/app/storage.py:1469` |
| `note_thread_attention_acknowledgements` | Per-user acknowledgement of `requires_attention` threads | `backend/app/storage.py:1487` |
| `note_thread_reads` | Per-user read cursor (last read comment/timestamp) | `backend/app/storage.py:1499` |

### Operations matrix

| # | Endpoint | Frontend hook (`frontend/src/lib/api.js`) | Router handler | Storage/service function | Tables mutated |
|---|---|---|---|---|---|
| 1 | `POST /api/sessions/{id}/note-threads` | `apiCreateNoteThread` (`api.js:918`) | `routers/notes.py:311` | `storage.create_note_thread` (`storage.py:8855`) | `note_threads`, `note_comments`, `note_comment_mentions`, `note_thread_reads` |
| 2 | `POST /api/note-threads/{id}/comments` | `apiAddNoteThreadComment` (`api.js:926`) | `routers/notes.py:355` | `storage.add_note_comment` (`storage.py:9132`) | `note_comments`, `note_comment_mentions`, `note_thread_reads`, `note_threads.updated_at` |
| 3 | `PATCH /api/note-comments/{id}` | `apiPatchNoteComment` (`api.js:934`) | `routers/notes.py:377` | `storage.update_note_comment` (`storage.py:9233`) | `note_comments`, `note_comment_mentions` (replace if payload sent) |
| 4 | `PATCH /api/note-threads/{id}` | `apiPatchNoteThread` (`api.js:944`) | `routers/notes.py:445` | `storage.patch_note_thread` (`storage.py:9361`) | `note_threads`; deletes `note_thread_attention_acknowledgements` when `requires_attention` is changed |
| 5 | `POST /api/note-threads/{id}/attention-acknowledgement` | `apiAcknowledgeNoteThreadAttention` (`api.js:980`) | `routers/notes.py:427` | `storage.acknowledge_note_thread_attention` (`storage.py:9423`) | `note_thread_attention_acknowledgements` |
| 6 | `POST /api/note-threads/{id}/read` | `apiMarkNoteThreadRead` (`api.js:987`) | `routers/notes.py:436` | `storage.mark_note_thread_read` (`storage.py:9297`) | `note_thread_reads` |
| 7 | `POST /api/note-mentions/{id}/acknowledge` | `apiAcknowledgeNoteMention` (`api.js:973`) | `routers/notes.py:416` | `storage.acknowledge_note_mention` (`storage.py:9829`) | `note_comment_mentions` |

### 1.1 `POST /api/sessions/{id}/note-threads`

- **Handler:** `create_session_note_thread` (`routers/notes.py:311`).
- **Validation:** loads session with `write=True`, resolves mention targets against org membership (`_resolve_mention_targets`, `routers/notes.py:180`).
- **Payload shape (`CreateNoteThreadBody`, `routers/notes.py:21`):**
  - `scope_type` (str) — required, e.g. `session`, `diagram_element`.
  - `scope_ref` (object) — default `{}`, used for element binding.
  - `body` (str) — required initial comment text.
  - `priority` (str) — default `"normal"`.
  - `requires_attention` (bool) — default `False`.
  - `mention_user_ids` (list[str]) — default `[]`.
- **Storage logic (`storage.create_note_thread`, `storage.py:8855`):**
  - Inserts one row into `note_threads`.
  - Inserts the initial comment row into `note_comments`.
  - Calls `_insert_note_comment_mentions` (`storage.py:8816`) to write `note_comment_mentions` rows.
  - Upserts author's read cursor via `_upsert_note_thread_read` (`storage.py:8723`).
- **Optimistic locking:** none.
- **Cascades / side effects / cache invalidation:**
  - Returns hydrated thread object (comments, mentions, author profiles, read state) from `get_note_thread`.
  - No Redis/session-cache invalidation; note counts are computed read-time (`get_session_open_notes_aggregate`, `storage.py:9893`).

### 1.2 `POST /api/note-threads/{id}/comments`

- **Handler:** `add_note_thread_comment` (`routers/notes.py:355`).
- **Payload shape (`AddNoteCommentBody`, `routers/notes.py:30`):**
  - `body` (str) — required.
  - `mention_user_ids` (list[str]) — default `[]`.
  - `reply_to_comment_id` (str | null) — optional.
- **Storage logic (`storage.add_note_comment`, `storage.py:9132`):**
  - Validates reply target belongs to same thread.
  - Inserts `note_comments` row.
  - Inserts mentions via `_insert_note_comment_mentions`.
  - Upserts author's `note_thread_reads`.
  - Updates `note_threads.updated_at = now`.
- **Optimistic locking:** none.
- **Side effects:** returns full hydrated thread.

### 1.3 `PATCH /api/note-comments/{id}`

- **Handler:** `patch_note_comment` (`routers/notes.py:377`).
- **Authz:** only the original author may edit.
- **Payload shape (`PatchNoteCommentBody`, `routers/notes.py:36`):**
  - `body` (str) — required.
  - `mention_user_ids` (list[str] | null) — optional; only replaces existing mentions if field was explicitly sent (`model_fields_set`).
- **Storage logic (`storage.update_note_comment`, `storage.py:9233`):**
  - Updates `note_comments.body`, `updated_at`, `edited_at`, `edited_by_user_id`.
  - If `replace_mentions=True`, deletes existing `note_comment_mentions` for the comment and re-inserts.
- **Optimistic locking:** none.
- **Side effects:** returns updated comment + full thread.

### 1.4 `PATCH /api/note-threads/{id}`

- **Handler:** `patch_note_thread` (`routers/notes.py:445`).
- **Payload shape (`PatchNoteThreadBody`, `routers/notes.py:41`):**
  - `status` (str | null) — e.g. `open`, `resolved`.
  - `priority` (str | null).
  - `requires_attention` (bool | null).
- **Storage logic (`storage.patch_note_thread`, `storage.py:9361`):**
  - Updates only fields present in `model_fields_set`.
  - When `status` becomes `resolved`, sets `resolved_by` / `resolved_at`.
  - When `requires_attention` is mutated, deletes all `note_thread_attention_acknowledgements` for that thread (resets acknowledgements).
- **Optimistic locking:** none.

### 1.5 `POST /api/note-threads/{id}/attention-acknowledgement`

- **Handler:** `acknowledge_note_thread_attention` (`routers/notes.py:427`).
- **Storage logic (`storage.acknowledge_note_thread_attention`, `storage.py:9423`):**
  - Deletes any existing per-user acknowledgement, then re-inserts only if `requires_attention = 1`.
- **Tables:** `note_thread_attention_acknowledgements`.

### 1.6 `POST /api/note-threads/{id}/read`

- **Handler:** `mark_note_thread_read` (`routers/notes.py:436`).
- **Storage logic (`storage.mark_note_thread_read`, `storage.py:9297`):**
  - Computes latest comment timestamp and id.
  - Upserts `note_thread_reads` via `_upsert_note_thread_read` (`storage.py:8723`) with `INSERT ... ON CONFLICT(thread_id, user_id) DO UPDATE` monotonic merge.
- **Tables:** `note_thread_reads`.

### 1.7 `POST /api/note-mentions/{id}/acknowledge`

- **Handler:** `acknowledge_note_mention` (`routers/notes.py:416`).
- **Storage logic (`storage.acknowledge_note_mention`, `storage.py:9829`):**
  - Updates `note_comment_mentions.acknowledged_at = now` only if current row belongs to actor and is unacknowledged.
- **Tables:** `note_comment_mentions`.

---

## 2. AI / Product Actions

### Operations matrix

| # | Endpoint | Frontend hook | Router handler | Service/Storage function | Tables / files mutated |
|---|---|---|---|---|---|
| 1 | `PUT /api/sessions/{id}/analysis/product-actions/batch-draft` | `apiSaveBatchDraft` (`api.js:798`) | `routers/product_actions_ai.py:1196` | direct `storage.save` | `sessions` (`interview_json.analysis.product_actions_batch_draft`) |
| 2 | `POST /api/sessions/{id}/analysis/product-actions/suggest` | `apiSuggestProductActions` (`api.js:630`) | `routers/product_actions_ai.py:563` | `ai.execution_log.record_ai_execution` | `ai_execution_log` |
| 3 | `POST /api/sessions/{id}/analysis/product-actions/batch-suggest` | `apiBatchSuggestProductActions` (`api.js:673`) | `routers/product_actions_ai.py:832` | `suggest_product_actions_with_deepseek`, `_save_batch_draft_to_session`, `record_ai_execution` | `sessions` (draft blob), `ai_execution_log` |
| 4 | `POST /api/analysis/product-actions/suggest-bulk` | `apiBulkSuggestProductActions` (`api.js:654`) | `routers/product_actions_ai.py:1085` | calls `suggest_product_actions` per session | `ai_execution_log` per session; no session mutation |

### 2.1 `PUT /api/sessions/{id}/analysis/product-actions/batch-draft`

- **Handler:** `save_batch_draft` (`routers/product_actions_ai.py:1196`).
- **Payload shape (`BatchDraftIn`, `routers/product_actions_ai.py:49`):**
  - `draft` (object | null) — `null` clears the draft.
- **Storage logic:**
  - Loads session, mutates `session.interview.analysis.product_actions_batch_draft`, then calls `get_storage().save(session, ...)` (`storage.py:3608`).
- **Optimistic locking / versioning:** relies on generic `SessionStorage.save` (`storage.py:3608`).  
  - The save accepts the caller-provided `session.version` and `session.diagram_state_version` and writes them as-is.  
  - If `diagram_state_version` is greater than the existing row, a row is appended to `session_state_versions` (`storage.py:3770`).  
  - There is **no** CAS reject on concurrent saves; last-write-wins for most JSON columns.
- **Side effects / cache invalidation:**
  - `_invalidate_session_caches` is **not** called from this router, so workspace/session caches are not proactively invalidated for a draft-only save.

### 2.2 `POST /api/sessions/{id}/analysis/product-actions/suggest`

- **Handler:** `suggest_product_actions` (`routers/product_actions_ai.py:563`).
- **Payload shape (`ProductActionsSuggestIn`, `routers/product_actions_ai.py:40`):**
  - `options` (object) — may contain `max_suggestions` and `selected_step_id/label/bpmn_id`.
- **Service calls:**
  - `load_llm_settings` (`settings.py:44`).
  - `check_ai_rate_limit` (`ai/execution_log.py:133`) using `ai_execution_log` counts.
  - `get_active_prompt` (`ai/prompt_registry.py:77`) reads `ai_prompt_versions`.
  - `suggest_product_actions_with_deepseek` (`ai/product_actions_suggest.py`) calls DeepSeek API.
  - `record_ai_execution` (`ai/execution_log.py:49`) appends a row to `ai_execution_log`.
- **Tables mutated:** `ai_execution_log` only.
- **Optimistic locking:** none (read-only wrt `sessions`).
- **Side effects:** returns a transient `draft_id` and suggestions list; no durable session mutation.

### 2.3 `POST /api/sessions/{id}/analysis/product-actions/batch-suggest`

- **Handler:** `batch_suggest_product_actions` (`routers/product_actions_ai.py:832`).
- **Payload shape (`ProductActionsBatchSuggestIn`, `routers/product_actions_ai.py:53`):**
  - `scope` (str) — default `"without_actions"`.
  - `step_ids` (list[str]) — optional subset.
  - `options` (object) — `skip_existing_actions`, `skip_existing_drafts`, `max_steps_per_chunk`.
- **Service calls:**
  - Builds context from session.
  - Skips steps with existing actions/drafts according to options.
  - Calls LLM per chunk and writes results to a per-step draft map.
  - `_save_batch_draft_to_session` (`routers/product_actions_ai.py:530`) persists the draft map to `sessions.interview.analysis.product_actions_batch_draft` via `storage.save`.
  - `record_ai_execution` writes one `ai_execution_log` row summarising the batch.
- **Optimistic locking:** same as 2.1 (session save last-write-wins).
- **Side effects:** in-memory `_BATCH_IN_FLIGHT` set prevents duplicate concurrent batches per `(org_id, session_id, scope, input_hash)`.

### 2.4 `POST /api/analysis/product-actions/suggest-bulk`

- **Handler:** `suggest_product_actions_bulk` (`routers/product_actions_ai.py:1085`).
- **Payload shape (`ProductActionsBulkSuggestIn`, `routers/product_actions_ai.py:44`):**
  - `session_ids` (list[str]) — capped at `_BULK_SESSION_CAP = 10`.
  - `options` (object).
- **Service calls:** iterates sessions and invokes `suggest_product_actions`; each call writes its own `ai_execution_log` row.
- **Tables mutated:** `ai_execution_log` only.

---

## 3. RAG

### Domain tables

| Table | Purpose | Schema definition |
|---|---|---|
| `rag_documents` | Indexed document header + content hash | `backend/app/storage.py:2201` |
| `rag_chunks` | Searchable text chunks | `backend/app/storage.py:2216` |
| `rag_sources` | Source-type bookkeeping | `backend/app/storage.py:2238` |
| `rag_embeddings` | Reserved for future vector search (not written today) | `backend/app/storage.py:2228` |
| `rag_settings` | Org-level RAG configuration | `backend/app/storage.py:2279` |

### Operations matrix

| # | Endpoint | Frontend hook | Router handler | Service/Storage function | Tables mutated |
|---|---|---|---|---|---|
| 1 | `POST /api/rag/index` | `apiRagIndex` (`api.js:1764`) | `routers/rag.py:121` | `rag.indexer.index_document` | `rag_documents`, `rag_chunks`, `rag_sources` |
| 2 | `POST /api/rag/product-actions/index` | `apiRagIndexProductActions` (`api.js:1783`) | `routers/rag.py:188` | `rag.indexer.index_document` per action | `rag_documents`, `rag_chunks`, `rag_sources` |

### 3.1 `POST /api/rag/index`

- **Handler:** `rag_index` (`routers/rag.py:121`).
- **Payload shape (`RagIndexIn`, `routers/rag.py:94`):**
  - `source_type` (str) — `"bpmn_xml"` or `"product_action"`.
  - `session_id` (str) — required.
  - `force` (bool) — default `False`.
- **Service logic (`rag.indexer.index_document`, `rag/indexer.py:29`):**
  - Computes SHA-256 content hash; if existing active doc hash matches, returns unchanged.
  - If `force=True`, soft-deletes existing doc first.
  - Chunks content via `chunk_bpmn_xml` or `chunk_product_actions`.
  - Upserts `rag_documents` (`rag/storage_rag.py:21`), deletes old chunks, inserts new chunks, upserts `rag_sources`.
- **Optimistic locking / versioning:** content-hash versioning; no row-level locking.
- **Side effects / cache invalidation:** none; RAG search rebuilds BM25 index in-memory on every request (`routers/rag.py:63`).

### 3.2 `POST /api/rag/product-actions/index`

- **Handler:** `rag_index_product_actions` (`routers/rag.py:188`).
- **Payload shape (`ProductActionsRagIndexIn`, `routers/rag.py:100`):**
  - `session_id` (str) — required.
  - `action_ids` (list[str]) — optional subset; defaults to all actions in `session.interview.analysis.product_actions`.
  - `force` (bool) — default `False`.
- **Service logic:**
  - For each action, computes `_stable_json_hash(action)` and uses `session_id:action_id` as `source_id`.
  - Calls `index_document` per action.
- **Tables mutated:** same as 3.1, one `rag_documents` row per action.

---

## 4. Admin

### 4.1 Users

| # | Endpoint | Frontend hook | Router handler | Service/Storage function | Tables mutated |
|---|---|---|---|---|---|
| 1 | `POST /api/admin/users` | `apiAdminCreateUser` (`apiModules/adminApi.js:44`) | `routers/admin.py:1036` | `auth.create_user` → `storage.create_auth_user`; `_replace_user_memberships` | `users`, `org_memberships`, `audit_log` |
| 2 | `PATCH /api/admin/users/{id}` | `apiAdminPatchUser` (`apiModules/adminApi.js:63`) | `routers/admin.py:1070` | `auth.update_user` → `storage.update_auth_user`; `_replace_user_memberships` | `users`, `org_memberships`, `audit_log` |

#### `POST /api/admin/users`

- **Handler:** `admin_create_user` (`routers/admin.py:1036`).
- **Payload shape (`AdminUserCreateBody`, `routers/admin.py:81`):**
  - `email`, `password`, `full_name`, `job_title`, `is_admin`, `is_active`.
  - `memberships` — list of `{ org_id, role, permissions? }`.
- **Service logic:**
  - `_platform_admin_context` requires `is_admin=True`.
  - `_normalize_admin_memberships` maps roles to `org_admin`/`editor`/`org_viewer` and validates orgs exist.
  - `auth.create_user` (`auth.py:316`) hashes password and calls `storage.create_auth_user` (`storage.py:2878`).
  - `_replace_user_memberships` (`routers/admin.py:383`) deletes removed memberships and upserts new ones via `delete_org_membership` / `upsert_org_membership` (`storage.py`).
- **Optimistic locking:** none.
- **Side effects:** `_audit_log_safe` writes `admin.user_create` to `audit_log`.

#### `PATCH /api/admin/users/{id}`

- **Handler:** `admin_patch_user` (`routers/admin.py:1070`).
- **Payload shape (`AdminUserPatchBody`, `routers/admin.py:91`):**
  - All fields optional; `memberships` if sent replaces the full membership set.
- **Service logic:**
  - `auth.update_user` (`auth.py:358`) calls `storage.update_auth_user` (`storage.py:2894`).
  - If `memberships` provided, `_replace_user_memberships` reconciles `org_memberships`.
- **Side effects:** `_audit_log_safe` writes `admin.user_update` to `audit_log`.

### 4.2 AI Prompts

| # | Endpoint | Frontend hook | Router handler | Service/Storage function | Table mutated |
|---|---|---|---|---|---|
| 1 | `POST /api/admin/ai/prompts` | `apiAdminCreateAiPrompt` (`apiModules/adminApi.js:183`) | `routers/admin.py:969` | `ai.prompt_registry.create_prompt_draft` → `storage.create_ai_prompt_draft` | `ai_prompt_versions` |
| 2 | `POST /api/admin/ai/prompts/{id}/activate` | `apiAdminActivateAiPrompt` (`apiModules/adminApi.js:201`) | `routers/admin.py:992` | `ai.prompt_registry.activate_prompt_version` → `storage.activate_ai_prompt_version` | `ai_prompt_versions` |
| 3 | `POST /api/admin/ai/prompts/{id}/archive` | `apiAdminArchiveAiPrompt` (`apiModules/adminApi.js:208`) | `routers/admin.py:1007` | `ai.prompt_registry.archive_prompt_version` → `storage.archive_ai_prompt_version` | `ai_prompt_versions` |

#### Prompt lifecycle

- **Status machine:** `draft` → `active` → `archived`.
- **Activate side effect:** `storage.activate_ai_prompt_version` (`storage.py:7901`) first archives the currently active prompt for the same `(module_id, scope_level, scope_id)`, then sets the target prompt to `active`.
- **Scope:** prompts support `global`, `org`, `workspace`, `project`, `session` scope levels (`ai/prompt_registry.py:25`).

### 4.3 AI Provider Settings

| Endpoint | Frontend hook | Router handler | Service function | Persistence |
|---|---|---|---|---|
| `POST /api/admin/ai/provider-settings` | `apiAdminSaveAiProviderSettings` (`apiModules/adminApi.js:140`) | `routers/admin.py:836` | `settings.save_llm_settings` (`settings.py:71`) | Filesystem `_llm_settings.json` inside `PROCESS_STORAGE_DIR` |

- **Payload shape (`AdminAiProviderSettingsBody`, `routers/admin.py:111`):**
  - `api_key` (str), `base_url` (str).
- **Side effects:**
  - File is overwritten atomically via a temp file (`settings.py:77`).
  - `load_llm_settings` merges env vars (`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`) with the file; env vars take precedence.

### 4.4 Feature Flags

| # | Endpoint | Frontend hook | Router handler | Service function | Tables mutated |
|---|---|---|---|---|---|
| 1 | `PATCH /api/admin/feature-flags` | `apiPatchFeatureFlags` (`api.js:1833`) | `routers/feature_flags.py:78` | `_set_flag` | `feature_flags` + Redis hash |
| 2 | `PUT /api/admin/feature-flags/{key}` | (no dedicated wrapper found; route exists) | `routers/feature_flags.py:92` | `_set_flag` | `feature_flags` + Redis hash |

- **Payload shape (`PATCH`):** `{ flags: { key: bool, ... } }`.
- **Payload shape (`PUT`):** `{ value: bool }`.
- **Storage logic (`_set_flag`, `routers/feature_flags.py:46`):**
  - Writes/upserts `feature_flags` via `storage.set_feature_flag` (`storage.py:2452`) (Postgres source of truth).
  - Updates Redis overlay `feature_flags:{org_id}` hash for fast reads.
- **Optimistic locking:** none.
- **Side effects:** `_get_flags` reads DB first, then Redis overlay (`routers/feature_flags.py:24`).

---

## 5. Telemetry

### Operation

| Endpoint | Frontend client | Router handler | Service function | Table mutated |
|---|---|---|---|---|
| `POST /api/telemetry/error-events` | `telemetryClient.js` (`frontend/src/features/telemetry/telemetryClient.js:17`) + automatic `apiCore.js` on failed requests (`apiCore.js:372`) | `routers/error_events.py:13` | `error_events.schema.build_stored_error_event` → `storage.append_error_event` | `error_events` |

### Payload shape (`ErrorEventIn`, `error_events/schema.py:49`)

- `schema_version` (int) — must equal `1`.
- `event_type` (str), `severity` (`fatal|error|warn|info`), `message` (str), `source` (`frontend|backend|server|worker`).
- Optional: `user_id`, `org_id`, `session_id`, `project_id`, `route`, `runtime_id`, `tab_id`, `request_id`, `correlation_id`, `app_version`, `git_sha`, `fingerprint`, `context_json`.

### Storage logic

- `build_stored_error_event` (`error_events/schema.py:335`):
  - Trusts request-state `user_id`/`org_id` over payload claims.
  - Generates `id`, `ingested_at`, computes SHA-256 fingerprint if not provided.
  - Sanitises `context_json` (redacts tokens, cookies, bpmn_xml, payloads).
- `storage.append_error_event` (`storage.py:7994`) inserts into `error_events`.

### Optimistic locking / side effects

- Append-only; no locking.
- Response header `X-Request-Id` is returned if the stored row has a request id.

---

## 6. Analytics Snapshots

### Tables

| Table | Purpose | Schema definition |
|---|---|---|
| `analytics_session_snapshots` | Per-session computed metrics | `backend/app/storage.py:2312` |
| `analytics_project_snapshots` | Per-project roll-ups | `backend/app/storage.py:2339` |
| `analytics_workspace_snapshots` | Per-workspace roll-ups | `backend/app/storage.py:2357` |
| `analytics_metrics` | Generic metric rows (defined but no writer found in this audit) | `backend/app/storage.py:2375` |

### Refresh functions

| Function | File:line | Behaviour |
|---|---|---|
| `refresh_analytics_for_session` | `analytics_read_model.py:169` | Computes `compute_analytics(session)`, writes `analytics_session_snapshots`, then cascades to project and workspace snapshots. |
| `refresh_project_analytics_snapshot` | `analytics_read_model.py:93` | Aggregates all session snapshots for the project. |
| `refresh_workspace_analytics_snapshot` | `analytics_read_model.py:126` | Aggregates session snapshots across the workspace's projects. |

### Triggers that write snapshots

1. **On-demand analytics dashboard reads** — `GET /api/analytics/dashboard` and `GET /api/analytics/{scope}/{scope_id}/dashboard` (`routers/analytics.py:132`, `:145`).  
   `_load_snapshot` (`routers/analytics.py:48`) fetches the row; if missing, calls `_refresh_snapshot` → `refresh_analytics_for_session` / `refresh_project_analytics_snapshot` / `refresh_workspace_analytics_snapshot`.

2. **Session recompute / patch / put** — internal `_recompute_session` computes `s.analytics = compute_analytics(s)` (`_legacy_main.py:3439`) and bumps `s.version`.  
   After saving, the following callers invoke `refresh_analytics_for_session`:
   - `_legacy_main.patch_session` (`_legacy_main.py:4280`)
   - `_legacy_main.put_session` (`_legacy_main.py:4452`)
   - `_legacy_main.recompute` (`_legacy_main.py:4467`)
   - `session_service.recompute_session` (`services/session_service.py:883`)

3. **Auto-pass and report endpoints** — these mutate `sessions` JSON (`bpmn_meta`, `interview.report_versions`) via `storage.save`, but **no call to `refresh_analytics_for_session` was found** in `routers/auto_pass.py`, `auto_pass_engine.py`, or the report generation paths (`_legacy_main.py` report helpers).  
   They therefore do **not** directly refresh analytics snapshots; the snapshots become stale until the next explicit recompute or analytics read.

### Versioning

- Snapshots are upserted by primary key (`session_id` / `project_id` / `workspace_id`); no optimistic locking.
- The in-session `analytics_json` column is overwritten on every `_recompute_session`.

---

## 7. Cross-Cutting Observations

- **No service layer for notes/RAG/telemetry:** routers call `storage.*` directly, matching the monolithic pattern noted in `MICROSERVICE_AUDIT.md`.
- **Optimistic locking is only meaningful for diagram writes:** `SessionStorage.save` appends a `session_state_versions` row only when `diagram_state_version` increases (`storage.py:3753-3789`).  
  JSON-only mutations (e.g. batch draft, report versions) increment `session.version` but do not generate state-version traces.
- **Cache invalidation:** session-changing routers in `_legacy_main.py` call `_invalidate_session_caches` (`_legacy_main.py:8615`), which clears workspace cache, explorer project cache, TLDR cache, and Redis session projection cache.  
  Notes routers and the batch-draft router do **not** call this, so downstream session projection caches can lag behind note counts and draft state.
- **Audit logging:** admin user writes and session writes emit rows to `audit_log`; telemetry writes go to `error_events`.
