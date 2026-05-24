# GSD Root Cause Report — tooling/gsd-availability-root-cause-diagnostic-v1

Generated: 2026-05-14T18:57:00Z

## Verdict
MIXED_CAUSE

Primary causes:
- GSD_BROKEN_SYMLINK
- GSD_NODE_PACKAGE_MISSING
- GSD_REPO_LOCAL_TOOL_ONLY
- GSD_SKILLS_MISSING in the Kimi-visible runtime, despite Codex-local skills existing
- GSD_AGENT_SCRIPT_PATH_BUG / binding gap

## Executive Summary
Agent 1 falls back because the executable GSD CLI path is broken and the Kimi agent runtime is not wired to the existing Codex-local GSD installation.

`gsd` is absent. `gsd-sdk` and `get-shit-done-cc` exist only as symlinks, and those symlinks point to a missing global npm package path under `../lib/node_modules/get-shit-done-cc/...`. npm global packages do not contain `get-shit-done-cc`, `gsd`, or `gsd-sdk`. `npx --no-install` cannot resolve them.

At the same time, GSD material is present under `/root/.codex`: `/root/.codex/get-shit-done/bin/gsd-tools.cjs`, `/root/.codex/skills/gsd-*`, and `/root/.codex/agents/gsd-*`. The current Kimi launcher and `tools/pm-agent1-planner.sh` do not expose those Codex-local skills/tools to Agent 1, and the original Agent 1 script only starts `kimi` with a generated prompt. It does not detect or bind `/root/.codex/get-shit-done/bin/gsd-tools.cjs` or `/root/.codex/skills/gsd-*`.

## Source Truth
- repo root: `/opt/processmap-test`
- branch: `fix/lockfile-sync-test`
- HEAD: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- origin/main: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- user: `root`
- host: `clearvestnic.ru`
- runtime/API health: `curl http://clearvestnic.ru:8088/health` returned `ok:true`, Redis healthy
- git status: dirty worktree observed; `.env` is modified but contents were not read or printed

## GSD Availability Findings
| Check | Result | Evidence | Meaning |
|---|---|---|---|
| `command -v gsd` | missing | `Command availability` section | No `gsd` CLI is available in runtime PATH. |
| `command -v gsd-sdk` | missing | `Command availability` section | `gsd-sdk` cannot execute despite symlink names existing. |
| `/usr/local/bin/gsd-sdk` | broken symlink | `/usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk` and target chain missing | Global CLI entry is invalid. |
| `/root/.local/bin/gsd-sdk` | broken symlink | points to `../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js`; target missing | Expected npm package is not installed where symlink expects it. |
| `/usr/local/bin/get-shit-done-cc` | broken symlink | points through `/root/.local/bin/get-shit-done-cc`; target missing | Installer/runner CLI entry is invalid. |
| npm global packages | missing GSD package | `/usr/local/lib/node_modules` has no matching GSD package | The symlink target package is absent. |
| `npx --no-install gsd-sdk --version` | npm 404 / unavailable | `npx no-install GSD checks` | `gsd-sdk` is not available as a normal public registry package in this environment. |
| `/root/.codex/get-shit-done/bin/gsd-tools.cjs` | present | Additional Codex GSD checks | Codex-local tool exists, but is not bound to Kimi Agent 1. |
| `/root/.codex/skills/gsd-*` | present | Additional Codex GSD checks | GSD skills exist for Codex, not in Kimi/Claude searched locations. |
| `~/.kimi`, `~/.claude`, `~/.config` GSD skills | absent | `GSD skills path search` | Kimi-visible/Claude-visible skill search did not show GSD skills. |

## PATH / Shell Findings
- Login bash PATH includes `/root/.local/bin`, `/usr/local/bin`, and system paths.
- Interactive bash PATH omits `/root/.local/bin` and triggers existing tmux auto-attach behavior: `duplicate session: main`.
- Even login bash with `/root/.local/bin` cannot find usable `gsd` or `gsd-sdk`, because the symlink targets are missing.
- zsh produced no GSD evidence.

## Binary / Symlink Findings
Found symlinks:
- `/usr/local/bin/get-shit-done-cc -> /root/.local/bin/get-shit-done-cc`
- `/usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk`
- `/root/.local/bin/get-shit-done-cc -> ../lib/node_modules/get-shit-done-cc/bin/install.js`
- `/root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js`

No working `gsd` symlink was found. `readlink -f` returned no existing target for the `gsd-sdk` and `get-shit-done-cc` chains. This is a concrete broken-symlink root cause.

## Node/npm Findings
- node: `v18.19.1`
- npm: `9.2.0`
- pnpm/yarn/corepack: unavailable
- npm prefix: `/usr/local`
- npm root -g: `/usr/local/lib/node_modules`
- no GSD/get-shit-done package evidence under the global npm root
- `npm bin -g` is unsupported in this npm build/output, so scripts relying on it would also be fragile
- `npx --no-install gsd-sdk --version` returned registry 404 for `gsd-sdk`, confirming this is not a normal public package name in this environment

## Repo-local Tooling Findings
No `gsd-tools.cjs` was found under `/opt/processmap-test` itself. The only repo-local GSD path was documentation under `/opt/processmap-test/docs/gsd` plus this diagnostic contour.

A usable-looking GSD tool exists outside the repo under:

`/root/.codex/get-shit-done/bin/gsd-tools.cjs`

Running `node /root/.codex/get-shit-done/bin/gsd-tools.cjs` with no arguments returned usage and listed commands: `state`, `resolve-model`, `find-phase`, `commit`, `verify-summary`, `verify`, `frontmatter`, `template`, `generate-slug`, `current-timestamp`, `list-todos`, `verify-path-exists`, `config-ensure-section`, `config-new-project`, `init`, `workstream`, `docs-init`.

This supports `GSD_REPO_LOCAL_TOOL_ONLY` / Codex-local-tool-only rather than a working global CLI.

## Skills Findings
- `~/.kimi`: exists, but no GSD skill paths were found there.
- `~/.claude`: exists, but no GSD skill paths were found there.
- `~/.config`: no GSD skill paths found.
- `/root/.codex/skills/gsd-*`: many GSD skills exist.
- `/root/.codex/agents/gsd-*`: many GSD agent definitions exist.

Meaning: GSD skills are installed for Codex, but the Kimi runtime is not automatically receiving or discovering those skills. Agent 1's observation that GSD skills/tools are absent is accurate from the Kimi-visible environment, but not from the whole server filesystem.

## Agent Script Findings
`tools/pm-agent1-planner.sh` writes a Kimi prompt requiring GSD discipline and then runs plain `kimi`. It does not:
- check `command -v gsd` / `gsd-sdk` before launch;
- detect broken symlinks;
- bind `/root/.codex/get-shit-done/bin/gsd-tools.cjs`;
- point Kimi to `/root/.codex/skills/gsd-*`;
- write a machine-readable GSD availability result for Agent 1.

The newer local iTerm wrapper adds `PATH=/root/.local/bin:/usr/local/bin:...`, but this does not solve the broken target or skill binding problem.

## Historical Evidence
Prior planning evidence already recorded the same failure pattern:
- `tooling/mcp-servers-inventory-and-repair-v1/MCP_HEALTH_MATRIX.md` states that `gsd-tools.cjs` works via `node` directly, while `gsd`/`gsd-sdk` symlinks point to missing `get-shit-done-cc` global npm package.
- ProcessMap handoff/imported notes repeatedly show `gsd-sdk` available on the Mac at `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, but not as a reliable server global CLI.
- Some Project Atlas notes mention `gsd-sdk v1.41.1` and local GSD skill/workflow text under Claude/Codex contexts, indicating the working GSD setup historically lived outside this server Kimi runtime or was not wired into it.

## Root Cause
The concrete root cause is a split installation/binding failure:

1. Server global GSD CLI is broken: `gsd` is absent, and `gsd-sdk` / `get-shit-done-cc` symlinks point to a missing npm package path.
2. The actual GSD assets that remain on the server are Codex-local under `/root/.codex`, not Kimi-local and not in `/opt/processmap-test`.
3. Agent 1 is launched through Kimi and `tools/pm-agent1-planner.sh` without any binding to `/root/.codex/get-shit-done/bin/gsd-tools.cjs` or `/root/.codex/skills/gsd-*`.
4. Therefore Agent 1 correctly falls back to `GSD_FALLBACK_MANUAL_PLANNING_ONLY`: it cannot call `gsd`/`gsd-sdk`, and from its runtime it is not given the GSD skill/tool contracts.

## Repair Options
See `REPAIR_OPTIONS.md` for the expanded list. Recommended direction: create a narrow repair contour that either restores a working global GSD runner or explicitly binds the Codex-local runner/skills into the ProcessMap Agent 1 launcher.

## Recommended Next Contour
tooling/gsd-runner-repair-and-agent1-binding-v1

Scope:
- repair only GSD runner/detection and Agent 1 binding;
- no product code;
- no MCP repair unless explicitly allowed;
- validate Agent 1 sees a working GSD mode;
- update Project Atlas docs with final binding contract.

## Safety Confirmation
- no install performed
- no package repair performed
- no files deleted
- no shell/Kimi/Claude/Codex configs changed
- no MCP repair started
- no RAG indexing started
- no secrets read or output
- no product code changed
- no commit/push/PR
- no deploy
