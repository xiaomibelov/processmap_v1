# EXEC_REPORT — tooling/gsd-runner-repair-and-agent1-binding-v1

## Verdict
READY_FOR_REVIEW

## Bootstrap Mode
GSD_BOOTSTRAP_REPAIR_EXCEPTION

GSD could not be used before repair because the diagnostic source showed: global `gsd` was absent; `gsd-sdk` / `get-shit-done-cc` were broken symlinks; global npm package `get-shit-done-cc` was not installed; the working GSD assets existed only under `/root/.codex` and were not bound into Kimi/Agent 1.

## Diagnostic Source
- `/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/GSD_ROOT_CAUSE_REPORT.md`
- `/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md`
- `/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/REPAIR_OPTIONS.md`
- `/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/STATE.json`

## Source Truth
- repo: `/opt/processmap-test`
- branch: `fix/lockfile-sync-test`
- HEAD: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- origin/main: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- user: `root`
- host: `clearvestnic.ru`
- runtime health: `http://clearvestnic.ru:8088/health` returned ok/healthy
- git status before and after showed pre-existing dirty product files. This repair did not intentionally edit product code.

## Root Cause Fixed
The repair did not install or restore the global npm package. Instead it created a ProcessMap-local GSD binding using the existing Codex-local GSD runner:

```text
/opt/processmap-test/bin/gsd -> node /root/.codex/get-shit-done/bin/gsd-tools.cjs "$@"
```

Agent 1 now receives:

```text
PATH=/opt/processmap-test/bin:$PATH
PROCESSMAP_GSD_BIN=/opt/processmap-test/bin/gsd
PROCESSMAP_CODEX_GSD_TOOLS=/root/.codex/get-shit-done/bin/gsd-tools.cjs
PROCESSMAP_GSD_SKILLS_DIR=/root/.codex/skills
PROCESSMAP_GSD_AGENTS_DIR=/root/.codex/agents
```

The active local iTerm wrapper was also updated so the desktop-launched Kimi workflow exposes the same GSD binding.

## Files Changed
| Path | Change | Reason | Rollback |
|---|---|---|---|
| `/opt/processmap-test/bin/gsd` | new executable wrapper | Provide stable ProcessMap-local `gsd` command without global npm install | Remove file |
| `/opt/processmap-test/bin/gsd-sdk` | new warning wrapper | Avoid fake-compatible `gsd-sdk`; document that ProcessMap uses `gsd` wrapper | Remove file |
| `/opt/processmap-test/tools/pm-gsd-status.sh` | new status helper | Read-only GSD visibility and broken symlink diagnostics | Remove file |
| `/opt/processmap-test/tools/pm-agent1-planner.sh` | exports PATH/GSD env vars and prompt/banner binding | Make GSD visible to Agent 1 in Kimi | Revert added export/banner/prompt sections |
| `/opt/processmap-test/tools/pm-agent-status.sh` | appends GSD status section | Surface GSD status in ProcessMap agent status | Revert added GSD section |
| `/srv/obsidian/project-atlas/ProcessMap/Runtime/GSD Runner Binding on clearvestnic.md` | new runtime doc | Document root cause, binding, validation, non-goals | Remove/archive doc |
| `/Users/mac/bin/processmap-agent-pane.sh` | local wrapper exports same GSD env vars | Active iTerm A1 workflow uses this path, not only server script | Revert GSD export/prompt/banner additions |
| `.planning/contours/tooling/gsd-runner-repair-and-agent1-binding-v1/*` | contour reports | Plan/execution/validation/review handoff | Archive/remove contour |

## Validation
Detailed outputs are in `VALIDATION_REPORT.md`.

Summary:
- `command -v gsd` with `PATH=/opt/processmap-test/bin:$PATH` returns `/opt/processmap-test/bin/gsd`.
- `/opt/processmap-test/bin/gsd` is executable.
- `/root/.codex/get-shit-done/bin/gsd-tools.cjs` exists.
- `gsd --help` and `gsd --version` return expected unsupported-flag errors from `gsd-tools.cjs`; not a blocker.
- `gsd` with no args prints `gsd-tools` usage and command list.
- `bash -n tools/pm-agent1-planner.sh` passed.
- `bash -n tools/pm-agent-status.sh` passed.
- `bash -n tools/pm-gsd-status.sh` passed.
- `./tools/pm-gsd-status.sh` finds wrapper, Codex GSD tools, 85 GSD skill directories, and 66 GSD agent files.
- local `~/bin/processmap-agent-pane.sh` syntax passed.
- `STATE.json` validates as JSON.

## Agent 1 Binding
Server-side Agent 1 script now exports `/opt/processmap-test/bin` ahead of PATH and exposes GSD paths through environment variables before launching Kimi. Its prompt and startup banner show:

- GSD command: `/opt/processmap-test/bin/gsd`
- Codex-local tools: `/root/.codex/get-shit-done/bin/gsd-tools.cjs`
- skills: `/root/.codex/skills/gsd-*`
- agents: `/root/.codex/agents/gsd-*`

The local iTerm pane wrapper used by the desktop launcher now exports the same values into the remote Kimi session.

## Remaining Warnings
- `/usr/local/bin/gsd-sdk` and `/root/.local/bin/gsd-sdk` remain broken by design. This contour explicitly did not repair global symlinks.
- The global npm package `get-shit-done-cc` remains uninstalled by design.
- `gsd-tools.cjs` does not support `--help` / `--version`; use no-args usage or known `gsd-tools` commands for probing.
- Kimi must be launched through ProcessMap agent scripts or a shell that prepends `/opt/processmap-test/bin` to PATH.
- The repository already had dirty product-code files before this repair; they were not touched by this contour.

## Safety Confirmation
- no frontend/backend product code intentionally changed
- no package install
- no MCP repair
- no RAG bootstrap
- no durable truth/BPMN changes
- no commit/push/PR/deploy
- no secrets read or printed
