# Executor Prompt: tooling/mcp-servers-inventory-and-repair-v1

## Goal
Deliver the bounded contour exactly as described in `PLAN.md`.

## Source Truth Commands
Run before editing:

```bash
git fetch origin
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git log --oneline -15 origin/main
```

If the checkout is dirty, edit only files explicitly allowed by `PLAN.md`. Stop if unrelated dirty files block the contour.

## GSD Local Requirement
Use local GSD scripts, local `gsd-*` skills, workflow files, or safe CLI commands if available. Record what was found and used in `EXEC_REPORT.md`.

## Scope
Read `PLAN.md` and `MCP_HEALTH_MATRIX.md`. Change only the files listed there:
- `~/.kimi/mcp.json`
- Global npm packages / symlinks (`/usr/local/bin`, `/root/.local/bin`)
- `~/.codex/get-shit-done/` (relink/reinstall)
- `/srv/obsidian/project-atlas/` (seed content)

## Non-goals
Do not change product frontend/backend code, DB/schema, BPMN XML save logic, AI/RAG/Product Actions logic, deployment, merge, or PR state unless `PLAN.md` explicitly allows it.

## Implementation Steps
1. Read `PLAN.md` and `MCP_HEALTH_MATRIX.md`.
2. Confirm source truth.
3. Repair GSD runner (reinstall global package or fix symlinks/wrapper).
4. Wire missing MCP servers into `~/.kimi/mcp.json`.
5. Seed Obsidian vault if empty.
6. Run validation listed in `PLAN.md`.
7. Write `EXEC_REPORT.md`.
8. Create marker `READY_FOR_REVIEW`.

## Tests
Run the focused commands from `PLAN.md`:
- `command -v gsd`
- `gsd --help` or `gsd-sdk --help`
- `node -e "console.log(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.kimi/mcp.json')).mcpServers)"`
- `npx -y` smoke tests for each MCP server
- `ls -la /srv/obsidian/project-atlas`

Always run `git diff --check` unless the plan says why it is not applicable.

## Runtime Proof
Collect only the proof requested by `PLAN.md`:
- GSD CLI availability
- Parsed `~/.kimi/mcp.json` server list
- MCP server smoke test outputs
- Obsidian vault listing

## Final Report Format
Write `EXEC_REPORT.md` with:
- Source truth
- Files changed / commands run
- Validation run
- Runtime proof
- Explicit unchanged areas
- Remaining risks
