# MCP Health Matrix — Pre-Repair Baseline

| MCP Server | Package / Source | Config Location | Status | Severity | Notes |
|---|---|---|---|---|---|
| **GSD Runner** | `get-shit-done-cc` (expected global) | `~/.codex/get-shit-done/` (local only) | **BROKEN** | HIGH | `gsd-tools.cjs` works via `node` directly (v1.38.5), but `gsd`/`gsd-sdk` symlinks in `/usr/local/bin` and `/root/.local/bin` point to missing `get-shit-done-cc` global npm package. Global CLI is unavailable. |
| **Sequential Thinking** | `@modelcontextprotocol/server-sequential-thinking` | Not in `~/.kimi/mcp.json` | **OK but UNWIRED** | MEDIUM | Runs correctly via `npx -y`. Not registered in Kimi MCP config. |
| **Playwright** | `@playwright/mcp@latest` | `~/.kimi/mcp.json` | **OK** | LOW | Runs correctly via `npx -y`. Registered in Kimi MCP config. |
| **Obsidian / Project Atlas** | `mcp-obsidian` | `~/.kimi/mcp.json` | **PARTIAL** | MEDIUM | Server runs via `npx -y`, but target vault `/srv/obsidian/project-atlas` is **empty**. No notes indexed. |
| **Filesystem** | `@modelcontextprotocol/server-filesystem` | Not in `~/.kimi/mcp.json` | **MISSING** | MEDIUM | Package works via `npx -y` (stdio responds), but not installed or configured in any MCP config. |
| **GitHub** | `@modelcontextprotocol/server-github` | Not in `~/.kimi/mcp.json`; Codex plugin enabled | **DEPRECATED** | LOW | Package deprecated by npm. Codex has `github@openai-curated` plugin enabled in `~/.codex/config.toml`. Recommend using Codex plugin, not the deprecated MCP server. |

## Config Files Found
- `~/.kimi/mcp.json` — defines `playwright` and `obsidian` only.
- `~/.codex/config.toml` — defines `github@openai-curated` plugin, GSD agents, `codex_hooks = false` (global).
- `/opt/processmap-test/.codex/config.toml` — `codex_hooks = true` (project-level).
- `~/.claude.json` — Claude Desktop state, no MCP server config.
- No `claude_desktop_config.json`, `.cursor/mcp.json`, or other IDE MCP configs found.

## NPX Cache Status
- `@playwright/mcp@latest` — cached at `/root/.npm/_npx/9833c18b2d85bc59/`
- `mcp-obsidian` — cached at `/root/.npm/_npx/fef731b619fd78c6/`
- `@modelcontextprotocol/server-sequential-thinking` — not cached (fetched on demand)
- `@modelcontextprotocol/server-filesystem` — not cached (fetched on demand)
- `@modelcontextprotocol/server-github` — not cached (fetched on demand)

## GSD Runner Detail
- Local binary: `~/.codex/get-shit-done/bin/gsd-tools.cjs` (v1.38.5)
- Broken symlinks:
  - `/usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk`
  - `/root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js` (target missing)
- `get-shit-done-cc` is **not installed** in any global `node_modules`.
- No `gsd` command in `PATH`.
