# FUTURE_BACKEND_API_REQUIREMENTS

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`

## Verdict

Current contour should not add backend/schema work. Future backend/API work is required for reliable workspace/project real-data registry mode.

## Required future API

Suggested endpoint family:

```text
POST /api/analysis/properties/registry/query
POST /api/analysis/properties/registry/export.csv
POST /api/analysis/properties/registry/export.xlsx
```

Query input should support:

- `scope`: `workspace | project | session`;
- `workspace_id`;
- `project_id`;
- `session_id`;
- pagination;
- search;
- filters for object type, property type/group, source, completeness.

Response should include:

- `rows[]`;
- `sessions[]` or source summaries;
- `summary`;
- `page`;
- `source_contract_version`.

## Row contract

Minimum row fields:

- `row_id`;
- `scope`;
- `workspace_id`;
- `project_id`;
- `project_title`;
- `session_id`;
- `session_title`;
- `element_id`;
- `element_title`;
- `element_type`;
- `property_name`;
- `property_value`;
- `property_type`;
- `property_group`;
- `source`;
- `source_path`;
- `status`;
- `updated_at` if durable source has it.

## Source extraction rules

Backend aggregation must:

- read existing durable session data only;
- not write BPMN XML;
- not patch `bpmn_meta`;
- not mutate Product Actions;
- not infer rows from RAG;
- make source inclusion explicit and versioned.

## Export requirements

Exports must:

- use the same filtered row set as query;
- include source fields;
- include a generated-at timestamp;
- avoid exporting planned/foundation-only groups as rows.

## Migration requirements

No migration is needed for current foundation mode.

Future real workspace/project mode may need:

- no new durable table if rows can be computed from existing session JSON safely;
- optional materialized cache only after source contracts stabilize;
- explicit invalidation strategy tied to session `bpmn_meta`, `bpmn_xml`, and process metadata versions.
