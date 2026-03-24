# Diagram->Jazz Stage 7 Rollback Drill Matrix (Default-Off)

Status: `bounded`, `default-off`, `no user-facing rollout`.

## Scenario Matrix
| ID | Scenario | Preconditions | Action | Expected owner transition | Expected FE markers | Expected API markers | Expected adapter/backend markers | Final safe state |
|---|---|---|---|---|---|---|---|---|
| S01 | rollback from requested `jazz_owner` before activation completes | `DIAGRAM_OWNER_STATE=jazz_owner`, one cutover precondition false (`owner_switch_approved=0`) | switch to `rollback_to_legacy` with `rollback_ready=1`, `rollback_trigger=1` | `cutover_blocked -> rollback_to_legacy`, owner `legacy_owner` | `diagram_jazz_fe_blocked`, `diagram_cutover_blocked`, `diagram_cutover_rollback` | `diagram_owner_state`, `diagram_jazz_api_blocked` | `diagram_jazz_adapter_read_attempt`, `diagram_jazz_adapter_blocked`, `diagram_jazz_backend_attempt_blocked_without_contract` | Jazz path locked with `diagram_cutover_rollback_active`, legacy owner preserved |
| S02 | rollback when owner state already `cutover_blocked` | `DIAGRAM_OWNER_STATE=jazz_owner`, `api_ready=0` | request rollback with trigger ready | `cutover_blocked -> rollback_to_legacy`, owner `legacy_owner` | `diagram_jazz_fe_write_attempt`, `diagram_jazz_fe_blocked`, `diagram_cutover_rollback` | `diagram_owner_state`, `diagram_jazz_api_write_attempt`, `diagram_jazz_api_blocked` | `diagram_jazz_adapter_write_attempt`, `diagram_jazz_adapter_blocked` | write path Jazz blocked, no mixed ownership |
| S03 | explicit rollback trigger | `DIAGRAM_OWNER_STATE=rollback_to_legacy`, `rollback_ready=1`, `rollback_trigger=1` | read/write in Jazz path | effective state `rollback_to_legacy`, owner `legacy_owner` | `diagram_jazz_fe_blocked`, `diagram_cutover_rollback` | `diagram_owner_state`, `diagram_jazz_api_blocked` | `diagram_jazz_adapter_*_attempt`, `diagram_jazz_adapter_blocked` | Jazz path blocked by `diagram_cutover_rollback_active` |
| S04 | rollback after simulated API/write conflict | Jazz-ready env + existing mapped doc; conflict via stale expected revision/fingerprint | trigger rollback after conflict | `jazz_owner -> rollback_to_legacy`, owner `legacy_owner` | `diagram_jazz_fe_conflict` then `diagram_jazz_fe_blocked`, `diagram_cutover_rollback` | `diagram_jazz_api_conflict` then `diagram_jazz_api_blocked` | `diagram_jazz_adapter_conflict` then `diagram_jazz_adapter_blocked` | no dual-write, owner returns to legacy |
| S05 | rollback after provider mismatch / invariant lane | Jazz-ready env, request provider mismatch OR invariant block | trigger rollback | blocked error -> rollback state | `diagram_jazz_fe_conflict` or `diagram_jazz_fe_blocked`, then rollback marker | `diagram_jazz_api_blocked` with explicit reason (`provider_mismatch`/invariant) | adapter branch either skipped (mismatch pre-adapter) or blocked with explicit reason | owner `legacy_owner`, Jazz path locked |
| S06 | rollback with missing prerequisite (fail-closed) | `DIAGRAM_OWNER_STATE=rollback_to_legacy`, missing trigger or readiness | attempt Jazz read/write | `cutover_blocked`, owner `legacy_owner` | `diagram_jazz_fe_blocked`, `diagram_cutover_blocked` | `diagram_jazz_api_blocked` | `diagram_jazz_adapter_blocked` | explicit blocked reason, no partial rollback |

## Drill Execution Commands
- Backend drill harness:
  - `PYTHONPATH=/Users/mac/PycharmProjects/processmap_clean_status_fix_v1/backend python3 -m app.services.diagram_owner_rollback_drills --pretty`
- Frontend drill harness:
  - `node /Users/mac/PycharmProjects/processmap_clean_status_fix_v1/frontend/scripts/diagram_owner_rollback_drills.mjs --pretty`

## Evidence Contract
- Every drill must report:
  - owner requested/effective state
  - blocked/conflict reason (if any)
  - marker sequence
  - final path lock check (`owner_path_block_reason(..., "jazz")`)
- `legacy_owner` must remain the final owner for rollback scenarios.
