# API contract draft requirements

Run ID: `20260519T090224Z-17699`

## Required wording

- All listed `/api/analytics/*` endpoints are `draft contracts`.
- Existing endpoints may be cited separately only with source file evidence.
- Contracts must be read-only by default.
- Mutations, AI acceptance and BPMN XML writes are out of scope.

## Product Actions draft endpoints

- `GET /api/analytics/actions`
- `GET /api/analytics/actions/summary`
- `GET /api/analytics/actions/filters`
- `GET /api/analytics/actions/sources`
- `GET /api/analytics/actions/export.csv`
- `GET /api/analytics/actions/export.xlsx`

Minimum query dimensions:
- `scope=workspace|project|session`
- `workspace_id`, `project_id`, `session_id`
- filter fields aligned with current registry model
- `limit`, `offset`, `sort`

## Properties draft endpoints

- `GET /api/analytics/properties`
- `GET /api/analytics/properties/summary`
- `GET /api/analytics/properties/filters`
- `GET /api/analytics/properties/sources`

Minimum source requirements:
- confirmed sources only;
- `bpmn_meta.camunda_extensions_by_element_id` first;
- future sources marked as requirements/hypotheses until proven.

## Diagram overlays draft endpoints

- `GET /api/analytics/diagram-overlays`
- `GET /api/analytics/diagram-overlays/summary`
- `GET /api/analytics/diagram-overlays/viewport`

Minimum payload rules:
- return data view-models, not HTML;
- include source/version/signature;
- include `read_only: true`;
- viewport endpoint must be marked later feasibility target unless backend has enough geometry/index truth.
