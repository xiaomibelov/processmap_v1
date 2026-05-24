# Target View Model Contract (draft)

- contour: `feature/process-analysis-session-backend-view-model-contract-v1`
- run_id: `20260520T224346Z-55320`
- generated_at: `2026-05-20T22:49Z`
- status: **draft** — requires implementation contour to prove runtime behavior

## 1. Principles

1. **Backend owns assembly**: all normalization, filtering, aggregation, and summary for session-scoped analysis happen on the backend.
2. **Frontend owns UI state**: active tab, selected step, expanded rows, viewport — stays on frontend.
3. **Session view model is read-only by default**: mutations (save product action, accept AI draft) go through dedicated mutation endpoints.
4. **Unified envelope**: session analysis endpoint returns the same stable structure as registry endpoints, scoped to one session.
5. **Derived state is separate from durable interview**: `batch_draft`, `suggestions`, `metrics` are runtime-derived and must not be written into `interview_json`.

## 2. Proposed Pydantic-like schema: `ProcessAnalysisSessionViewModel`

```python
class ProcessAnalysisSessionProductActionRow(BaseModel):
    id: str                          # session_id::action_id
    registry_id: str                 # same as id
    action_id: str
    raw_action_id: str
    product_group: Optional[str]
    product_name: Optional[str]
    action_type: Optional[str]
    action_stage: Optional[str]
    action_object_category: Optional[str]
    action_object: Optional[str]
    action_method: Optional[str]
    role: Optional[str]
    step_id: Optional[str]
    step_label: Optional[str]
    node_id: Optional[str]
    bpmn_element_id: Optional[str]
    work_duration_sec: Optional[float]
    wait_duration_sec: Optional[float]
    source: str = "manual"
    confidence: Optional[float]
    updated_at: Optional[str]
    diagram_state_version: int = 0
    completeness: Literal["complete", "incomplete"]
    missing_fields: List[str]

class ProcessAnalysisSessionPropertyRow(BaseModel):
    id: str                          # session_id::element_id::kind::name
    registry_id: str
    element_id: str
    element_title: Optional[str]
    element_type: Optional[str]
    property_name: str
    property_value: str
    property_type: str             # e.g. "Camunda property", "Camunda listener"
    property_group: str            # e.g. "extensionProperties", "extensionListeners"
    source: str
    source_kind: str
    status: str
    completeness: Literal["complete", "incomplete"]
    updated_at: int = 0
    diagram_state_version: int = 0

class Summary(BaseModel):
    total: int
    complete: int
    incomplete: int

class Page(BaseModel):
    limit: int
    offset: int
    total: int
    has_more: bool

class FilterOptions(BaseModel):
    # Product actions
    products: List[str]
    product_groups: List[str]
    action_types: List[str]
    stages: List[str]
    object_categories: List[str]
    roles: List[str]
    completeness: List[str] = ["all", "complete", "incomplete"]
    # Process properties
    property_types: List[str]
    groups: List[str]
    sources: List[str]
    processes: List[str]
    element_types: List[str]

class AppliedFilters(BaseModel):
    # Mirrors FilterOptions but reflects what was actually applied
    products: List[str] = []
    product_groups: List[str] = []
    action_types: List[str] = []
    stages: List[str] = []
    object_categories: List[str] = []
    roles: List[str] = []
    completeness: str = "all"
    property_types: List[str] = []
    groups: List[str] = []
    sources: List[str] = []
    processes: List[str] = []
    element_types: List[str] = []

class Metrics(BaseModel):
    total_rows: int
    filtered_rows: int
    page_rows: int
    complete: int
    incomplete: int
    total_complete: int
    total_incomplete: int
    limit: int
    offset: int
    has_more: bool

class EmptyState(BaseModel):
    kind: Literal["not_empty", "no_actions", "no_filtered_rows", "no_sessions"]
    scope: str
    message_key: str

class SourceState(BaseModel):
    source: str = "process_analysis_session_view_model"
    namespace: str = "/api/sessions/{session_id}/analysis/view-model"
    heavy_payload_excluded: bool = True
    mutation_allowed: bool = False
    interview_loaded: bool = True
    bpmn_meta_loaded: bool = True
    bpmn_elements_count: int = 0
    source_contract_version: str = "v1"

class DerivedState(BaseModel):
    product_actions_batch_draft: Optional[Dict[str, Any]]   # runtime only
    ai_suggestions: List[Dict[str, Any]] = []
    step_action_counts: Dict[str, int] = {}                # step_id -> count
    coverage_metrics: Dict[str, Any] = {}

class InterviewState(BaseModel):
    status: Literal["draft", "in_progress", "completed"]
    stage: Optional[str]
    updated_at: int = 0

class ProcessAnalysisSessionViewModel(BaseModel):
    ok: bool = True
    session_id: str
    session_title: str
    project_id: Optional[str]
    project_title: Optional[str]
    workspace_id: Optional[str]
    analysis: Dict[str, Any] = {
        "product_actions": {
            "rows": List[ProcessAnalysisSessionProductActionRow],
            "summary": Summary,
            "filter_options": FilterOptions,
            "applied_filters": AppliedFilters,
            "metrics": Metrics,
            "empty_state": EmptyState,
            "source_state": SourceState,
        },
        "process_properties": {
            "rows": List[ProcessAnalysisSessionPropertyRow],
            "summary": Summary,
            "filter_options": FilterOptions,
            "applied_filters": AppliedFilters,
            "metrics": Metrics,
            "empty_state": EmptyState,
            "source_state": SourceState,
        },
        "derived": DerivedState,
    }
    interview_state: InterviewState
```

## 3. Proposed endpoints

### `GET /api/sessions/{session_id}/analysis/view-model`

**Purpose**: return the full session analysis view model for the current session state.

**Request**: none (path param only).

**Response**: `ProcessAnalysisSessionViewModel`.

**Durability/derivation**:

| Field | Source | Durable | Derived |
|---|---|---|---|
| `session_id`, `session_title` | `sessions` table | ✅ | |
| `project_id`, `project_title` | `projects` table join | ✅ | |
| `workspace_id` | `projects.workspace_id` | ✅ | |
| `analysis.product_actions.rows` | `interview_json → analysis.product_actions` | ✅ | |
| `analysis.product_actions.summary` | computed from rows | | ✅ |
| `analysis.product_actions.filter_options` | computed from rows | | ✅ |
| `analysis.product_actions.applied_filters` | request defaults | | ✅ |
| `analysis.product_actions.metrics` | computed from rows | | ✅ |
| `analysis.product_actions.empty_state` | computed from rows + filters | | ✅ |
| `analysis.product_actions.source_state` | backend metadata | | ✅ |
| `analysis.process_properties.rows` | `bpmn_meta_json`, `bpmn_xml` | ✅ | |
| `analysis.process_properties.summary` | computed from rows | | ✅ |
| `analysis.process_properties.*` (rest) | same pattern as product_actions | | ✅ |
| `analysis.derived.product_actions_batch_draft` | separate store / memory | | ✅ |
| `analysis.derived.ai_suggestions` | AI service | | ✅ |
| `analysis.derived.step_action_counts` | computed from rows | | ✅ |
| `analysis.derived.coverage_metrics` | computed from rows + steps | | ✅ |
| `interview_state.status` | `session` metadata | ✅ | |
| `interview_state.stage` | `interview` metadata | ✅ | |
| `interview_state.updated_at` | `session.updated_at` | ✅ | |

### `POST /api/sessions/{session_id}/analysis/view-model/query`

**Purpose**: query the session analysis view model with filters and pagination.

**Request body**:
```json
{
  "product_actions": {
    "filters": {
      "product_groups": [],
      "products": [],
      "action_types": [],
      "stages": [],
      "object_categories": [],
      "roles": [],
      "completeness": "all"
    },
    "limit": 100,
    "offset": 0
  },
  "process_properties": {
    "filters": {
      "property_types": [],
      "groups": [],
      "sources": [],
      "processes": [],
      "element_types": [],
      "completeness": "all"
    },
    "limit": 100,
    "offset": 0
  }
}
```

**Response**: same `ProcessAnalysisSessionViewModel`, but with:
- `applied_filters` populated from request.
- `rows` paginated and filtered.
- `metrics` reflecting filtered state.
- `empty_state` reflecting filtered state.

## 4. Shared vs session-specific fields

### Shared with registry endpoints

| Field | Registry endpoint | Session view model | Notes |
|---|---|---|---|
| `rows` | ✅ | ✅ | Same row schema; session view model rows lack cross-session metadata (`workspace_title`, etc.) or include it optionally |
| `summary` | ✅ | ✅ | Same shape |
| `page` | ✅ | ✅ | Same shape |
| `filter_options` | ✅ (properties only) | ✅ | Product-actions registry currently lacks this; session view model adds it |
| `applied_filters` | ✅ (properties only) | ✅ | Same |
| `metrics` | ✅ (properties only) | ✅ | Same |
| `empty_state` | ✅ (properties only) | ✅ | Same |
| `source_state` | ✅ (properties only) | ✅ | Same |

### Session-specific fields

| Field | Why session-specific |
|---|---|
| `session_id`, `session_title` | Scoped to one session |
| `project_id`, `project_title` | Derived from session's project |
| `workspace_id` | Derived from session's project |
| `analysis.derived.product_actions_batch_draft` | Runtime state per session |
| `analysis.derived.ai_suggestions` | Runtime state per session |
| `analysis.derived.step_action_counts` | Computed from session rows |
| `analysis.derived.coverage_metrics` | Computed from session rows + steps |
| `interview_state` | Session lifecycle metadata |

## 5. Envelope parity gap to close

The product-actions registry endpoint (`POST /api/analysis/product-actions/registry/query`) currently returns:
```json
{ "ok", "scope", "rows", "summary", "sessions", "session_summary", "page" }
```

It is **missing**:
- `filter_options`
- `applied_filters`
- `metrics`
- `empty_state`
- `source_state`

The target session view model **must include all of these** to achieve unified envelope parity with the process-properties registry. A future implementation contour should decide whether to also backfill the product-actions registry endpoint with the missing envelope fields.

## 6. Draft status

- Schema fields marked above are **draft** and derived from source inspection.
- Exact types (e.g., `Optional[str]` vs `str`) require runtime validation during implementation.
- The `DerivedState` shape depends on how `product_actions_batch_draft` is migrated out of `interview_json`; that is a separate contour decision.
