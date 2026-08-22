# Analytics-relevant database schema

## Source of truth tables

### `sessions`

Located in `backend/app/storage.py` around line 936.

| Column | Type | Relevance to analytics |
|---|---|---|
| `id` | TEXT PK | Session identity |
| `title` | TEXT | Session title in registry rows |
| `project_id` | TEXT | FK-ish to `projects.id` (no enforced FK) |
| `org_id` | TEXT | Multi-tenancy filter |
| `owner_user_id` | TEXT | Non-admin row-level scope filter |
| `interview_json` | TEXT | Source of **product actions** (`analysis.product_actions[]`) |
| `nodes_json` | TEXT | Source of **analytics** (`compute_analytics`) |
| `edges_json` | TEXT | Source of handoffs/critical path |
| `questions_json` | TEXT | Source of open/critical questions |
| `analytics_json` | TEXT | Cached `compute_analytics()` output (written only on explicit recompute) |
| `bpmn_xml` | TEXT | Source of element type/title for properties registry |
| `bpmn_meta_json` | TEXT | Source of `camunda_extensions_by_element_id` |
| `diagram_state_version` | INTEGER | Version hint in source_state |
| `updated_at` | INTEGER | Sort/order key for aggregation |
| `version` | INTEGER | Optimistic locking |

**Indexes**

- `idx_sessions_owner_updated` — `(owner_user_id, updated_at DESC)`
- `idx_sessions_project` — `(project_id)`

No index on `org_id` alone; queries always add it.

### `projects`

| Column | Type | Relevance |
|---|---|---|
| `id` | TEXT PK | Project identity |
| `org_id` | TEXT | Tenant filter |
| `workspace_id` | TEXT | Workspace roll-up |
| `folder_id` | TEXT | Folder path |
| `title` | TEXT | Project title in analytics rows |
| `owner_user_id` | TEXT | Authz |

### `workspaces`

| Column | Type | Relevance |
|---|---|---|
| `id` | TEXT PK | Workspace identity |
| `org_id` | TEXT | Tenant filter |
| `name` | TEXT | Workspace title |

### `workspace_folders`

| Column | Type | Relevance |
|---|---|---|
| `id` | TEXT PK | Folder identity |
| `org_id` | TEXT | Tenant filter |
| `workspace_id` | TEXT | Workspace roll-up |
| `name` | TEXT | Folder title in path |
| `archived_at` | INTEGER | Excluded from joins |

---

## Org property dictionary tables

These tables are currently **not joined** by analytics registries.

### `org_property_dictionary_operations`

```sql
CREATE TABLE IF NOT EXISTS org_property_dictionary_operations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  operation_key TEXT NOT NULL,
  operation_label TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT ''
);
```

Represents a business operation (e.g. "cooking", "packing") for which properties are defined.

### `org_property_dictionary_defs`

```sql
CREATE TABLE IF NOT EXISTS org_property_dictionary_defs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  operation_key TEXT NOT NULL,
  property_key TEXT NOT NULL,
  property_label TEXT NOT NULL DEFAULT '',
  input_mode TEXT NOT NULL DEFAULT 'autocomplete',
  allow_custom_value INTEGER NOT NULL DEFAULT 1,
  required INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT ''
);
```

Defines expected properties per operation.

### `org_property_dictionary_values`

```sql
CREATE TABLE IF NOT EXISTS org_property_dictionary_values (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  operation_key TEXT NOT NULL,
  property_key TEXT NOT NULL,
  option_value TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT ''
);
```

Allowed option values for autocomplete/dictionary properties.

---

## Missing materialized analytics tables

There are **no** tables for:

- Pre-computed session analytics snapshots.
- Project-level roll-ups.
- Workspace-level roll-ups.
- Product-action registry rows.
- Process-property registry rows.

Everything is derived on demand from JSON columns (`interview_json`, `bpmn_meta_json`, `nodes_json`, etc.).

### Candidate schema for a read model

The following is a suggested target state, not current code:

```sql
-- Denormalized analytics snapshot per session
CREATE TABLE analytics_session_snapshots (
  session_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT,
  workspace_id TEXT,
  total_duration_min INTEGER,
  critical_path_min INTEGER,
  actions_total INTEGER,
  handoffs_count INTEGER,
  open_questions INTEGER,
  critical_questions INTEGER,
  computed_at INTEGER NOT NULL,
  valid_until INTEGER
);

-- Project roll-up cache
CREATE TABLE analytics_project_rollups (
  project_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  workspace_id TEXT,
  sessions_count INTEGER,
  total_actions INTEGER,
  avg_duration_min REAL,
  total_critical_questions INTEGER,
  updated_at INTEGER NOT NULL
);

-- Workspace roll-up cache
CREATE TABLE analytics_workspace_rollups (
  workspace_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  projects_count INTEGER,
  sessions_count INTEGER,
  total_actions INTEGER,
  avg_duration_min REAL,
  updated_at INTEGER NOT NULL
);

-- Registry row materialization (optional)
CREATE TABLE analytics_product_action_rows (
  id TEXT PRIMARY KEY,  -- session_id::action_id
  org_id TEXT NOT NULL,
  workspace_id TEXT,
  project_id TEXT,
  session_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  product_group TEXT,
  product_name TEXT,
  action_type TEXT,
  action_stage TEXT,
  action_object_category TEXT,
  action_object TEXT,
  role TEXT,
  completeness TEXT,
  updated_at INTEGER NOT NULL
);
```

Indexes would include `(org_id, workspace_id, updated_at)` and `(org_id, project_id, updated_at)` for fast scope queries.

---

## JSON payloads that drive analytics

### `interview_json` → `analysis.product_actions[]`

Example shape consumed by product actions registry:

```json
{
  "analysis": {
    "product_actions": [
      {
        "id": "action_1",
        "product_group": "Готовая продукция",
        "product_name": "Пельмени",
        "action_type": "нарезка",
        "action_stage": "подготовка",
        "action_object_category": "сырьё",
        "action_object": "фарш",
        "action_method": "ручная",
        "role": "Повар",
        "step_id": "node_1",
        "step_label": "Нарезка фарша",
        "bpmn_element_id": "Activity_1",
        "work_duration_sec": 120,
        "wait_duration_sec": 0,
        "source": "manual"
      }
    ]
  }
}
```

### `bpmn_meta_json` → `camunda_extensions_by_element_id`

Example shape consumed by properties registry:

```json
{
  "camunda_extensions_by_element_id": {
    "Activity_1": {
      "properties": {
        "extensionProperties": [
          {"name": "temperature", "value": "4°C"}
        ],
        "extensionListeners": [
          {"event": "start", "type": "java", "value": "com.example.Listener"}
        ]
      }
    }
  }
}
```

### `analytics_json` output (compute_analytics)

```json
{
  "session_id": "sess_1",
  "version": 1,
  "timing": {
    "total_duration_min": 120,
    "critical_path_min": 95,
    "by_role": {"Повар": 90, "Упаковщик": 30},
    "unknown_duration_nodes": []
  },
  "actions": {
    "total": 8,
    "by_type": {"step": 7, "timer": 1},
    "by_role": {"Повар": 5, "Упаковщик": 3},
    "by_section": {"prep": 3, "pack": 2, "other": 3}
  },
  "handoffs": {
    "count": 4,
    "edges": [{"from": "node_1", "to": "node_2", "from_role": "Повар", "to_role": "Упаковщик"}]
  },
  "coverage": {
    "open_questions": 2,
    "critical_questions": 1
  },
  "summary": ["..."]
}
```

---

## Schema bottlenecks

1. **JSON aggregation is CPU-bound.** Parsing `interview_json` and `bpmn_meta_json` for thousands of sessions happens in Python per request.
2. **`analytics_json` is not refreshed automatically.** It is only updated when `_recompute_session()` runs explicitly.
3. **No composite index for `(org_id, workspace_id, updated_at)` on `sessions`.** Workspace aggregations scan many rows.
4. **`projects.workspace_id` is not indexed.** Project list queries for workspace analytics do a full scan.
5. **Org property dictionary has no link to BPMN elements or sessions.** It is a standalone taxonomy.
