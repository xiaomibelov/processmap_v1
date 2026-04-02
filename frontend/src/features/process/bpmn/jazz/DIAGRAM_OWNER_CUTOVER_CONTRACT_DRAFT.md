# Diagram Owner Cutover Contract (Frontend Draft)

Status: `draft`, `default-off`, `no user-facing rollout`.

## Owner States
- `legacy_owner`
- `jazz_owner`
- `cutover_blocked`
- `rollback_to_legacy`

## FE Activation Law
- FE may use Jazz adapter path only when owner state resolves to `jazz_owner`.
- If owner state is `legacy_owner`/`cutover_blocked`/`rollback_to_legacy`, Jazz path is blocked.
- No dual-read / dual-write mode is allowed in persistence branch.

## FE Jazz Cutover Preconditions
All required for `jazz_owner`:
- `VITE_DIAGRAM_OWNER_STATE=jazz_owner`
- `VITE_DIAGRAM_JAZZ_OWNER_SWITCH_APPROVED=1`
- `VITE_DIAGRAM_JAZZ_CUTOVER_ENABLE=1`
- `VITE_DIAGRAM_JAZZ_CONTRACT_DRAFT=1`
- `VITE_DIAGRAM_JAZZ_ADAPTER=jazz`
- `VITE_DIAGRAM_JAZZ_PEER` configured
- `VITE_DIAGRAM_JAZZ_BACKEND_API_READY=1`
- `VITE_DIAGRAM_JAZZ_ROLLBACK_READY=1`
- `VITE_DIAGRAM_JAZZ_OBSERVABILITY_READY=1`
- `VITE_DIAGRAM_JAZZ_CONTRACT_VERSION == VITE_DIAGRAM_JAZZ_REQUIRED_CONTRACT_VERSION`
- `VITE_DIAGRAM_JAZZ_SCOPE_ALLOWLIST` contains current canary scope tuple:
  - `org_id::project_id::session_id`
  - optional operator lock: `org_id::project_id::session_id@user_id`

If any precondition fails:
- owner state resolves to `cutover_blocked`
- explicit blocked reason is emitted (`diagram_cutover_blocked_*`)
- adapter fails closed.

## Scoped gate blocked reasons
- `diagram_cutover_blocked_scope_allowlist_missing`
- `diagram_cutover_blocked_scope_allowlist_malformed`
- `diagram_cutover_blocked_scope_context_missing`
- `diagram_cutover_blocked_scope_not_allowed`
- `diagram_cutover_blocked_operator_context_missing`
- `diagram_cutover_blocked_operator_not_allowed`

## Rollback Rule
- `VITE_DIAGRAM_OWNER_STATE=rollback_to_legacy`
- `VITE_DIAGRAM_JAZZ_ROLLBACK_READY=1`
- `VITE_DIAGRAM_JAZZ_ROLLBACK_TRIGGER=1`
- effective owner becomes legacy and Jazz path is blocked.

## FE Markers
- `diagram_owner_state`
- `diagram_cutover_attempt`
- `diagram_cutover_blocked`
- `diagram_cutover_success`
- `diagram_cutover_rollback`
- `diagram_cutover_invariant_violation`
- plus Jazz FE markers (`diagram_jazz_fe_*`)
