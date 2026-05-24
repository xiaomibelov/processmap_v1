# Current Stage Checklist — audit/to-be-technological-operations-current-stage-check-v1

**Run ID**: `20260520T184059Z-28875`  
**Auditor**: Agent 2 / Executor Part 1  
**Mode**: TOKEN_ECONOMY_SINGLE_EXECUTOR

---

## Category 1 — Schema & Tenancy Columns

| Item | Rating | Evidence |
|------|--------|----------|
| `orgs` table exists | **DONE** | `backend/app/storage.py:1029` |
| `orgs` columns: `id`, `name`, `created_at`, `created_by` | **DONE** | `backend/app/storage.py:1029-1043` |
| `orgs` columns: `slug`, `status`, `updated_at` | **MISSING** | Not in `CREATE TABLE` statement |
| `org_memberships` table exists | **DONE** | `backend/app/storage.py:1048` |
| `org_memberships` columns: `org_id`, `user_id`, `role`, `created_at` | **DONE** | `backend/app/storage.py:1048-1054` |
| `org_memberships` columns: `id`, `status`, `invited_by`, `updated_at` | **MISSING** | Not in schema; PK is composite `(org_id, user_id)` |
| `invites` table | **MISSING** | No `CREATE TABLE invites` found in schema |
| `audit_logs` table | **MISSING** | No `CREATE TABLE audit_logs` found in schema |
| `projects` table: `org_id` | **DONE** | `backend/app/storage.py:821` (default `'org_default'`) |
| `projects` table: `workspace_id` | **DONE** | `backend/app/storage.py:822` (added via ALTER at `1622`) |
| `projects` table: `created_by`, `updated_by` | **DONE** | `backend/app/storage.py:822-823` |
| `sessions` table: `org_id` | **DONE** | `backend/app/storage.py:862` (default `'org_default'`) |
| `sessions` table: `created_by`, `updated_by` | **DONE** | `backend/app/storage.py:863-864` |
| `sessions` table: `workspace_id` | **MISSING** | No `workspace_id` column in sessions table |
| `bpmn_versions` / `session_state_versions` / `session_presence` / `note_threads` / `note_comment_mentions` have `org_id` | **DONE** | `storage.py:895`, `920`, `878`, `941`, `987` |

---

## Category 2 — Storage Scoping & Context

| Item | Rating | Evidence |
|------|--------|----------|
| `_REQ_ORG_ID` ContextVar | **DONE** | `backend/app/storage.py:31` |
| `push_storage_request_scope` accepts `org_id` | **DONE** | `backend/app/storage.py:60` |
| `_org_clause` helper | **DONE** | `backend/app/storage.py:453-457` |
| `Storage.load` applies org filter | **DONE** | `backend/app/storage.py:2704` |
| `Storage.save` applies org scope check | **DONE** | `backend/app/storage.py:2748-2749` |
| `Storage.delete` applies org filter | **DONE** | `backend/app/storage.py:2906` |
| `Storage.list` applies org filter | **DONE** | `backend/app/storage.py:2951-2953` |
| `ProjectStorage.list` applies org filter | **DONE** | `backend/app/storage.py:3567` |
| `ProjectStorage.load` applies org filter | **DONE** | `backend/app/storage.py:3591` |
| `ProjectStorage.save` applies org scope check | **DONE** | `backend/app/storage.py:3626-3627` |
| `ProjectStorage.delete` applies org filter | **DONE** | `backend/app/storage.py:3687` |
| `_maybe_migrate_legacy_files` backfills `org_id` | **MISSING** | Legacy migration inserts without `org_id`; defaults to `'org_default'` at runtime |

---

## Category 3 — Auth & Membership

| Item | Rating | Evidence |
|------|--------|----------|
| `create_access_token` includes `active_org_id` claim | **MISSING** | `backend/app/auth.py:415-423` — payload only has `sub`, `iat`, `exp`, `type` |
| `issue_login_tokens` resolves default org | **MISSING** | `backend/app/auth.py:576-601` — no org claim or resolution |
| `auth_guard_middleware` resolves org from path | **DONE** | `backend/app/startup/middleware.py:126` (`extract_org_from_path`) |
| `auth_guard_middleware` resolves org from header | **DONE** | `backend/app/startup/middleware.py:127` (`extract_org_from_headers`) |
| `auth_guard_middleware` validates membership | **DONE** | `backend/app/startup/middleware.py:130` (`user_has_org_membership`) |
| `auth_guard_middleware` stores `active_org_id` in request state | **DONE** | `backend/app/startup/middleware.py:135` |
| Token decode backward compatibility | **DONE** | Old tokens without `active_org_id` still decode; resolution falls back to `resolve_active_org_id` at request time |
| `auth_me` returns `orgs`, `active_org_id`, `default_org_id` | **DONE** | `backend/app/_legacy_main.py:3465-3485` |

---

## Category 4 — API Endpoints (Dual Routing)

### New Org-Scoped Routes

| Route | Handler | Line | Status |
|-------|---------|------|--------|
| `GET /api/orgs` | `list_orgs_endpoint` | `routers/org_listing.py:32` | DONE |
| `POST /api/orgs` | `create_org_endpoint` | `routers/org_listing.py:37` | DONE |
| `GET /api/orgs/{org_id}/members` | `list_org_members_endpoint` | `routers/org_members.py:12` | DONE |
| `GET /api/orgs/{org_id}/assignable-users` | `list_org_assignable_users_endpoint` | `routers/org_members.py:17` | DONE |
| `POST /api/orgs/{org_id}/members/assign` | `assign_org_member` | `routers/org_listing.py:54` | DONE |
| `GET /api/orgs/{org_id}/invites` | `list_org_invites_endpoint` | `routers/org_invites.py:13` | DONE |
| `POST /api/orgs/{org_id}/invites` | `create_org_invite_endpoint` | `routers/org_invites.py:19` | DONE |
| `POST /api/orgs/{org_id}/invites/accept` | `accept_org_invite_endpoint` | `routers/org_invites.py:25` | DONE |
| `POST /api/orgs/{org_id}/invites/{id}/revoke` | `revoke_org_invite_endpoint` | `routers/org_invites.py:35` | DONE |
| `GET /api/orgs/{org_id}/projects` | (legacy routed) | `_legacy_main.py:8964` | DONE |
| `POST /api/orgs/{org_id}/projects` | (legacy routed) | `_legacy_main.py:8979` | DONE |
| `GET /api/orgs/{org_id}/projects/{pid}` | (legacy routed) | `_legacy_main.py:9009` | DONE |
| `GET /api/orgs/{org_id}/projects/{pid}/sessions` | (legacy routed) | `_legacy_main.py:9022` | DONE |
| `POST /api/orgs/{org_id}/projects/{pid}/sessions` | (legacy routed) | `_legacy_main.py:9049` | DONE |
| `GET /api/orgs/{org_id}/sessions/{sid}/reports/versions` | (legacy routed) | `_legacy_main.py:9576` | DONE |
| `POST /api/orgs/{org_id}/sessions/{sid}/reports/build` | (legacy routed) | `_legacy_main.py:9607` | DONE |
| `GET /api/orgs/{org_id}/sessions/{sid}/reports/{vid}` | (legacy routed) | `_legacy_main.py:9646` | DONE |
| `DELETE /api/orgs/{org_id}/sessions/{sid}/reports/{vid}` | (legacy routed) | `_legacy_main.py:9688` | DONE |
| `GET /api/orgs/{org_id}/sessions/{session_id}` | **MISSING** | No route found |
| `PUT/PATCH/DELETE /api/orgs/{org_id}/sessions/{session_id}` | **MISSING** | No route found |
| `GET /api/orgs/{org_id}/sessions/{session_id}/export` | **MISSING** | No route found |
| `GET /api/orgs/{org_id}/reports/{report_id}` | **MISSING** | No route found |

### Legacy Routes (org resolution via `_request_active_org_id`)

| Route | Org Resolution | Evidence |
|-------|---------------|----------|
| `GET /api/projects` | **DONE** | `_legacy_main.py:9739` uses `_request_active_org_id` |
| `POST /api/projects` | **DONE** | `_legacy_main.py:9754` uses `_request_active_org_id` |
| `GET /api/projects/{pid}` | **DONE** | `_legacy_load_project_scoped` resolves org |
| `PATCH /api/projects/{pid}` | **DONE** | `_legacy_load_project_scoped` resolves org |
| `PUT /api/projects/{pid}` | **DONE** | `_legacy_load_project_scoped` resolves org |
| `DELETE /api/projects/{pid}` | **DONE** | `_legacy_load_project_scoped` resolves org |
| `GET /api/sessions` | **DONE** | `_legacy_main.py:3726` uses `_request_active_org_id` |
| `POST /api/sessions` | **DONE** | `_legacy_main.py:3580` uses `_request_active_org_id` |
| `GET /api/sessions/{sid}` | **PARTIAL** | `_legacy_main.py:3741` returns `{"error": "not found"}` with HTTP 200 |
| `PATCH /api/sessions/{sid}` | **PARTIAL** | `_legacy_main.py:3889` returns `{"error": "not found"}` with HTTP 200 |
| `PUT /api/sessions/{sid}` | **PARTIAL** | `_legacy_main.py:4206` returns `{"error": "not found"}` with HTTP 200 |
| `DELETE /api/sessions/{sid}` | **PARTIAL** | `_legacy_main.py:4176` returns `{"error": "session_not_found"}` with HTTP 200 |
| `GET /api/reports/{rid}` | **PARTIAL** | `_legacy_main.py:5201` returns `{"error": "not found"}` with HTTP 200 |
| `DELETE /api/reports/{rid}` | **PARTIAL** | `_legacy_main.py:5231` returns `{"error": "not found"}` with HTTP 200 |
| `GET /api/sessions/{sid}/export` | **PARTIAL** | `_legacy_main.py:4307` returns `{"error": "not found"}` with HTTP 200 |

---

## Category 5 — Frontend Org Support

| Item | Rating | Evidence |
|------|--------|----------|
| `AuthProvider.jsx`: `orgs`, `activeOrgId`, `defaultOrgId`, `switchOrg` | **DONE** | `frontend/src/features/auth/AuthProvider.jsx:20-91` |
| `RootApp.jsx`: org-select gate | **DONE** | `frontend/src/RootApp.jsx:42-76` (`OrgSelectScreen`), `114` (`shouldSelectOrg`) |
| `apiCore.js`: `X-Active-Org-Id` header propagation | **DONE** | `frontend/src/lib/apiCore.js:280-295` (`orgId` passed to `apiFetch` with `withOrgHeader: true`) |
| `apiRoutes.js`: org-path builders | **DONE** | `frontend/src/lib/apiRoutes.js:29-68` (`orgs.projects`, `orgs.sessions`, etc.) |
| `App.jsx`: `refreshProjects`/`refreshSessions` triggered by `activeOrgId` change | **DONE** | `frontend/src/App.jsx:3190-3208` (`useEffect` on `activeOrgId`) |
| `TopBar.jsx`: org selector UI | **DONE** | `frontend/src/components/TopBar.jsx:297-309` (current org display), `679` (dropdown value) |

---

## Category 6 — Error Contract & Audit Logging

| Item | Rating | Evidence |
|------|--------|----------|
| Unified `enterprise_error` helper exists | **DONE** | `backend/app/legacy/request_context.py:33-46` |
| `_audit_log_safe` writes audit records | **PARTIAL** | `_legacy_main.py:7950+`; called for project create/update/delete, but NOT for all write/delete ops |
| Audit table persistence | **MISSING** | No `audit_logs` table in schema; `_audit_log_safe` may write to an ephemeral or unconfirmed store |
| Middleware/decorator for automatic write/delete logging | **MISSING** | No generic decorator; manual `_audit_log_safe` calls only |
| Legacy endpoints returning `{"error": ...}` with HTTP 200 | **PARTIAL** | Multiple occurrences: `_legacy_main.py:3744`, `3864`, `3881`, `3897`, `4212`, `4303`, `4518`, `5202` |

---

## Category 7 — Migration & Backfill

| Item | Rating | Evidence |
|------|--------|----------|
| Schema version marker (`_ENTERPRISE_BOOTSTRAP_MARK`) | **DONE** | `backend/app/storage.py:37` |
| Backfill logic for `owner_user_id` → `org_id` | **MISSING** | `_maybe_migrate_legacy_files` (`storage.py:1789`) inserts without `org_id`; relies on runtime default |
| `FPC_DEFAULT_ORG_ID` env fallback | **DONE** | `backend/app/storage.py:39` |
| `FPC_DEFAULT_ORG_NAME` env fallback | **DONE** | `backend/app/storage.py:40` |
| Workspace bootstrap on first project create | **DONE** | `ProjectStorage.create` calls `_ensure_workspace_record` (`storage.py:3531`) |
