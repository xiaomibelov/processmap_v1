# Diagram->Jazz Candidate Tuple Preflight Law (v1)

Status: mandatory before any live canary for any new candidate tuple.

Current canonical boundary is three operator-locked tuples; this law remains mandatory for any tuple outside that frozen boundary before any widening/live step.

## Law
A candidate tuple is **BLOCKED** unless all are true:
1. `allowlist_match=true` (exact operator-locked tuple match)
2. `mapping_exists=true`
3. `payload_exists=true`
4. `mapping_provider_valid=true`
5. `mapping_scope_valid=true`
6. `document_provider_valid=true`
7. `document_scope_valid=true`

## Probe
Use versioned probe only:
- `ops/scripts/diagram_jazz_tuple_preflight.sh`

Probe contract is fail-closed and must emit explicit blocked reasons:
- `allowlist_mismatch`
- `diagram_jazz_mapping_missing`
- `diagram_jazz_payload_missing`
- `diagram_jazz_mapping_provider_mismatch`
- `diagram_jazz_mapping_scope_mismatch`
- `diagram_jazz_document_missing`
- `diagram_jazz_document_provider_mismatch`
- `diagram_jazz_document_scope_mismatch`

## Operational Rules
- No live canary for any new candidate tuple before this probe passes.
- If mapping/payload are missing, verdict is `BLOCKED` until pre-provisioning is completed and re-validated.
- No hidden one-off fixes during a live canary window.
- Manifest-gated preflight must include this law in the mandatory check set.
- Mandatory blocked verdict for this law: `BLOCKED_BY_TUPLE_PREFLIGHT`.
- Canonical ordered flow: `ops/release_manifests/DIAGRAM_JAZZ_NEXT_TUPLE_PROTOCOL.md`.
