# Mutation Endpoints Gap Analysis

- contour: `feature/process-analysis-session-backend-view-model-contract-v1`
- run_id: `20260520T224346Z-55320`
- generated_at: `2026-05-20T22:49Z`

## 1. Current mutation paths for product actions

### 1.1 AI suggest + accept (single step)
- `POST /api/sessions/{session_id}/analysis/product-actions/suggest`
  - Reads `interview.analysis.product_actions` for context.
  - Returns suggestions; does NOT mutate durable state.
- Acceptance is performed by the frontend calling `acceptAiProductActions` (`productActionsPersistence.js`), which patches `interview.analysis.product_actions` via the generic session PATCH.

### 1.2 AI batch suggest + batch draft
- `POST /api/sessions/{session_id}/analysis/product-actions/batch-suggest`
  - Generates suggestions for multiple steps.
  - Writes the draft into `interview.analysis.product_actions_batch_draft` via `_save_batch_draft_to_session` (`product_actions_ai.py:530–536`).
  - **This is a mutation that writes derived/runtime state into durable storage.**
- `GET /api/sessions/{session_id}/analysis/product-actions/batch-draft`
  - Reads the draft back from `interview.analysis.product_actions_batch_draft`.
- `PUT /api/sessions/{session_id}/analysis/product-actions/batch-draft`
  - Directly mutates `interview.analysis.product_actions_batch_draft`.
  - Also writes derived/runtime state into durable storage.

### 1.3 Bulk AI suggest
- `POST /api/analysis/product-actions/suggest-bulk`
  - Calls single suggest for multiple sessions.
  - Does NOT mutate durable state directly; returns suggestions per session.
  - Frontend then accepts per session via `acceptAiProductActions` (generic PATCH).

### 1.4 Manual save / edit
- Frontend edits product actions inline (e.g., in `ProductActionsRegistryPanel.jsx` or interview step panel).
- Changes are saved via `patchInterviewAnalysis` (`interviewAnalysisPatchHelper.js:70–116`), which builds a payload:
  ```json
  { "interview": { "analysis": { "product_actions": [...] } } }
  ```
  and sends it through `enqueueSessionPatchCasWrite` → generic session PATCH.
- This overwrites the entire `product_actions` array (or merges at the `analysis` level). There is no row-level CAS or PATCH semantics.

### 1.5 Generic session PATCH
- The underlying API is the session-wide PATCH endpoint.
- It receives the full `interview` blob (or partial keys) and saves `interview_json` to the DB.
- Any mutation to `analysis.product_actions`, `analysis.product_actions_batch_draft`, or any custom analysis key goes through this same path.

## 2. Current mutation paths for process properties

### 2.1 BPMN meta / Camunda extensions
- Process properties are extracted from `bpmn_meta_json` and `bpmn_xml`.
- There is **no dedicated mutation endpoint** for process properties in the registry router.
- Properties are mutated indirectly by:
  - Editing BPMN XML (diagram save).
  - Editing Camunda extensions in the diagram modeler.
  - Both paths go through diagram save endpoints, not analysis endpoints.

### 2.2 Registry endpoint status
- `POST /api/analysis/properties/registry/query` is read-only.
- Export endpoints (`export.csv`, `export.xlsx`) are read-only.

## 3. What writes to interview_json vs what should be separate

### Writes to interview_json today

| Mutation | Target in interview_json | Should it be in interview_json? |
|---|---|---|
| Manual save of product action | `analysis.product_actions[]` | **Yes** — durable business data |
| AI batch draft | `analysis.product_actions_batch_draft` | **No** — runtime/derived state |
| Accept AI suggestion | `analysis.product_actions[]` | **Yes** — becomes durable business data |
| Custom analysis keys | `analysis.*` | **Yes** — durable business data |

### Recommended separation

| State | Current storage | Recommended storage | Endpoint |
|---|---|---|---|
| `product_actions` (durable) | `interview_json` | Keep in `interview_json` or migrate to dedicated table | `PATCH /api/sessions/{session_id}/analysis/product-actions` |
| `product_actions_batch_draft` (derived) | `interview_json` | Separate ephemeral store (Redis / memory / separate JSONB column) | `PUT /api/sessions/{session_id}/analysis/product-actions/batch-draft` (keep path, change storage) |
| `ai_suggestions` (derived) | Not stored | Ephemeral / cached | `POST /api/sessions/{session_id}/analysis/product-actions/suggest` (already read-only) |
| Process properties | `bpmn_meta_json` | Keep in `bpmn_meta_json` | Diagram save endpoints (already separate) |

## 4. Recommended separation: view model = read-only; mutations = dedicated endpoints

### View model endpoints (read-only)
- `GET /api/sessions/{session_id}/analysis/view-model`
- `POST /api/sessions/{session_id}/analysis/view-model/query`
- These must NOT accept mutation payloads and must NOT write to the DB.

### Dedicated mutation endpoints

#### Product actions
| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/sessions/{session_id}/analysis/product-actions` | Add a new product action |
| `PATCH` | `/api/sessions/{session_id}/analysis/product-actions/{action_id}` | Edit a product action |
| `DELETE` | `/api/sessions/{session_id}/analysis/product-actions/{action_id}` | Remove a product action |
| `POST` | `/api/sessions/{session_id}/analysis/product-actions/batch` | Batch add/update/delete |
| `PUT` | `/api/sessions/{session_id}/analysis/product-actions/batch-draft` | Save AI batch draft (to ephemeral store) |
| `POST` | `/api/sessions/{session_id}/analysis/product-actions/accept-draft` | Accept draft rows into durable `product_actions` |

#### Process properties
| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/sessions/{session_id}/analysis/properties/query` | Session-scoped properties query (already exists in registry form) |
| (keep) | Diagram save endpoints | Properties are a side-effect of BPMN mutation |

#### Interview analysis (generic)
| Method | Endpoint | Purpose |
|---|---|---|
| `PATCH` | `/api/sessions/{session_id}/analysis` | Mutate non-product-action analysis keys (custom fields) |

## 5. Gap analysis summary

| # | Gap | Current state | Target state | Risk |
|---|---|---|---|---|
| 1 | No row-level CRUD for product actions | Generic session PATCH overwrites `analysis.product_actions` | Dedicated `POST/PATCH/DELETE` endpoints for product actions | Medium — requires new router and CAS logic |
| 2 | Batch draft mixed with durable data | Draft stored in `interview_json` | Draft stored in ephemeral / separate storage | Low — path can stay, storage changes |
| 3 | No session-scoped properties mutation endpoint | Properties mutated via diagram save | Keep diagram save; add read-only session query | Low |
| 4 | View model does not exist | Frontend assembles session analysis | Backend provides unified view model | Medium — this contour's deliverable |
| 5 | Generic PATCH is the only mutation path | All analysis mutations go through one endpoint | Split into dedicated endpoints by entity | Medium — requires API versioning or migration |

## 6. Non-goals for this contour

- Do not implement the endpoints.
- Do not migrate `product_actions_batch_draft` out of `interview_json`.
- Do not change the existing registry endpoints.
- Do not modify `frontend/src/` or `backend/app/` product code.
