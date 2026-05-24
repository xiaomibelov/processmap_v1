# Current Session Analysis Source Truth

- contour: `feature/process-analysis-session-backend-view-model-contract-v1`
- run_id: `20260520T224346Z-55320`
- generated_at: `2026-05-20T22:49Z`

## 1. backend/app/storage.py — interview_json persistence

**Schema** (`sessions` table, lines 830–867):
- `interview_json TEXT NOT NULL DEFAULT '{}'` — stores the full interview blob.
- No dedicated `analysis` column; analysis is nested inside `interview_json`.

**Key behavior**:
- `_json_loads` / `_json_dumps` handle serialization (lines 339–381).
- `build_session_version_payload` (line 409) includes `"interview": getattr(sess, "interview", {}) or {}`.
- `session_version_payload_hash` includes `interview` in version hashing.

**Data shape inside interview_json**:
- `interview.analysis` — arbitrary dict.
- `interview.analysis.product_actions` — list of action dicts (durable).
- `interview.analysis.product_actions_batch_draft` — dict of step-keyed draft entries (durable, but conceptually derived/runtime).
- Any other custom keys under `analysis` are preserved (no schema enforcement at storage layer).

**Registry source extraction** (`list_product_action_registry_sources`, lines 3079–3179):
- Query selects `s.interview_json` only to extract `analysis.product_actions[]`.
- Returns source dicts with keys: `org_id`, `workspace_id`, `project_id`, `project_title`, `folder_id`, `folder_title`, `session_id`, `session_title`, `diagram_state_version`, `updated_at`, `product_actions`.
- Does NOT return `analysis` itself, only the extracted list.

**Properties registry source extraction** (`list_process_properties_registry_sources`, lines 3184–3224):
- Query selects `s.bpmn_meta_json` and `s.bpmn_xml`.
- Does NOT read `interview_json` at all.
- Returns source dicts with keys: `org_id`, `workspace_id`, `project_id`, `project_title`, `folder_id`, `folder_title`, `session_id`, `session_title`, `diagram_state_version`, `updated_at`, `bpmn_meta`, `bpmn_xml`.

## 2. backend/app/routers/product_actions_ai.py — AI suggest / batch draft

**Endpoints**:
- `POST /api/sessions/{session_id}/analysis/product-actions/suggest` (line 563)
- `POST /api/sessions/{session_id}/analysis/product-actions/batch-suggest` (line 832)
- `POST /api/analysis/product-actions/suggest-bulk` (line 1085)
- `GET /api/sessions/{session_id}/analysis/product-actions/batch-draft` (line 1178)
- `PUT /api/sessions/{session_id}/analysis/product-actions/batch-draft` (line 1196)

**How it reads analysis**:
- `_existing_product_actions(interview_raw)` (lines 199–221) reads `interview.analysis.product_actions`.
- Normalizes each action to a flat dict with keys: `id`, `step_id`, `bpmn_element_id`, `step_label`, `product_name`, `product_group`, `action_type`, `action_stage`, `action_object`, `action_object_category`, `action_method`, `role`, `source`.
- Handles both snake_case and camelCase aliases (e.g., `action_object` / `actionObject`).

**How it writes batch draft**:
- `_save_batch_draft_to_session` (lines 530–536) mutates `interview.analysis.product_actions_batch_draft = draft`, then calls `storage.save(session, ...)`.
- The draft shape is: `{ step_id: { stepName, rows[], status, errorCode, rateLimitObj, skipped, selectedIds[] } }`.
- `PUT /api/sessions/{session_id}/analysis/product-actions/batch-draft` (lines 1196–1226) performs the same save pattern directly.

## 3. backend/app/routers/product_actions_registry.py — registry query

**Endpoint**: `POST /api/analysis/product-actions/registry/query` (line 555)

**How it extracts from interview_json**:
- `_registry_payload` calls `get_storage().list_product_action_registry_sources(...)` (line 427).
- For each source, `_registry_row(source, action, index)` (lines 192–231) builds a normalized row.
- Row keys: `id` (`session_id::action_id`), `registry_id`, `org_id`, `workspace_id`, `workspace_title`, `project_id`, `project_title`, `session_id`, `session_title`, `action_id`, `raw_action_id`, `product_group`, `product_name`, `action_type`, `action_stage`, `action_object_category`, `action_object`, `action_method`, `role`, `step_id`, `step_label`, `node_id`, `bpmn_element_id`, `work_duration_sec`, `wait_duration_sec`, `source`, `confidence`, `updated_at`, `diagram_state_version`, `completeness`, `missing_fields`.

**Completeness rule** (lines 187–189):
- `_REQUIRED_BUSINESS_FIELDS = ("product_name", "product_group", "action_type", "action_object")`
- Returns `("incomplete", missing_keys)` if any required field is empty.

**Response envelope** (lines 449–462):
```json
{
  "ok": true,
  "scope": "...",
  "rows": [...],
  "summary": { "projects_total": 0, "sessions_total": 0, "actions_total": 0, "complete": 0, "incomplete": 0 },
  "sessions": [...],
  "session_summary": { ... },
  "page": { "limit": 100, "offset": 0, "total": 0, "has_more": false }
}
```
- Note: this endpoint does NOT return `filter_options`, `applied_filters`, `metrics`, `empty_state`, or `source_state`. Those are present in the process properties registry but missing here.

## 4. backend/app/routers/process_properties_registry.py — properties registry query

**Endpoint**: `POST /api/analysis/properties/registry/query` (line 775)

**Response envelope** (lines 664–682):
```json
{
  "ok": true,
  "scope": "...",
  "rows": [...],
  "summary": { "projects_total": 0, "sessions_total": 0, "actions_total": 0, "complete": 0, "incomplete": 0 },
  "sessions": [...],
  "session_summary": { ... },
  "page": { "limit": 100, "offset": 0, "total": 0, "has_more": false },
  "filter_options": { "property_types": [], "groups": [], "sources": [], "processes": [], "element_types": [], "completeness": ["all", "complete", "incomplete"] },
  "applied_filters": { ... },
  "metrics": { "total_rows": 0, "filtered_rows": 0, "page_rows": 0, ... },
  "empty_state": { "kind": "...", "scope": "...", "message_key": "..." },
  "source_state": { "source": "...", "namespace": "...", "heavy_payload_excluded": true, "mutation_allowed": false, ... }
}
```
- This is the **unified envelope** with all fields present.
- The product-actions registry is missing `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state`.

## 5. frontend/src/components/process/InterviewStage.jsx — analysis consumption

**Key reads**:
- `data?.analysis` is used via `useInterviewSessionState` (line 185) and passed into derived state.
- `countProductActionsForStep(data?.analysis, step)` (line 80) reads `analysisRaw?.product_actions` as an array.
- `selectedStepProductActionCount` (line 615) counts actions for the active step.
- `productActionCountByStepId` (line 620) builds a map of step_id → action count from `data?.analysis`.

**Shape expected**:
- `analysis.product_actions` — array of action objects.
- No normalization of `analysis` itself inside InterviewStage; it relies on `normalizeInterview` from utils.

## 6. frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx — registry consumption

**Key reads**:
- `interviewData?.analysis?.product_actions` is passed to `buildProductActionRegistryRows` (line 217) for the session-scope fallback.
- `readSessionProductActions(sessionRaw)` (line 38) reads `session?.interview?.analysis?.product_actions`.

**Client-side assembly**:
- When `scope === "session"`, the panel uses `currentRows` built locally from `interviewData` instead of backend registry rows.
- When `scope === "workspace"` or `"project"`, it queries the backend registry endpoint and gets backend-normalized rows.
- This creates a **dual-path**: session-scope rows are frontend-normalized; cross-scope rows are backend-normalized.

**Frontend normalization** (`normalizeBackendRows`, lines 43–54):
- Adds `registry_id`, ensures `id`, forces `completeness` to `"complete"|"incomplete"`, ensures `missing_fields` is an array.

## 7. frontend/src/features/process/analysis/interviewAnalysisPatchHelper.js — analysis mutation

**Key behavior**:
- `buildInterviewAnalysisPatchPayload` (lines 53–68) wraps a patch into `{ interview: { analysis: { ...patch } } }`.
- `patchInterviewAnalysis` (lines 70–116) calls `enqueueSessionPatchCasWrite` with the above payload.
- This writes to the generic session PATCH endpoint, which saves the entire `interview_json` back to storage.
- Any key under `analysis` is clobbered/merged at the `analysis` level; there is no sub-key CAS.

**Implication**:
- `product_actions_batch_draft` is written via the same generic path as `product_actions`.
- There is no semantic separation between durable analysis facts and runtime draft state at the API layer.

## 8. frontend/src/components/process/interview/utils.js — normalizeInterview

**Key behavior** (lines 784–936):
- `normalizeInterview` calls `mergeInterviewAnalysisNamespace({}, src)` (line 918) to extract `analysis`.
- `mergeInterviewAnalysisNamespace` (lines 91–103) merges `base.analysis` with `incoming.analysis` shallowly.
- It preserves `analysis` as an opaque dict; no field-level normalization of `product_actions` inside `normalizeInterview`.
- Custom keys under `analysis` are preserved because the merge is shallow.

## 9. frontend/src/features/process/analysis/productActionsRegistryModel.js — frontend normalization model

**Key behavior**:
- `buildProductActionRegistryRows` (lines 51–83) calls `normalizeProductActionsList` (imported from `productActionsModel.js`) then adds registry metadata.
- `productActionRegistryCompleteness` (lines 42–48) uses the same 4 required fields as the backend (`product_name`, `product_group`, `action_type`, `action_object`).
- Adds `registry_id`, `project_id`, `project_title`, `session_id`, `session_title`, `completeness`, `missing_fields`, `raw_action_id`.
- Frontend completeness logic matches backend `_completeness` in intent, but is implemented separately.

## Source truth summary table

| Source | Reads | Writes | Durability | Key lines |
|---|---|---|---|---|
| `storage.py` | `interview_json` | `interview_json` | DB durable | 830–867, 3079–3179 |
| `product_actions_ai.py` | `interview.analysis.product_actions` | `interview.analysis.product_actions_batch_draft` | DB durable (draft) | 199–221, 530–536 |
| `product_actions_registry.py` | `interview_json` → `product_actions[]` | — | Read-only | 192–231, 427 |
| `process_properties_registry.py` | `bpmn_meta_json`, `bpmn_xml` | — | Read-only | 592–682 |
| `InterviewStage.jsx` | `data?.analysis?.product_actions` | — | Client-side | 80, 615, 620 |
| `ProductActionsRegistryPanel.jsx` | `interviewData?.analysis?.product_actions` | — | Client-side | 38, 217 |
| `interviewAnalysisPatchHelper.js` | — | `interview.analysis` patch | DB durable | 53–68, 70–116 |
| `utils.js` | `src.analysis` | Preserves in normalized interview | Client-side | 91–103, 918 |
| `productActionsRegistryModel.js` | `product_actions[]` | — | Client-side | 42–83 |
