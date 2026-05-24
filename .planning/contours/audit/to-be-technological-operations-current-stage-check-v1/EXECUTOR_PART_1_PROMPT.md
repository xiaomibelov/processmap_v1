# Agent 2 / Executor Prompt — Part 1

**Contour**: `audit/to-be-technological-operations-current-stage-check-v1`  
**Run ID**: `20260520T184059Z-28875`  
**Mode**: `TOKEN_ECONOMY_SINGLE_EXECUTOR` — this is the only substantive executor prompt.

## Your Task

Perform a cold source-code audit comparing the actual ProcessMap codebase against the Enterprise Target Model (TO-BE) defined in:
- `docs/enterprise_target_model_to_be.md`
- `docs/enterprise_impl_factpack.md`

Produce three deliverables with exact file:line evidence.

## Rules

- **DO NOT modify any product code.**
- **DO NOT write BPMN XML, modify DB, or deploy.**
- Read files; do not guess. Every rating must have file:line evidence or explicit "not found".
- If a TO-BE item is partially implemented, describe exactly what exists and what is missing.

## Audit Categories

### Category 1 — Schema & Tenancy Columns

Check `backend/app/storage.py` `_ensure_schema` and table definitions:
- `orgs` table: columns `id`, `name`, `slug`, `status`, `created_at`, `updated_at`
- `memberships` table: columns `id`, `org_id`, `user_id`, `role`, `status`, `invited_by`, `created_at`, `updated_at`
- `invites` table (if any)
- `audit_logs` table (if any)
- `projects` table: `org_id`, `workspace_id`, `created_by`, `updated_by`
- `sessions` table: `org_id`, `workspace_id`, `created_by`, `updated_by`
- Any other entity with `org_id`

**Deliverable in GAP_ANALYSIS_REPORT.md**: For each table, state EXISTING columns with line numbers, MISSING columns, and DEFAULT values used as placeholders.

### Category 2 — Storage Scoping & Context

Check `backend/app/storage.py`:
- `_REQ_ORG_ID` ContextVar existence and usage
- `push_storage_request_scope` signature (does it accept `org_id`?)
- `_org_clause` existence and usage
- Owner/admin clause vs org clause interaction
- `Storage.load/save/delete/list` — is org filter applied?
- `ProjectStorage.list/load/save/delete` — is org filter applied?
- `_maybe_migrate_legacy_files` — any backfill logic for `org_id`?

**Deliverable**: File:line evidence for each primitive. Note backward-compatibility mechanisms.

### Category 3 — Auth & Membership

Check `backend/app/auth.py` and `backend/app/main.py`:
- `create_access_token` — does it include `active_org_id` claim?
- `issue_login_tokens` — does it resolve default org?
- Any `orgs` or `memberships` read methods in auth layer?
- `auth_guard_middleware` — does it resolve org from path or header?
- Does it validate membership/policy?
- Token decode — backward compatibility with old tokens?

**Deliverable**: File:line evidence. State exactly which claims exist.

### Category 4 — API Endpoints (Dual Routing)

Check `backend/app/main.py`:
- Any `/api/orgs/{org_id}/...` routes? List them with handler names and line numbers.
- Legacy routes (`/api/projects`, `/api/sessions`, `/api/reports`, `/api/sessions/{sid}/export`) — do they resolve `default_org_id` internally?
- Error returns: list handlers returning `{"error": ...}` with HTTP 200 vs proper 401/403/404/422.

**Deliverable**: Complete route inventory in two tables: (a) New org-scoped, (b) Legacy with org-resolution status.

### Category 5 — Frontend Org Support

Check frontend files:
- `frontend/src/features/auth/AuthProvider.jsx`: `orgs`, `active_org_id`, `default_org_id`, `switchOrg` — state shape and methods.
- `frontend/src/RootApp.jsx`: org-select gate between auth success and `<App />`?
- `frontend/src/lib/api.js`: `X-Active-Org-Id` header propagation? Org-path builders?
- `frontend/src/App.jsx`: `refreshProjects`/`refreshSessions` — blocked until active org known?
- `frontend/src/components/TopBar.jsx`: org selector UI?

**Deliverable**: File:line evidence for each frontend primitive. State if UI exists or only data structures.

### Category 6 — Error Contract & Audit Logging

- Unified error format adoption across new vs legacy endpoints.
- Any `AuditLog` writes in backend?
- Any middleware or decorator logging write/delete operations?

### Category 7 — Migration & Backfill

- Is there a schema version marker for enterprise bootstrap?
- Any backfill logic for `owner_user_id` → `org_id`?
- Any `FPC_DEFAULT_ORG_ID` or similar env-based fallback?

## Output Files (write to contour directory)

1. `CURRENT_STAGE_CHECKLIST.md`
   - One section per category above.
   - Each item rated: `DONE` | `PARTIAL` | `MISSING` | `UNKNOWN`
   - One-line evidence reference per item.

2. `GAP_ANALYSIS_REPORT.md`
   - Full file:line citations.
   - For `PARTIAL` items, describe exactly what exists and what is missing.
   - Include code snippets only when necessary for clarity (keep < 5 lines per snippet).

3. `NEXT_CONTOUR_RECOMMENDATION.md`
   - Prioritized list of gaps.
   - Suggested contour IDs and rough scope descriptions.
   - Risk assessment per gap.
   - Recommended execution order with rationale.

4. `EXEC_REPORT.md`
   - Executive summary (max 30 lines).
   - Overall readiness score (e.g., "Schema 70%, Auth 40%, API 10%, Frontend 50%").
   - Top 3 blockers for enterprise MVP.

## Handoff

After writing all four files, touch `EXECUTION_STARTED` and `WORKER_2_DONE`. Agent 3 will merge (shell-only in single-lane mode) and hand off to Agent 4.
