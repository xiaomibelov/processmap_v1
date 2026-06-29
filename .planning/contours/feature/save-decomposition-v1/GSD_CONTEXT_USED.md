# GSD Context — feature/save-decomposition-v1

**Checked:** 2026-06-26

```bash
command -v gsd
# /opt/processmap-test/bin/gsd

/opt/processmap-test/bin/gsd
# ERROR: Codex-local GSD tool missing: /home/deploy/.codex/get-shit-done/bin/gsd-tools.cjs
```

## Result

Local GSD runner is present but its helper tooling is missing in this environment. The contour will proceed using the planning artifacts and acceptance criteria provided by the user and the prior audit (`audit/save-decomposition`). No GSD-managed phase state is available.

## Fallback discipline

- Track progress via `.planning/contours/feature/save-decomposition-v1/STATE.json`.
- Use explicit user approval before merge/deploy per AGENTS.md §7.
