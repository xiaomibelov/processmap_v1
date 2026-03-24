# Diagram Owner Cutover Contract (Default-Off)

Status: `draft`, `default-off`, `no rollout`.

## Owner States
- `legacy_owner` — authoritative owner is legacy `sessions.bpmn_xml`.
- `jazz_owner` — authoritative owner is Diagram->Jazz durable doc.
- `cutover_blocked` — requested switch is rejected by preconditions (fail-closed).
- `rollback_to_legacy` — explicit rollback state; effective owner is legacy.

## Cutover Preconditions (Jazz owner)
All must be true:
- `DIAGRAM_OWNER_STATE=jazz_owner`
- `DIAGRAM_JAZZ_OWNER_SWITCH_APPROVED=1`
- `DIAGRAM_JAZZ_CUTOVER_ENABLE=1`
- `DIAGRAM_JAZZ_BACKEND_CONTRACT_DRAFT=1`
- `DIAGRAM_JAZZ_BACKEND_MODE=jazz`
- `DIAGRAM_JAZZ_BACKEND_PROVIDER` is non-empty and not `disabled`
- `DIAGRAM_JAZZ_API_READY=1`
- `DIAGRAM_JAZZ_ROLLBACK_READY=1`
- `DIAGRAM_JAZZ_OBSERVABILITY_READY=1`
- `DIAGRAM_JAZZ_CONTRACT_VERSION == DIAGRAM_JAZZ_REQUIRED_CONTRACT_VERSION`
- `DIAGRAM_JAZZ_SCOPE_ALLOWLIST` contains current canary scope tuple:
  - `org_id::project_id::session_id`
  - optional operator lock: `org_id::project_id::session_id@user_id`

If any precondition fails:
- state becomes `cutover_blocked`
- blocked reason is explicit (`diagram_cutover_blocked_*`)
- Jazz path is locked.

## Scoped gate blocked reasons
- `diagram_cutover_blocked_scope_allowlist_missing`
- `diagram_cutover_blocked_scope_allowlist_malformed`
- `diagram_cutover_blocked_scope_context_missing`
- `diagram_cutover_blocked_scope_not_allowed`
- `diagram_cutover_blocked_operator_context_missing`
- `diagram_cutover_blocked_operator_not_allowed`

## No Mixed Ownership
- If owner is legacy: Jazz read/write path is blocked.
- If owner is Jazz: legacy path must not be considered authoritative for diagram mode.
- `read from one / write to another` is forbidden.
- ambiguous owner state is fail-closed.

## Rollback Rule
- Rollback is explicit:
  - `DIAGRAM_OWNER_STATE=rollback_to_legacy`
  - `DIAGRAM_JAZZ_ROLLBACK_READY=1`
  - `DIAGRAM_JAZZ_ROLLBACK_TRIGGER=1`
- Effect:
  - owner returns to `legacy_owner`
  - Jazz read/write path is blocked with `diagram_cutover_rollback_active`
  - no silent fallback ambiguity.

## Observability Markers
- `diagram_owner_state`
- `diagram_cutover_attempt`
- `diagram_cutover_blocked`
- `diagram_cutover_success`
- `diagram_cutover_rollback`
- `diagram_cutover_invariant_violation`
