# Plan: tooling/mcp-servers-inventory-and-repair-v1

## Goal
Repair and stabilize all MCP servers and their configurations used by ProcessMap agents, so that Planner → Executor → Reviewer handoffs have reliable tooling.

## Source Truth
- Repo: `/opt/processmap-test`
- Branch: `fix/lockfile-sync-test`
- HEAD: `a9a9d9c`
- Base truth: `origin/main`
- Status: dirty (`.env` modified, untracked `bin/`, `TEST_RUNTIME.md`)

## Scope
- Allowed files / systems:
  - `~/.kimi/mcp.json` (add missing MCP servers)
  - Global npm installs / symlinks (`/usr/local/bin`, `/root/.local/bin`)
  - `~/.codex/get-shit-done/` (relink or reinstall GSD runner)
  - `/srv/obsidian/project-atlas/` (seed initial vault structure if empty)
  - `~/.codex/config.toml` (review only; do not modify unless explicitly needed for GSD hooks)
  - `/opt/processmap-test/.codex/config.toml` (review only)
- Allowed commands:
  - `npm install -g ...`
  - `ln -sf ...`
  - `npx -y ...`
  - `mkdir`, `touch`, `cp` for vault seeding

## Non-goals
- Product frontend code.
- Product backend code.
- DB/schema changes.
- BPMN XML save behavior.
- AI/RAG/Product Actions logic.
- PR, merge, or deploy.

## Implementation Steps

### 1. Repair GSD Runner (HIGH)
- Diagnose why `get-shit-done-cc` is missing from global node_modules.
- Reinstall `get-shit-done-cc` globally OR create a working `gsd` wrapper script that calls `node ~/.codex/get-shit-done/bin/gsd-tools.cjs`.
- Ensure `gsd` command resolves in `PATH`.
- Verify: `gsd --help` or `gsd-sdk --help` returns usage.

### 2. Wire Sequential Thinking into Kimi MCP (MEDIUM)
- Add `@modelcontextprotocol/server-sequential-thinking` entry to `~/.kimi/mcp.json`.
- Verify: `echo '{}' | npx -y @modelcontextprotocol/server-sequential-thinking` still runs.

### 3. Verify Playwright MCP (LOW)
- Confirm `~/.kimi/mcp.json` entry is correct.
- Verify: `npx -y @playwright/mcp@latest --help` runs.

### 4. Seed Obsidian / Project Atlas Vault (MEDIUM)
- `/srv/obsidian/project-atlas` exists but is empty.
- Create a minimal vault structure (e.g., `README.md`, `.obsidian/` folder if needed by `mcp-obsidian`).
- Verify: `npx -y mcp-obsidian /srv/obsidian/project-atlas` starts without errors and sees notes.

### 5. Wire Filesystem MCP into Kimi MCP (MEDIUM)
- Add `@modelcontextprotocol/server-filesystem` entry to `~/.kimi/mcp.json` pointing to safe paths (e.g., `/opt/processmap-test`, `/tmp`).
- Verify: `echo '{}' | npx -y @modelcontextprotocol/server-filesystem /opt/processmap-test` runs.

### 6. GitHub MCP — Document Deprecation (LOW)
- Do NOT install deprecated `@modelcontextprotocol/server-github`.
- Confirm Codex `github@openai-curated` plugin remains enabled in `~/.codex/config.toml`.
- Note in `EXEC_REPORT.md` that GitHub MCP is deprecated and Codex plugin is the recommended path.

### 7. Verify Kimi MCP JSON Syntax
- Validate `~/.kimi/mcp.json` is valid JSON after edits.
- Ensure no duplicate server names.

## Validation
- `git diff --check` (no repo changes expected, but run anyway).
- `command -v gsd` returns path.
- `node -e "console.log(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.kimi/mcp.json')).mcpServers)"` lists all expected servers.
- `npx -y` smoke tests for each MCP server pass.
- Obsidian vault is non-empty and server starts.

## Runtime Proof
- Screenshot or text output of `command -v gsd && gsd --help`.
- Text output of parsed `~/.kimi/mcp.json` showing all servers.
- Text output of `npx -y` smoke tests for each wired MCP server.
- `ls -la /srv/obsidian/project-atlas` showing seeded content.

## Review Inputs
- `PLAN.md`
- `EXEC_REPORT.md`
- `MCP_HEALTH_MATRIX.md`
- Runtime proof listed above
