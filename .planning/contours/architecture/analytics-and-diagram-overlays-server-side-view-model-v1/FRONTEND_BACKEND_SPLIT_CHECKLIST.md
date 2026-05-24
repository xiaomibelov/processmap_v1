# Frontend/backend split checklist

Run ID: `20260519T090224Z-17699`

## Backend-owned target

- [ ] Row shaping for Product Actions Registry.
- [ ] Row shaping for Properties Registry.
- [ ] Overlay data shaping for diagram read-only visualization.
- [ ] Aggregation and summary metrics.
- [ ] Filter option computation.
- [ ] Filtering, sorting and pagination.
- [ ] Source/session summaries.
- [ ] Export preparation.
- [ ] Scope validation: workspace/project/session/org/user.
- [ ] Stable response signatures/version fields.

## Frontend-owned target

- [ ] Active tab/scope/filter UI state.
- [ ] Selected rows and expanded rows.
- [ ] Viewport state and zoom state.
- [ ] Hover/selection state.
- [ ] Rendering returned view-models.
- [ ] Navigation and return-to-analytics behavior.
- [ ] Explicit edit-mode state, if editing is ever introduced later.

## Boundaries

- [ ] No BPMN XML mutation from analytics view.
- [ ] No Product Actions durable truth mutation from read-only registry/overlay viewing.
- [ ] No RAG auto-write.
- [ ] No fake Properties rows.
- [ ] API contracts must state read-only unless a future editing contour explicitly changes it.
