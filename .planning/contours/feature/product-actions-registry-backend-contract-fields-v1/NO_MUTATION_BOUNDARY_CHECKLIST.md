# No-Mutation Boundary Checklist

> **Run ID:** `20260519T133919Z-32264`

## Запрещено

- BPMN XML mutation.
- `diagram_state_version` mutation.
- Durable `interview.analysis.product_actions[]` mutation.
- AI auto-write.
- RAG runtime update.
- Schema migration.
- Fake data.

## PASS criteria

- Query/export only reads sessions/projects/workspace metadata.
- Storage extractor keeps excluding BPMN XML, BPMN meta, notes, reports, resources, analytics and normalized payloads.
- Tests compare before/after session state where practical.
- New `source_state.mutation_allowed=false`.
- No write/save calls introduced in query/export path.

## Files to inspect

- `backend/app/routers/product_actions_registry.py`
- `backend/app/storage.py`
- `backend/tests/test_product_actions_registry_api.py`

