# Diagnostic Plan — tooling/gsd-availability-root-cause-diagnostic-v1

## Goal
Determine why ProcessMap Agent 1 falls back to `GSD_FALLBACK_MANUAL_PLANNING_ONLY` with `gsd` / `gsd-sdk` unavailable and no visible GSD skills/tools in the Kimi runtime.

## Scope
Read-only inspection of:
- shell and PATH behavior;
- command availability;
- symlink targets;
- Node/npm global package state;
- repo-local GSD tooling;
- Kimi/Claude/Codex skill/tool locations;
- ProcessMap agent scripts;
- historical Atlas/planning evidence.

## Constraints Honored
- No package installation.
- No deletion.
- No changes to shell profiles, Kimi, Claude, Codex, MCP, or product code.
- No MCP repair.
- No RAG indexing.
- No commit/push/PR/deploy.
- No secrets read or printed.

## Outputs
- `COMMAND_OUTPUTS_SANITIZED.md`
- `GSD_ROOT_CAUSE_REPORT.md`
- `REPAIR_OPTIONS.md`
- `STATE.json`
- `DIAGNOSTIC_COMPLETE`
