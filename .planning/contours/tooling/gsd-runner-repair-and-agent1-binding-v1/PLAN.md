# PLAN — tooling/gsd-runner-repair-and-agent1-binding-v1

## Bootstrap Mode
GSD_BOOTSTRAP_REPAIR_EXCEPTION

This contour repairs the GSD runner/binding itself. Normal GSD execution could not be used before repair because the diagnostic contour proved that global `gsd` was absent and `gsd-sdk` / `get-shit-done-cc` symlinks were broken.

## Diagnostic Source
- `tooling/gsd-availability-root-cause-diagnostic-v1/GSD_ROOT_CAUSE_REPORT.md`
- `tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md`
- `tooling/gsd-availability-root-cause-diagnostic-v1/REPAIR_OPTIONS.md`
- `tooling/gsd-availability-root-cause-diagnostic-v1/STATE.json`

## Chosen Repair Option
Use existing Codex-local GSD tooling instead of installing packages or changing global symlinks.

Create:
- `/opt/processmap-test/bin/gsd` wrapper around `/root/.codex/get-shit-done/bin/gsd-tools.cjs`
- `/opt/processmap-test/bin/gsd-sdk` warning wrapper, intentionally not fake-compatible
- `/opt/processmap-test/tools/pm-gsd-status.sh`

Update:
- `/opt/processmap-test/tools/pm-agent1-planner.sh` to export PATH and GSD env vars before launching Kimi
- `/opt/processmap-test/tools/pm-agent-status.sh` to show GSD status
- local `~/bin/processmap-agent-pane.sh` so the active iTerm workflow also exposes GSD to Agent 1
- Project Atlas runtime doc

## Non-Goals
- Do not install npm/pip packages.
- Do not repair `/usr/local/bin` global symlinks.
- Do not modify frontend/backend product code.
- Do not run MCP repair.
- Do not run RAG bootstrap.
- Do not deploy or create PRs.
- Do not read or print secrets.

## Validation Plan
- `command -v gsd` with `/opt/processmap-test/bin` prepended to PATH.
- Run `gsd --help`, `gsd --version`, and `gsd` no-args usage probe.
- Validate `pm-agent1-planner.sh`, `pm-agent-status.sh`, and `pm-gsd-status.sh` syntax.
- Run `./tools/pm-gsd-status.sh`.
- Verify Codex GSD skills and agents directories are visible.
- Verify git diff does not include new product-code changes from this repair.

## Rollback Plan
- Remove `/opt/processmap-test/bin/gsd` and `/opt/processmap-test/bin/gsd-sdk`.
- Remove `/opt/processmap-test/tools/pm-gsd-status.sh`.
- Revert GSD export/banner additions in `tools/pm-agent1-planner.sh` and `tools/pm-agent-status.sh`.
- Revert GSD export additions in local `~/bin/processmap-agent-pane.sh`.
- Remove or archive the Project Atlas runtime doc.
