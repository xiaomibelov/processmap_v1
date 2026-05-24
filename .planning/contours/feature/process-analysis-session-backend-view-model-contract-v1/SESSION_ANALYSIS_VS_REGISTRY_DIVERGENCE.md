# Session Analysis vs Registry Divergence

- contour: `feature/process-analysis-session-backend-view-model-contract-v1`
- run_id: `20260520T224346Z-55320`
- generated_at: `2026-05-20T22:49Z`

## 1. Interview-embedded `analysis.product_actions` vs registry `rows` shape

### Backend registry row shape (`product_actions_registry.py`, lines 192–231)
```
id               = "{session_id}::{action_id}"
registry_id      = "{session_id}::{action_id}"
org_id, workspace_id, workspace_title
project_id, project_title
session_id, session_title
action_id, raw_action_id
product_group, product_name, action_type, action_stage
action_object_category, action_object, action_method
role, step_id, step_label, node_id, bpmn_element_id
work_duration_sec, wait_duration_sec
source, confidence, updated_at, diagram_state_version
completeness, missing_fields
```

### Interview-embedded action shape (`product_actions_ai.py`, lines 199–221)
```
id, step_id, bpmn_element_id, step_label
product_name, product_group, action_type, action_stage
action_object, action_object_category, action_method
role, source
```

### Divergence
| Aspect | Interview-embedded | Registry row |
|---|---|---|
| `id` | May be missing or duplicated | Always present; prefixed with `session_id::` |
| `registry_id` | Not present | Present |
| `workspace_title`, `project_title` | Not present | Present (enriched from DB join) |
| `completeness` | Not present | Computed by backend `_completeness` |
| `missing_fields` | Not present | Computed by backend `_completeness` |
| `node_id` | Not present | Present (alias of `bpmn_element_id`) |
| `work_duration_sec`, `wait_duration_sec` | Not present | Present if stored |
| `confidence` | Not present | Present if stored |
| `updated_at` | Not present | Present (from session row) |
| `diagram_state_version` | Not present | Present (from session row) |

**Verdict**: The registry row is a **superset** of the interview-embedded action. The backend enriches the raw action with session/project metadata and computed fields.

## 2. Interview-embedded analysis keys vs registry `filter_options`, `metrics`, `empty_state`

### What exists in interview-embedded analysis
- `analysis.product_actions` — list of raw actions.
- `analysis.product_actions_batch_draft` — AI draft state.
- Any custom keys (no schema enforcement).

### What exists in registry response (process properties registry as reference)
- `filter_options` — distinct values per filter dimension.
- `applied_filters` — what filters were sent.
- `metrics` — `total_rows`, `filtered_rows`, `page_rows`, `projects_total`, `sessions_total`, etc.
- `empty_state` — `kind`, `scope`, `message_key`.
- `source_state` — `source`, `namespace`, `heavy_payload_excluded`, `mutation_allowed`, etc.

### What exists in product-actions registry response
- Missing: `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state`.
- Present: `rows`, `summary`, `sessions`, `session_summary`, `page`.

**Verdict**: The product-actions registry response is **incomplete compared to the properties registry**. There is no unified envelope parity. Session-scoped analysis currently has no envelope at all; it is just a raw array inside `interview.analysis`.

## 3. Frontend normalization vs backend normalization

### Backend normalization (`product_actions_registry.py`)
- `_registry_row` (lines 192–231): one-to-one mapping from raw action to registry row.
- `_completeness` (lines 187–189): checks 4 required fields, returns `("incomplete", [missing_keys])`.
- `_matches_filters` (lines 234–244): exact-match filtering on `completeness` and categorical fields.
- `_sort_key` (lines 247–255): multi-column sort by product_group, product_name, session_title, step_label, action_stage, action_type.

### Frontend normalization (`productActionsRegistryModel.js`)
- `buildProductActionRegistryRows` (lines 51–83): maps over `normalizeProductActionsList`, then adds registry metadata.
- `productActionRegistryCompleteness` (lines 42–48): checks the same 4 required fields.
- `filterProductActionRegistryRows` (lines 115–133): exact-match filtering on the same dimensions.
- `uniqueProductActionRegistryFilterOptions` (lines 99–113): builds distinct values per dimension.

### Divergence
| Aspect | Backend | Frontend | Risk |
|---|---|---|---|
| Completeness fields | `product_name`, `product_group`, `action_type`, `action_object` | Same 4 fields | **Aligned** |
| Filter dimensions | `_FILTER_MAP` keys: `product_groups`, `products`, `action_types`, `stages`, `object_categories`, `roles` | `product_group`, `product_name`, `action_type`, `action_stage`, `action_object_category`, `role` | **Aligned** |
| Sort order | product_group → product_name → session_title → step_label → action_stage → action_type | Not sorted in model | Frontend session-scope rows are unsorted |
| Row ID format | `session_id::action_id` | `sessionId::action.id` | **Aligned** |
| Missing field handling | `_text()` strips and defaults to `""` | `toText()` strips and defaults to `""` | **Aligned** |
| `node_id` vs `bpmn_element_id` | Both present; `node_id` = raw `node_id` | `bpmn_element_id` = `action.bpmn_element_id \|\| action.node_id` | Frontend falls back to `node_id`; backend keeps both separately |

**Verdict**: The normalization logic is **largely duplicated but aligned in intent**. The frontend re-implements completeness, filtering, and filter-options generation that the backend already does for cross-scope queries. This is the **thin-client gap**: session-scope analysis is assembled client-side instead of being served by a backend view model.

## 4. Field name differences

| Meaning | Backend canonical | Frontend canonical | Interview raw |
|---|---|---|---|
| Action identifier | `action_id` / `raw_action_id` | `raw_action_id` | `id` / `action_id` |
| BPMN element reference | `bpmn_element_id` | `bpmn_element_id` | `bpmn_element_id` / `node_id` / `bpmnElementId` |
| Object category | `action_object_category` | `action_object_category` | `action_object_category` / `actionObjectCategory` |
| Object | `action_object` | `action_object` | `action_object` / `actionObject` |
| Stage | `action_stage` | `action_stage` | `action_stage` / `actionStage` |
| Step identifier | `step_id` | `step_id` | `step_id` / `stepId` |
| Step label | `step_label` | `step_label` | `step_label` / `stepLabel` |

**Verdict**: Backend and frontend agree on snake_case. The AI router (`product_actions_ai.py`) accepts both snake_case and camelCase aliases when reading, but writes snake_case. No field name conflicts between backend registry and frontend model, except that the frontend model does not expose `raw_action_id` consistently in all contexts.

## 5. Completeness rules

### Backend (`product_actions_registry.py`, lines 187–189)
```python
_REQUIRED_BUSINESS_FIELDS = ("product_name", "product_group", "action_type", "action_object")
def _completeness(row):
    missing = [key for key in _REQUIRED_BUSINESS_FIELDS if not _text(row.get(key))]
    return ("incomplete" if missing else "complete", missing)
```

### Frontend (`productActionsRegistryModel.js`, lines 42–48)
```javascript
const REQUIRED_BUSINESS_FIELDS = ["product_name", "product_group", "action_type", "action_object"];
export function productActionRegistryCompleteness(rowRaw) {
  const missing = REQUIRED_BUSINESS_FIELDS.filter((key) => !toText(row[key]));
  return { status: missing.length ? "incomplete" : "complete", missing };
}
```

**Verdict**: **Identical**. Both use the same 4 fields. The duplication is unnecessary once a backend view model owns completeness computation.

## 6. Summary of divergence

| # | Divergence | Severity | Evidence |
|---|---|---|---|
| 1 | Registry row is a superset of interview-embedded action | Medium | `product_actions_registry.py:192–231` |
| 2 | Product-actions registry lacks unified envelope fields (`filter_options`, `metrics`, `empty_state`, `source_state`) | High | `product_actions_registry.py:449–462` vs `process_properties_registry.py:664–682` |
| 3 | Frontend re-implements normalization, completeness, filtering, filter-options | High | `productActionsRegistryModel.js:42–133` |
| 4 | Session-scope analysis has no backend envelope; frontend assembles rows locally | High | `ProductActionsRegistryPanel.jsx:217–221` |
| 5 | `product_actions_batch_draft` is stored durably in `interview_json` | Medium | `product_actions_ai.py:530–536` |
| 6 | No field name conflicts; both sides use snake_case | Low | Cross-file grep |
| 7 | Completeness rules are identical but duplicated | Low | `product_actions_registry.py:187–189`, `productActionsRegistryModel.js:42–48` |
