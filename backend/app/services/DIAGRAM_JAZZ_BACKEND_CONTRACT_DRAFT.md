# Diagram -> Jazz Backend Contract Draft (Scaffold Only)

Status: `draft`, `default-off`, `no backend runtime rollout`.

## 1) Current ownership recap
- Current durable diagram truth is `sessions.bpmn_xml`.
- Active endpoints:
  - `GET /api/sessions/{session_id}/bpmn`
  - `PUT /api/sessions/{session_id}/bpmn`
  - `DELETE /api/sessions/{session_id}/bpmn`
- Current write path persists to `sessions.bpmn_xml`, `sessions.bpmn_xml_version`,
  `sessions.bpmn_graph_fingerprint`, `sessions.bpmn_meta_json`.

## 2) Future backend identity contract
- Identity law: `{org_id, project_id, session_id}` is mandatory.
- Scope id: `org_id::project_id::session_id`.
- Doc alias: `diagram:{scope_id}`.
- Mapping key placeholder: `fpc:diagram-jazz-docids`.
- Deterministic doc id helper: `djz_<sha256(provider::scope_id)[:24]>`.

## 2.1) Stage-1 durable storage foundation (default-off)
- `diagram_jazz_documents`
  - durable doc reservation record
  - key fields: `doc_id`, `provider`, `scope_id`, `doc_alias`,
    `org_id`, `project_id`, `session_id`, `contract_version`,
    `storage_mode`, `revision`, `fingerprint`, `metadata_json`
  - unique rules:
    - `(provider, doc_alias)` unique
    - `(provider, scope_id)` unique
- `diagram_jazz_mappings`
  - ownership tuple -> durable doc mapping
  - key fields: `mapping_id`, `org_id`, `project_id`, `session_id`,
    `scope_id`, `doc_alias`, `doc_id`, `provider`, `contract_version`,
    `storage_mode`, `revision`, `fingerprint`, `metadata_json`
  - unique rules:
    - `(org_id, project_id, session_id)` unique
    - `doc_id` unique

## 2.2) Stage-1 lifecycle services (scaffold only)
- `reserve_diagram_jazz_document(...)`
- `create_or_resolve_diagram_jazz_mapping(...)`
- `get_diagram_jazz_mapping(...)`
- `validate_diagram_jazz_mapping(...)`
- All functions are fail-closed by gate and return blocked status when
  `DIAGRAM_JAZZ_BACKEND_CONTRACT_DRAFT` is OFF.

## 3) Future read contract (Jazz mode)
- One authoritative read boundary for Jazz mode:
  `DiagramJazzBackendContractDraftAdapter.read_durable_xml(...)`.
- No silent fallback to legacy `sessions.bpmn_xml` when Jazz mode is selected.
- Missing provider/identity is hard-fail.

## 4) Future write contract (Jazz mode)
- One authoritative write boundary for Jazz mode:
  `DiagramJazzBackendContractDraftAdapter.write_durable_xml(...)`.
- Durable ack must be returned by Jazz storage adapter.
- No silent dual durability (`sessions.bpmn_xml` + Jazz doc) in Jazz mode.

## 4.1) Stage-2 internal adapter (still default-off)
- `DiagramJazzBackendContractDraftAdapter` now has real internal methods:
  - `read_durable_xml(...)`
  - `write_durable_xml(...)`
- Adapter reads/writes durable Jazz doc payload through Stage-1 storage/mapping.
- Adapter enforces fail-closed behavior for:
  - gate off
  - provider/identity invalid
  - missing/invalid mapping
  - revision/fingerprint conflicts
  - malformed payload
- Adapter emits durable ack envelope (doc/scope/revision/fingerprint/timestamps).
- Product runtime is unchanged while gate is OFF and no API wiring exists.

## 4.2) Stage-3 backend API contract shape (still default-off)
- Read route: `GET /api/sessions/{session_id}/diagram-jazz`
  - optional query: `provider`
  - response on success:
    - `ok=true`, `status=200`
    - `session_id`, `provider`, `mode`, `trace_id`
    - `ack` (durable envelope)
    - `xml` (durable BPMN payload)
- Write route: `PUT /api/sessions/{session_id}/diagram-jazz`
  - request body:
    - `xml`
    - `expected_revision` (optional optimistic concurrency)
    - `expected_fingerprint` (optional optimistic concurrency)
    - `provider` (optional override for future multi-provider modes)
  - response on success:
    - `ok=true`, `status=200`
    - `session_id`, `provider`, `mode`, `trace_id`
    - `ack` (durable envelope)

## 4.3) Ack envelope / versioning
- `ack.doc_id`
- `ack.doc_alias`
- `ack.scope_id`
- `ack.provider`
- `ack.contract_version`
- `ack.stored_revision`
- `ack.stored_fingerprint`
- `ack.updated_at`
- `ack.payload_updated_at`
- `ack.mapping_id`
- Concurrency contract on write:
  - `expected_revision` mismatch -> `diagram_jazz_revision_conflict` (409)
  - `expected_fingerprint` mismatch -> `diagram_jazz_fingerprint_conflict` (409)

## 5) Failure semantics
- `diagram_jazz_backend_disabled` when gate is off.
- `diagram_jazz_backend_provider_missing` when mode requests Jazz without provider.
- `diagram_jazz_backend_identity_invalid` for missing identity segments.
- `diagram_jazz_backend_unimplemented` while backend storage adapter is scaffold-only.
- `diagram_jazz_provider_mismatch` for provider mismatch.
- `diagram_jazz_mapping_missing` for missing ownership mapping.
- `diagram_jazz_payload_missing` for mapped doc without payload.
- `diagram_jazz_payload_invalid` for malformed/empty write payload.
- `diagram_jazz_revision_conflict` for optimistic revision conflicts.
- `diagram_jazz_fingerprint_conflict` for optimistic fingerprint conflicts.

## 6) Observability markers
- `diagram_jazz_backend_gate_state`
- `diagram_jazz_backend_adapter_not_active`
- `diagram_jazz_backend_attempt_blocked_without_contract`
- `diagram_jazz_storage_mapping_created`
- `diagram_jazz_storage_mapping_resolved`
- `diagram_jazz_storage_mapping_conflict`
- `diagram_jazz_storage_attempt_blocked`
- `diagram_jazz_adapter_read_attempt`
- `diagram_jazz_adapter_write_attempt`
- `diagram_jazz_adapter_read_success`
- `diagram_jazz_adapter_write_success`
- `diagram_jazz_adapter_conflict`
- `diagram_jazz_adapter_blocked`
- `diagram_jazz_api_read_attempt`
- `diagram_jazz_api_write_attempt`
- `diagram_jazz_api_read_success`
- `diagram_jazz_api_write_success`
- `diagram_jazz_api_conflict`
- `diagram_jazz_api_blocked`

## 7) Canonicality rule
- Legacy mode canonical XML remains `sessions.bpmn_xml`.
- Jazz mode (future) must have a single canonical durable owner.
- Mixed canonical ownership is forbidden.

## 8) Out of scope for this scaffold
- No active backend read/write from Jazz.
- No product endpoint behavior changes.
- No dual-write migration logic.
- No draw.io/hybrid/notes/nodepath/session-companion changes.
