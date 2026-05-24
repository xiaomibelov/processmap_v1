# Diagram Overlay Analytics API contract draft

Run ID: `20260519T090224Z-17699`
Status: `DRAFT`

## Status and source truth

All endpoints in this file are draft targets. Current source inspection did not prove existing `/api/analytics/diagram-overlays*` endpoints.

The API target is server-side preparation of read-only overlay view-model data. It does not remove frontend DOM/SVG/bpmn-js rendering cost by itself.

## Endpoint family

| Endpoint | Status | Purpose |
|---|---|---|
| `GET /api/analytics/diagram-overlays` | `DRAFT` | Element-level overlay view-models. |
| `GET /api/analytics/diagram-overlays/summary` | `DRAFT` | Counts and density metrics for overlays. |
| `GET /api/analytics/diagram-overlays/viewport` | `DRAFT_FEASIBILITY_TARGET` | Later viewport-aware server narrowing if geometry/source semantics are proven. |

## Common query parameters

| Param | Type | Required | Notes |
|---|---:|---:|---|
| `session_id` | string | yes | Primary source boundary. |
| `project_id` | string | no | Auth/source validation aid. |
| `kinds` | string[] | no | Example: `properties`, `actions`, `warnings`, `notes`. |
| `element_ids` | string[] | no | Optional exact narrowing. |
| `density` | enum: `minimal`, `standard`, `detailed` | no | Server-side payload detail level, not DOM policy. |
| `include_details` | boolean | no | Default `false`. |
| `source_version` | string | no | Optional client cache validator. |

## `GET /api/analytics/diagram-overlays`

Response shape:

```json
{
  "status": "ok",
  "session_id": "",
  "source_version": "",
  "diagram_state_version": 0,
  "read_only": true,
  "overlays": [
    {
      "id": "overlay:kind:element_id",
      "element_id": "",
      "kind": "properties",
      "priority": 50,
      "summary": {
        "label": "",
        "count": 0,
        "severity": "info"
      },
      "details": [],
      "source": {
        "source_kind": "bpmn_meta.camunda_extensions_by_element_id",
        "source_path": "",
        "source_version": ""
      },
      "signature": "",
      "read_only": true
    }
  ],
  "render_policy_hint": {
    "max_initial_overlays": 150,
    "prefer_viewport_culling": true,
    "prefer_detail_on_hover": true
  }
}
```

Server responsibilities:

- Prepare stable element-level overlay data.
- Include source/version/signature metadata for frontend dedupe.
- Filter by source kind, module/kind and element ids.
- Avoid returning DOM/HTML as canonical output.

Frontend responsibilities:

- Convert view-model rows to actual rendering.
- Own viewport, pan/zoom, hover/selection and density state.
- Apply viewport culling, zoom thresholds and detail-on-demand.
- Avoid creating hidden DOM for every element.

## Summary endpoint

`GET /api/analytics/diagram-overlays/summary` returns:

```json
{
  "status": "ok",
  "session_id": "",
  "total_overlays": 0,
  "total_elements_with_overlays": 0,
  "by_kind": [],
  "by_severity": [],
  "estimated_density": "low",
  "source_version": ""
}
```

## Viewport endpoint feasibility target

`GET /api/analytics/diagram-overlays/viewport` is not a first-phase guarantee. It is a future feasibility target because backend may not have reliable current canvas geometry, zoom and viewport transforms.

If implemented later, the request must be explicit about client-provided geometry:

```json
{
  "session_id": "",
  "viewport": {"x": 0, "y": 0, "width": 0, "height": 0, "scale": 1},
  "buffer": 120,
  "element_bounds_version": ""
}
```

This still does not replace frontend rendering controls. It only narrows the data payload.

## Mutation boundary

Overlay viewing is read-only. It must not:

- mutate BPMN XML;
- write `bpmn_meta`;
- write Product Actions durable truth;
- trigger auto-save;
- apply RAG/AI suggestions.

Editing overlays, if approved later, must be a separate explicit contour.

## Review requirements for implementation phase

- Tests must prove read-only behavior.
- Tests must prove signatures/source versions are stable.
- Frontend proof must measure overlay DOM count and pan/zoom behavior separately from backend response cost.

