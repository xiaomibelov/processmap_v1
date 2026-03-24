# Diagram->Jazz Rollback Operational Playbook (Stage 7, Default-Off)

Status: `operational-draft`, `default-off`, `no rollout`.

## 1) When rollback is allowed
- `DIAGRAM_OWNER_STATE=rollback_to_legacy`
- `DIAGRAM_JAZZ_ROLLBACK_READY=1`
- `DIAGRAM_JAZZ_ROLLBACK_TRIGGER=1`
- owner contract module resolves:
  - `effective_state=rollback_to_legacy`
  - `diagram_owner=legacy_owner`

## 2) When rollback is mandatory
- Any cutover attempt with `cutover_blocked` and unresolved blocker.
- Any `diagram_jazz_*_conflict` during write path that cannot be resolved immediately.
- Any owner invariant error (`diagram_cutover_invariant_violation*`).
- Any provider mismatch or missing mapping/payload under cutover attempt.

## 3) Fail-closed rules
- No dual-read and no dual-write.
- No silent fallback from Jazz path to legacy in the same operation.
- Any ambiguous owner state is `cutover_blocked`.
- If rollback prerequisites are missing, rollback attempt is blocked explicitly:
  - `diagram_cutover_rollback_not_ready`
  - `diagram_cutover_rollback_trigger_missing`

## 4) Operator rollback sequence
1. Capture current owner state markers:
   - `diagram_owner_state`
   - `diagram_cutover_attempt` (if present)
   - current `blocked_reason` / `conflict_reason`
2. Set rollback intent:
   - `DIAGRAM_OWNER_STATE=rollback_to_legacy`
   - `DIAGRAM_JAZZ_ROLLBACK_READY=1`
   - `DIAGRAM_JAZZ_ROLLBACK_TRIGGER=1`
3. Verify fail-closed behavior on Jazz path:
   - expected block: `diagram_cutover_rollback_active`
   - expected markers: `diagram_cutover_rollback`, `diagram_jazz_api_blocked`, `diagram_jazz_adapter_blocked`
4. Verify legacy owner remains authoritative:
   - `/api/sessions/{sid}/bpmn` remains readable/writable in legacy path.
5. Record rollback evidence bundle:
   - correlation id
   - API response payload (`blocked`, `owner_effective_state`, `diagram_owner_state`)
   - marker chain across FE/API/adapter

## 5) Blocked reasons map
- `diagram_cutover_blocked_owner_switch_not_approved`
- `diagram_cutover_blocked_switch_not_enabled`
- `diagram_cutover_blocked_backend_gate_not_ready`
- `diagram_cutover_blocked_backend_mode_not_jazz`
- `diagram_cutover_blocked_provider_missing`
- `diagram_cutover_blocked_api_not_ready`
- `diagram_cutover_blocked_rollback_not_ready`
- `diagram_cutover_blocked_observability_not_ready`
- `diagram_cutover_blocked_contract_mismatch`
- `diagram_cutover_rollback_not_ready`
- `diagram_cutover_rollback_trigger_missing`
- `diagram_cutover_rollback_active`

## 6) Verification checklist after rollback
- owner state:
  - `diagram_owner_state` shows `diagram_owner_state=legacy_owner`
  - `owner_effective_state=rollback_to_legacy` or `legacy_owner`
- Jazz path:
  - returns blocked reason `diagram_cutover_rollback_active` (or explicit cutover block)
- Legacy path:
  - `/api/sessions/{sid}/bpmn` still returns `200`
- Traceability:
  - shared `correlation_id` present from FE headers through API/adapter markers

## 7) Do-not rules
- Do not enable user-facing Jazz mode during rollback drill.
- Do not run mixed owner mode.
- Do not add manual side-channel fallback.
- Do not mutate unrelated contours (draw.io, hybrid, notes, overlays, sidebar/property).

## 8) Drill harnesses
- Backend:
  - `PYTHONPATH=/Users/mac/PycharmProjects/processmap_clean_status_fix_v1/backend python3 -m app.services.diagram_owner_rollback_drills --pretty`
- Frontend:
  - `node /Users/mac/PycharmProjects/processmap_clean_status_fix_v1/frontend/scripts/diagram_owner_rollback_drills.mjs --pretty`
