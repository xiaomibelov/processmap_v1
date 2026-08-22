# Subprocess Transition Architecture — PLANE 4: DATA

## Persistent schema

### `sessions` table (relevant fields)

| Field | Purpose |
|-------|---------|
| `id` | Session primary key |
| `project_id` | Project aggregate root |
| `org_id` | Multi-tenant scope |
| `bpmn_xml` | Canonical BPMN XML (diagram truth) |
| `bpmn_meta` | Derived node/edge metadata, process_id, etc. |
| `parent_session_id` | Immediate ancestor session (subprocess linkage) |
| `element_id_in_parent` | BPMN element id in parent that was drilled into |
| `navigation_stack` | JSON array of frames: `{session_id, parent_session_id, element_id_in_parent, entered_at}` |
| `interview` | Interview model / analysis data |
| `notes_by_element` | Element-scoped notes |
| `diagram_state_version` | CAS version for optimistic concurrency |

### Indexes

Current: index on `(project_id, org_id)` and likely `parent_session_id`. There is no **unique** constraint on `(parent_session_id, element_id_in_parent, project_id)`, which allows duplicate children.

## Event log / audit trail

There is no explicit event log for subprocess transitions today. The closest durable trace is:
- `navigation_stack` on the child session.
- `session_repo` write logs (if enabled).
- `diagram_state_version` increments on saves.

A transition event log would record:
- `transition.initiated` — parent session, element id, user.
- `transition.child_resolved` — existing or new child id.
- `transition.child_created` — when a new child session is persisted.
- `transition.activated` — when child session is loaded by frontend.
- `transition.returned` — when user returns to parent.

## Transactional boundaries

### Current boundary
`navigate_to_subprocess` is a single Python function that spans:
1. Authz (request-scoped).
2. Load parent session.
3. Parse BPMN.
4. Find existing child.
5. Resolve child XML (may load other project sessions).
6. Create child (write) if missing.
7. Save child if XML repaired.
8. Build breadcrumbs (N+1 reads).

There is no database transaction wrapper around the whole flow. The find-or-create is racy. The breadcrumb build is after all writes.

### Desired boundary

```
BEGIN TRANSACTION / LOCK (parent_session_id, element_id_in_parent)
  existing = find_by_parent_element(...)
  if existing:
    child = existing
  else:
    child_xml = resolve_child_bpmn_xml(...)
    child = create_child_session(...)
    child.navigation_stack = build_stack(parent, element_id)
    save(child)
COMMIT

project breadcrumb = bulk_load_sessions(child.navigation_stack[*].session_id)
return {child_id, target_element_id, breadcrumb}
```

The lock key should be deterministic: `subprocess:create:{parent_session_id}:{element_id_in_parent}`. Redis `SET NX EX` or a Postgres advisory lock can enforce uniqueness even across API replicas.

## Consistency issues

### 1. Duplicate child sessions
No uniqueness guarantee → multiple children for the same parent element. This breaks breadcrumb reconstruction and can fragment discussions/notes.

**Fix:** Unique partial index on `(project_id, parent_session_id, element_id_in_parent)` where `parent_session_id IS NOT NULL`, plus a Redis lock during creation.

### 2. `navigation_stack` drift
If a child session is copied, moved, or manually edited, the stack may no longer reflect reality. There is no validation that `stack[-1].session_id == current_session.id` or that frames form a continuous chain.

**Fix:** Stack invariant checked on load; projector tolerates broken frames gracefully.

### 3. Read-then-write repair
Reusing an existing child can trigger a save (`child.bpmn_xml = child_xml`). A navigation request becomes a mutation without an explicit transaction or version bump.

**Fix:** Repair should be a separate maintenance command, or navigation should be read-only after child resolution.

### 4. URL vs. database desync
Frontend can push a child URL before the backend has persisted the child (in the current flow, the backend call returns first, but the frontend activation can still fail). The URL then points to a session that is not active.

**Fix:** Route written only after successful activation.

## Data ownership matrix

| Data | Source of truth | Read model |
|------|-----------------|------------|
| BPMN XML | `sessions.bpmn_xml` | BPMN stage canvas |
| Hierarchy | `sessions.parent_session_id` + `navigation_stack` | Breadcrumb projector |
| Breadcrumb names | `sessions.title` per frame | Breadcrumb UI |
| Focus element | URL `focus` param + transition response | BPMN stage viewport |
| Child existence | Unique DB constraint + lock | Subprocess lifecycle service |

## Persistence recommendations

1. Add unique partial index: `CREATE UNIQUE INDEX idx_unique_subprocess_child ON sessions (project_id, parent_session_id, element_id_in_parent) WHERE parent_session_id IS NOT NULL AND element_id_in_parent IS NOT NULL;`
2. Add deterministic Redis lock around child creation.
3. Materialize a `subprocess_transitions` event table for observability and recovery.
4. Keep `navigation_stack` as the compact source of truth, but validate invariants on read.
5. Separate child XML repair from navigation; run repair offline or as an explicit admin action.
