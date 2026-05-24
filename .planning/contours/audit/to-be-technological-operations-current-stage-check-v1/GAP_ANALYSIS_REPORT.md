# Gap Analysis Report — audit/to-be-technological-operations-current-stage-check-v1

**Run ID**: `20260520T184059Z-28875`  
**Auditor**: Agent 2 / Executor Part 1

---

## Category 1 — Schema & Tenancy Columns

### 1.1 `orgs` Table

**Existing** (`backend/app/storage.py:1029-1043`):
```sql
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  git_mirror_enabled INTEGER NOT NULL DEFAULT 0,
  git_provider TEXT NOT NULL DEFAULT '',
  git_repository TEXT NOT NULL DEFAULT '',
  git_branch TEXT NOT NULL DEFAULT '',
  git_base_path TEXT NOT NULL DEFAULT '',
  git_health_status TEXT NOT NULL DEFAULT 'unknown',
  git_health_message TEXT NOT NULL DEFAULT '',
  git_updated_at INTEGER NOT NULL DEFAULT 0,
  git_updated_by TEXT NOT NULL DEFAULT ''
)
```

**Missing per TO-BE**:
- `slug` — not present.
- `status` — not present.
- `updated_at` — not present.

**Note**: `orgs` table has extra git-mirror columns not in TO-BE MVP.

### 1.2 `org_memberships` Table

**Existing** (`backend/app/storage.py:1048-1054`):
```sql
CREATE TABLE IF NOT EXISTS org_memberships (
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, user_id)
)
```

**Missing per TO-BE**:
- `id` — composite PK used instead.
- `status` — not present.
- `invited_by` — not present.
- `updated_at` — not present.

### 1.3 `invites` Table

**Missing entirely** — no `CREATE TABLE invites` or `CREATE TABLE org_invites` found in `_ensure_schema`.

Invite functionality appears to exist in `_legacy_main.py` (e.g., `preview_org_invite`, `accept_org_invite_endpoint`) but storage location is unconfirmed from schema inspection.

### 1.4 `audit_logs` Table

**Missing entirely** — no `CREATE TABLE audit_logs` found in `_ensure_schema`.

`_audit_log_safe` is defined at `_legacy_main.py:7950` and invoked at project create/update/delete, but without a dedicated table the durability of audit records is unverified.

### 1.5 `projects` Table

**Existing** (`backend/app/storage.py:812-824`):
- `org_id TEXT NOT NULL DEFAULT 'org_default'` — present.
- `workspace_id TEXT NOT NULL DEFAULT ''` — present (also ALTER at `1622`).
- `created_by TEXT NOT NULL DEFAULT ''` — present.
- `updated_by TEXT NOT NULL DEFAULT ''` — present.
- `owner_user_id` retained as legacy — present.

### 1.6 `sessions` Table

**Existing** (`backend/app/storage.py:830-867`):
- `org_id TEXT NOT NULL DEFAULT 'org_default'` — present.
- `created_by TEXT NOT NULL DEFAULT ''` — present.
- `updated_by TEXT NOT NULL DEFAULT ''` — present.
- `workspace_id` — **MISSING**.

### 1.7 Other Entities with `org_id`

| Table | `org_id` Status | Line |
|-------|----------------|------|
| `session_presence` | Present (default `'org_default'`) | `878` |
| `bpmn_versions` | Present (default `'org_default'`) | `895` |
| `session_state_versions` | Present (default `'org_default'`) | `920` |
| `note_threads` | Present (default `'org_default'`) | `941` |
| `note_comment_mentions` | Present (default `'org_default'`) | `987` |
| `ai_execution_log` | Present (default `'org_default'`) | `1586` |
| `workspace_folders` | Present (default `'org_default'`) | `1601` |

---

## Category 2 — Storage Scoping & Context

### 2.1 Context Variables

**Done**:
- `_REQ_USER_ID` — `storage.py:29`
- `_REQ_IS_ADMIN` — `storage.py:30`
- `_REQ_ORG_ID` — `storage.py:31`

### 2.2 Scope Push/Pop

**Done**:
- `push_storage_request_scope(user_id, is_admin, org_id)` — `storage.py:60-64`
- `pop_storage_request_scope(tokens)` — `storage.py:67-82`
- `_scope_org_id(override)` — `storage.py:97-100`

### 2.3 Filter Clauses

**Done**:
- `_owner_clause` — `storage.py:447-450`
- `_org_clause` — `storage.py:453-457`

### 2.4 `Storage` CRUD Org Filtering

| Method | Org Filter Applied | Line |
|--------|-------------------|------|
| `load` | `_org_clause(org)` + `_owner_clause` | `2704` |
| `save` | `existing_org` vs `org_scope` check; raises `PermissionError` | `2748-2749` |
| `delete` | `_org_clause(org)` + `_owner_clause` | `2906` |
| `list` | `filters.append("org_id = ?")` | `2951-2953` |

### 2.5 `ProjectStorage` CRUD Org Filtering

| Method | Org Filter Applied | Line |
|--------|-------------------|------|
| `create` | `org_id` written explicitly; `_ensure_workspace_record` | `3522-3553` |
| `list` | `WHERE org_id = ?` (admin) or `WHERE org_id = ? AND owner_user_id = ?` | `3567-3571` |
| `load` | `_org_clause(org)` + `_owner_clause` | `3591-3596` |
| `save` | `existing_org` vs `org_scope` check; raises `PermissionError` | `3626-3627` |
| `delete` | `_org_clause(org)` + `_owner_clause` | `3687-3692` |

### 2.6 Backfill Logic

**Missing**:
- `_maybe_migrate_legacy_files` (`storage.py:1789-1882`) migrates legacy JSON files into SQLite but does NOT set `org_id`.
- Sessions insert at `1814-1856` omits `org_id`, `created_by`, `updated_by`.
- Projects insert at `1873-1880` omits `org_id`, `workspace_id`, `created_by`, `updated_by`.
- After migration, rows rely on column defaults (`'org_default'`, `''`).

---

## Category 3 — Auth & Membership

### 3.1 Token Claims

**Missing**:
- `create_access_token` (`auth.py:415-423`) payload:
  ```python
  {"sub": user_id, "iat": now, "exp": now + ttl, "type": "access"}
  ```
  No `active_org_id` claim.
- `create_refresh_token` (`auth.py:426-435`) also lacks org claim.
- `issue_login_tokens` (`auth.py:576-601`) does not resolve or embed default org.

### 3.2 Request-Time Org Resolution

**Done**:
- `auth_guard_middleware` (`middleware.py:107-144`):
  - Extracts `path_org_id` via `extract_org_from_path(path)` (`middleware.py:126`).
  - Extracts `header_org_id` via `extract_org_from_headers(request)` (`middleware.py:127`).
  - Validates membership via `user_has_org_membership(user_id, path_org_id, is_admin)` (`middleware.py:130`).
  - Resolves active org via `resolve_active_org_id(user_id, requested_org_id=..., is_admin=...)` (`middleware.py:134`).
  - Pushes scope with `active_org_id` (`middleware.py:137`).

### 3.3 Backward Compatibility

**Done**:
- Old tokens decode successfully (`auth.py:438-444`); no `active_org_id` required.
- Fallback resolution happens at request time in middleware.

### 3.4 Auth Me Response

**Done** (`_legacy_main.py:3465-3485`):
```python
return build_auth_me_payload(
    user_id=...,
    active_org_id=active_org_id,
    default_org_id=get_default_org_id(),
    orgs=memberships,
)
```

---

## Category 4 — API Endpoints

### 4.1 New Org-Scoped Routes (via `_legacy_main.py` and dedicated routers)

**Present**:
| Route | Line |
|-------|------|
| `GET /api/orgs` | `routers/org_listing.py:32` |
| `POST /api/orgs` | `routers/org_listing.py:37` |
| `GET /api/orgs/{org_id}/members` | `routers/org_members.py:12` |
| `POST /api/orgs/{org_id}/members/assign` | `routers/org_listing.py:54` |
| `GET /api/orgs/{org_id}/assignable-users` | `routers/org_members.py:17` |
| `GET/POST /api/orgs/{org_id}/invites` | `routers/org_invites.py:13,19` |
| `POST /api/orgs/{org_id}/invites/accept` | `routers/org_invites.py:25` |
| `POST /api/orgs/{org_id}/invites/{id}/revoke` | `routers/org_invites.py:35` |
| `GET /api/orgs/{org_id}/projects` | `_legacy_main.py:8964` |
| `POST /api/orgs/{org_id}/projects` | `_legacy_main.py:8979` |
| `GET /api/orgs/{org_id}/projects/{pid}` | `_legacy_main.py:9009` |
| `GET /api/orgs/{org_id}/projects/{pid}/sessions` | `_legacy_main.py:9022` |
| `POST /api/orgs/{org_id}/projects/{pid}/sessions` | `_legacy_main.py:9049` |
| `GET /api/orgs/{org_id}/sessions/{sid}/reports/versions` | `_legacy_main.py:9576` |
| `POST /api/orgs/{org_id}/sessions/{sid}/reports/build` | `_legacy_main.py:9607` |
| `GET /api/orgs/{org_id}/sessions/{sid}/reports/{vid}` | `_legacy_main.py:9646` |
| `DELETE /api/orgs/{org_id}/sessions/{sid}/reports/{vid}` | `_legacy_main.py:9688` |

**Missing**:
| Route | Reason |
|-------|--------|
| `GET /api/orgs/{org_id}/sessions/{session_id}` | Not implemented |
| `PATCH /api/orgs/{org_id}/sessions/{session_id}` | Not implemented |
| `PUT /api/orgs/{org_id}/sessions/{session_id}` | Not implemented |
| `DELETE /api/orgs/{org_id}/sessions/{session_id}` | Not implemented |
| `GET /api/orgs/{org_id}/sessions/{session_id}/export` | Not implemented |
| `GET /api/orgs/{org_id}/sessions/{session_id}/export.zip` | Not implemented |
| `GET /api/orgs/{org_id}/reports/{report_id}` | Not implemented |
| `DELETE /api/orgs/{org_id}/reports/{report_id}` | Not implemented |

### 4.2 Legacy Routes — Org Resolution Status

All major legacy routes resolve `org_id` internally via `_request_active_org_id(request)`:
- `GET/POST /api/projects` — `_legacy_main.py:9739,9754`
- `GET/PATCH/PUT/DELETE /api/projects/{pid}` — `_legacy_load_project_scoped`
- `GET/POST /api/sessions` — `_legacy_main.py:3726,3580`
- `GET/PATCH/PUT/DELETE /api/sessions/{sid}` — `_legacy_main.py:3741,3889,4206,4176`
- Reports and export endpoints also resolve org via `_request_active_org_id`.

### 4.3 Error Contract — Legacy Endpoints Returning HTTP 200 with `{"error": ...}`

| Line | Handler | Payload |
|------|---------|---------|
| `3744` | `get_session` | `{"error": "not found"}` |
| `3864` | `get_session_tldr` | `{"error": "not found"}` |
| `3881` | `get_session_analytics` | `{"error": "not found"}` |
| `3897` | `patch_session` | `{"error": "not found"}` |
| `4212` | `put_session` | `{"error": "not found"}` |
| `4303` | `export_session` | `{"error": "not found"}` |
| `4518` | `session_ai_questions` | `{"error": "not found"}` |
| `5202` | `get_report_version` | `{"error": "not found"}` |

Additionally, some delete endpoints return HTTP 200 with structured error:
- `4138` `delete_project_api`: `{"ok": False, "error": "project_not_found", ...}`
- `4179` `delete_session_api`: `{"ok": False, "error": "session_not_found", ...}`

---

## Category 5 — Frontend Org Support

### 5.1 `AuthProvider.jsx`

**Done** (`frontend/src/features/auth/AuthProvider.jsx`):
- State: `orgs`, `activeOrgId`, `defaultOrgId` (`:20-22`).
- `hydrateUser` parses `me.user.orgs`, `me.user.default_org_id`, `me.user.active_org_id` (`:35-53`).
- `refreshOrgs` calls `apiListOrgs()` and updates state (`:55-75`).
- `switchOrg` persists via `persistActiveOrgId`, updates state, optionally re-hydrates (`:77-91`).
- Context value exposes `orgs`, `activeOrgId`, `defaultOrgId`, `switchOrg`, `refreshOrgs` (`:180-206`).

### 5.2 `RootApp.jsx`

**Done** (`frontend/src/RootApp.jsx`):
- `OrgSelectScreen` component renders when `shouldSelectOrg` is true (`:42-76`, `:276-277`).
- Auto-selects single org via `useEffect` (`:153-166`).
- Stores choice in `sessionStorage` (`:201-218`).

### 5.3 `apiCore.js` — Header Propagation

**Done** (`frontend/src/lib/apiCore.js:274-296`):
```javascript
const orgId = endpoint.startsWith("/api") && !AUTH_RETRY_BLOCKLIST.has(endpoint) && opts.auth !== false
  ? String(getActiveOrgId() || "").trim()
  : "";
const res = await apiFetch({
  ...
  orgId,
  withOrgHeader: true,
});
```

**Note**: `apiFetch` is imported from `apiClient.js`; the header name used is unconfirmed from visible source but `withOrgHeader: true` indicates propagation is implemented.

### 5.4 `apiRoutes.js` — Org-Path Builders

**Done** (`frontend/src/lib/apiRoutes.js:29-68`):
- `orgs.list()`, `orgs.item(id)`, `orgs.members(id)`, `orgs.projects(id)`, `orgs.sessions(...)` etc.

### 5.5 `App.jsx` — Data Loaders

**Done** (`frontend/src/App.jsx:3190-3208`):
```javascript
useEffect(() => {
  if (!nextOrg || nextOrg === activeOrgIdRef.current) return;
  activeOrgIdRef.current = nextOrg;
  (async () => { await refreshProjects(); })();
}, [activeOrgId]);
```

### 5.6 `TopBar.jsx` — Org Selector UI

**Done** (`frontend/src/components/TopBar.jsx`):
- Displays current org name (`:308`).
- Dropdown bound to `activeOrgId` (`:679`).
- `switchOrg` called on selection (inferred from `TopBar.jsx:99-100`, `127`).

---

## Category 6 — Error Contract & Audit Logging

### 6.1 Unified Error Format

**Partial**:
- `enterprise_error` helper exists (`legacy/request_context.py:33-46`) and returns proper HTTP status + `{"error": {"code", "message", "details"}}`.
- Used in newer org endpoints (e.g., `routers/org_listing.py` raises `HTTPException`).
- Legacy endpoints still mix `HTTPException` (correct status) and `return {"error": ...}` (HTTP 200).

### 6.2 Audit Log Writes

**Partial**:
- `_audit_log_safe` defined at `_legacy_main.py:7950`.
- Called for:
  - Project create (`_legacy_main.py:9779`)
  - Project update (`_legacy_main.py:9839`)
  - Project delete (`_legacy_main.py:4161` via `_audit_log_safe` in delete path)
- NOT called for:
  - Session create/update/delete (not observed in inspected lines)
  - Report create/delete (not observed)
  - Org membership changes (not observed)

### 6.3 Middleware/Decorator for Automatic Logging

**Missing** — no generic middleware or decorator intercepts write/delete operations.

---

## Category 7 — Migration & Backfill

### 7.1 Schema Version Marker

**Done**:
- `_ENTERPRISE_BOOTSTRAP_MARK = "enterprise_org_bootstrap_v1"` (`storage.py:37`)
- `_MIGRATION_MARK = "legacy_file_to_sqlite_v1"` (`storage.py:36`)
- `_AUTH_USERS_BACKFILL_MARK = "auth_users_json_to_db_v1"` (`storage.py:38`)

### 7.2 Backfill for `owner_user_id` → `org_id`

**Missing**:
- `_maybe_migrate_legacy_files` inserts legacy rows without `org_id`, `created_by`, `updated_by`.
- No separate backfill routine maps `owner_user_id` to a derived `org_id`.

### 7.3 Env-Based Fallback

**Done**:
- `FPC_DEFAULT_ORG_ID` → `_DEFAULT_ORG_ID` (`storage.py:39`)
- `FPC_DEFAULT_ORG_NAME` → `_DEFAULT_ORG_NAME` (`storage.py:40`)
- `FPC_DEFAULT_WORKSPACE_NAME` → `_DEFAULT_WORKSPACE_NAME` (`storage.py:42-45`)
