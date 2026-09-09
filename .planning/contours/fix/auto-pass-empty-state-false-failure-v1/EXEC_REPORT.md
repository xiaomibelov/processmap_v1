# Execution Report

- Root cause: `_normalize_auto_pass_v1` inferred `failed` before checking whether
  the input carried any AutoPass state, turning `{}` into a synthetic failure.
- Fix: discard normalized states with no hash, run id, timestamp, variants,
  warnings, failed reasons, or failed counts.
- RED reproduced the reported empty persisted failure.
- GREEN: synthetic-state cleanup and genuine-failure preservation tests passed.

