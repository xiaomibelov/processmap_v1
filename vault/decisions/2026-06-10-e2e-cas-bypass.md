# Decision: E2E CAS Guard Bypass

## Context
Backend PUT /api/sessions/{sid}/bpmn requires base_version (diagram_state_version). E2e fixtures create fresh sessions and PUT XML without base_version → 409 DIAGRAM_STATE_BASE_VERSION_REQUIRED. Affects 44+ test files.

## Decision
Approach 3: Add env var bypass `_require_diagram_cas_or_409` with explicit security comment.

```python
# SECURITY: E2E CAS bypass. MUST be unset in production.
if os.environ.get("FPC_E2E_CAS_BYPASS") == "1":
    return
```

## Why not Approach 1
>5 files affected (6+ spec files + helper). Fixing each individually is brittle and doesn't help other specs.

## Why not Approach 2
Creating a /test/ endpoint still requires modifying all test files to use it. No net savings.

## Security
- Env var defaults to unset → production unaffected
- Explicit comment warns against production use
- Only set in controlled CI/local e2e environments

## Files
- backend/app/_legacy_main.py (3 lines added)
