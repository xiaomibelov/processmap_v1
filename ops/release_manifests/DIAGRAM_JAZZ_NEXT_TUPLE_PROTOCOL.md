# Diagram->Jazz Next Candidate Tuple Protocol (mandatory)

Status: canonical operational protocol for any future candidate tuple.

## Current frozen operator-lock boundary (canonical)
- `72220dfc70d4::07894156c5::7cd806800d@5f34a5602c8b45098046d667ebd5cb12`
- `72220dfc70d4::07894156c5::adea22eb92@5f34a5602c8b45098046d667ebd5cb12`
- `72220dfc70d4::07894156c5::9100c0d0f9@5f34a5602c8b45098046d667ebd5cb12`

Post-drill canonical runtime baseline stays rollback/legacy (`rollback override` active). No widening beyond these 3 tuples is allowed in this contour.

## Hard law
No future candidate tuple may enter widening gate or live canary unless tuple preflight passes.

Mandatory gate:
- `ops/scripts/diagram_jazz_tuple_preflight.sh`

Mandatory blocked verdict:
- `BLOCKED_BY_TUPLE_PREFLIGHT`

## Ordered protocol (no shortcuts)
1. Run manifest-gated preflight (compose/mounts/root/no-`/tmp` checks).
2. Run tuple gate script for candidate tuple with exact operator-locked allowlist context.
3. If script returns any blocked reason (`exit != 0`) -> STOP (`BLOCKED_BY_TUPLE_PREFLIGHT`).
4. Only after green tuple gate: scoped widening gate / dry-run eligibility checks.
5. Only after dry-run approval: one-scope live canary.

## Explicitly forbidden
- no hidden one-off mapping/payload fixes during live canary window;
- no allowlist-only eligibility without mapping/payload proof;
- no wildcard tuples.
