# API Specification — Workspace Subprocess Tree View

## Endpoints

### 1. GET /api/projects/{project_id}/explorer

**Existing behavior preserved by default.** Adds optional query params for tree view.

#### Query params

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `workspace_id` | string | required | Workspace context |
| `root_only` | bool | `false` | If `true`, return only sessions where `parent_session_id` is NULL or empty |
| `include_children_meta` | bool | `false` | If `true`, each `SessionItem` includes `parent_session_id` and `has_children` |

#### Response (`ProjectPage`)

```json
{
  "project": { "id": "...", "name": "...", ... },
  "sessions": [
    {
      "id": "sess_root",
      "name": "Root process",
      "parent_session_id": "",
      "has_children": true,
      ...
    }
  ]
}
```

#### Changes

- `backend/app/routers/explorer.py:951-1008` — parse `root_only` and `include_children_meta`.
- `backend/app/routers/explorer.py:168-180` — extend `SessionItem` with:
  - `parent_session_id: str = ""`
  - `has_children: bool = False`
- `backend/app/storage.py:11277-11317` (`list_project_sessions_for_explorer`):
  - Accept `root_only: bool = False`, `include_children_meta: bool = False`.
  - When `root_only=True`, add SQL filter `COALESCE(parent_session_id,'') = ''`.
  - When `include_children_meta=True`, compute `has_children` per row via subquery or in-memory second pass.

#### Cache considerations

`_cached_project_sessions(oid, pid)` currently caches by project id only. Tree variants must use different cache keys to avoid collisions:

- Option A (recommended): bypass explorer cache when `root_only=true` or `include_children_meta=true`.
- Option B: include suffix in cache key, e.g., `explorer_get_sessions(pid, variant="root_only_meta")`.

For first implementation, **Option A** keeps changes minimal.

---

### 2. GET /api/sessions/{session_id}/children

New endpoint. Returns child sessions of a given parent session.

#### Route

```python
@router.get("/api/sessions/{session_id}/children", response_model=List[SessionItem])
def list_session_children(
    session_id: str,
    request: Request,
    include_meta: bool = True,
) -> List[SessionItem]:
    ...
```

#### Response

```json
[
  {
    "id": "sess_child",
    "name": "Подпроцесс A",
    "parent_session_id": "sess_root",
    "has_children": false,
    ...
  }
]
```

#### Implementation notes

- Load parent session with `_legacy_load_session_scoped` or `session_repo.load` to validate access and obtain `project_id`/`org_id`.
- Call new storage method `list_session_children(org_id, project_id, parent_session_id, user_id, is_admin)`.
- Apply same `_session_read_scope_filters` as `list_project_sessions_for_explorer`.
- Return empty list if parent not found or not accessible (404 or 403 depending on existing conventions).

#### New storage method

```python
def list_session_children(
    self,
    org_id: str,
    project_id: str,
    parent_session_id: str,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    ...
```

SQL shape:

```sql
SELECT id, title, project_id, owner_user_id, org_id, status, stage,
       dod_percent, attention_count, reports_count, updated_at, created_at,
       parent_session_id, element_id_in_parent
FROM sessions
WHERE project_id = ?
  AND org_id = ?
  AND parent_session_id = ?
  AND <read-scope filter>
ORDER BY updated_at DESC
```

---

### 3. Feature flag

**Backend** (`backend/app/routers/feature_flags.py:12-17`):

```python
_DEFAULT_FLAGS = {
    "bpmn_fps_meter_enabled": "0",
    "canvas_profiler_enabled": "0",
    "lightweightOverlays": "0",
    "useBpmnExtensionOverlays": "0",
    "workspace_session_tree_view": "0",
}
```

**Frontend** (`frontend/src/features/config/featureFlagsContext.jsx`):
- Already consumed via `useFeatureFlag("workspace_session_tree_view")`.

---

## DB Index

Add to `backend/app/storage.py` near session indexes (schema creation + migration):

```sql
CREATE INDEX IF NOT EXISTS idx_sessions_project_parent
ON sessions(project_id, parent_session_id)
WHERE parent_session_id IS NOT NULL AND parent_session_id != '';
```

This speeds up:
- `root_only` queries (`project_id = ? AND parent_session_id IS NULL/''`).
- children queries (`project_id = ? AND parent_session_id = ?`).

The existing unique partial index `idx_sessions_parent_element_unique` covers child uniqueness but not these lookup patterns efficiently.

---

## Authz

Children inherit `project_id`, `org_id`, and `owner_user_id` from parent creation context (`storage.find_or_create_child_session`). Therefore the same `_session_read_scope_filters` used for project session lists is sufficient.

---

## Frontend API wrappers

`frontend/src/features/explorer/explorerApi.js`:

```js
export async function apiGetProjectPage(workspaceId, projectId, { rootOnly = false, includeChildrenMeta = false } = {}) {
  return call(
    `/api/projects/${encodeURIComponent(projectId)}/explorer${q({
      workspace_id: workspaceId,
      root_only: rootOnly ? "1" : "0",
      include_children_meta: includeChildrenMeta ? "1" : "0",
    })}`
  );
}

export async function apiGetSessionChildren(sessionId) {
  return call(`/api/sessions/${encodeURIComponent(sessionId)}/children`);
}
```
