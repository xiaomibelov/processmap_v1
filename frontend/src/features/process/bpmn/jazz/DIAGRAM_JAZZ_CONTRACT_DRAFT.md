# Diagram -> Jazz Contract Draft (Scaffold Only)

Status: `draft`, `default-off`, `no runtime rollout`.

## 1) Ownership
- Legacy authoritative truth remains `backend.sessions.bpmn_xml`.
- Diagram Jazz contour is scaffolded as an alternative future ownership boundary only.
- No active dual-write is allowed.

## 2) Document identity
- Identity law: `{ org_id, project_id, session_id }` must be present.
- Scope id: `org_id::project_id::session_id`.
- Stable alias: `diagram:{scope_id}`.
- Mapping key storage (future adapter ownership): `fpc:diagram-jazz-docids`.
- Identity helper lives in `diagramJazzContractDraft.js`.

## 3) Read contract (Jazz mode)
- Jazz mode can be entered only via explicit env gate.
- Authoritative read path in Jazz mode must be `diagramJazzAdapter.readDurableXml`.
- Silent fallback to legacy BPMN backend path is forbidden once Jazz mode is requested.
- If Jazz adapter/runtime is unavailable, read fails explicitly.

## 4) Write contract (Jazz mode)
- Authoritative write path in Jazz mode must be `diagramJazzAdapter.writeDurableXml`.
- Successful save requires durable ack from Jazz adapter (`ok=true` + status/rev metadata).
- Silent fallback write to legacy backend is forbidden in Jazz mode.
- Dual-write (`legacy + jazz`) is forbidden for diagram contour.

## 5) Hydrate / reopen / restore
- In Jazz mode, reopen/reload must rehydrate from Jazz read contract only.
- Runtime cache/snapshot/local draft stay ephemeral and cannot become authoritative.
- Local ghost restore paths are forbidden as competing truth.

## 6) Import / export
- Canonical BPMN XML must remain a single representation per active mode.
- Legacy mode canonical XML = backend `/api/sessions/{sid}/bpmn`.
- Jazz mode canonical XML must be produced/owned by Jazz durable doc adapter.
- Mixed canonical sources (legacy XML + Jazz doc simultaneously authoritative) are forbidden.

## 7) Failure semantics
- Missing identity segment => hard failure for Jazz mode.
- Missing Jazz peer/runtime/bootstrap => hard failure for Jazz mode.
- Adapter unavailable => hard failure for Jazz mode.
- No hidden fallback to legacy in Jazz mode.

## 8) Cutover rule
- Cutover may happen only when one active path is selected:
- Legacy OFF + Jazz ON for diagram read/write/hydrate.
- No permanent dual-write transition state.
- Rollback path must also be single-owner (switch back to legacy owner, not dual).

## 9) Current scaffold seams
- Activation + identity + no-op adapter shell:
  - `frontend/src/features/process/bpmn/jazz/diagramJazzContractDraft.js`
- Wiring boundary injection:
  - `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js`
- Persistence contract boundary:
  - `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js`
- Trace/guard markers:
  - `diagram_jazz_gate_state`
  - `diagram_jazz_adapter_not_active`
  - `diagram_jazz_attempt_blocked_without_contract`

## 10) Explicitly out of scope
- draw.io local-first contour
- node-path local-first contour
- session-companion local-first contour
- notes/thread, overlay presentation, hybrid layers, auth/versioning
