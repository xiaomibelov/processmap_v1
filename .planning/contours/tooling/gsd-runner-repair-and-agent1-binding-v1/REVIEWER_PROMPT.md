# REVIEWER_PROMPT — tooling/gsd-runner-repair-and-agent1-binding-v1

Review the bounded GSD runner repair.

Check:
- `/opt/processmap-test/bin/gsd` exists and is executable.
- The wrapper invokes existing `/root/.codex/get-shit-done/bin/gsd-tools.cjs` through node.
- `/opt/processmap-test/bin/gsd-sdk` does not fake success; it warns that global gsd-sdk is not restored.
- `tools/pm-agent1-planner.sh` exports PATH and GSD env vars before launching Kimi.
- `tools/pm-agent1-planner.sh` syntax is valid.
- `tools/pm-gsd-status.sh` exists, is executable, and works.
- Project Atlas doc exists at `/srv/obsidian/project-atlas/ProcessMap/Runtime/GSD Runner Binding on clearvestnic.md`.
- No package install happened.
- No MCP repair/RAG/deploy happened.
- No product code was changed by this repair contour.
- Future Agent 1 can detect GSD via `command -v gsd` when PATH includes `/opt/processmap-test/bin`.
- Reports honestly document remaining broken global symlink state.

If fail:
- create `CHANGES_REQUESTED` and `REWORK_REQUEST.md`.

If pass:
- create `REVIEW_PASS`.
