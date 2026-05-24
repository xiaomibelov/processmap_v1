# SERVER_AGENT_SCRIPTS_AUDIT

## Files Inspected

- `/opt/processmap-test/tools/pm-agent1-planner.sh`
- `/opt/processmap-test/tools/pm-agent2-executor-watch.sh`
- `/opt/processmap-test/tools/pm-agent3-reviewer-watch.sh`
- `/opt/processmap-test/tools/pm-agent-status.sh`
- `/opt/processmap-test/tools/pm-agent-reset-stale.sh`

## Findings

- All required scripts exist and are executable.
- Agent 1, Agent 2, and Agent 3 scripts set `ROOT="/opt/processmap-test"`.
- Agent scripts `cd "$ROOT"` before launching Kimi.
- Watcher scripts wait for the expected marker files.
- `pm-agent-reset-stale.sh` is per-CID and only removes `EXECUTION_STARTED` or `REVIEW_STARTED` when downstream outputs are absent.
- Default non-login SSH PATH does not show `kimi`, but agent scripts export `/root/.local/bin` before launching Kimi.

## Fixes

- Added CID validation to Agent 1/2/3 server scripts.
- Added explicit role RAG preflight instructions to generated prompts.
- Extended `pm-agent-status.sh` marker list to include run IDs and RAG preflight outputs.
- `pm-agent-reset-stale.sh` was backed up but not changed.

## Validation

Server `bash -n` passed for all five server scripts.

## Result

Server scripts are suitable for this tooling workflow after bounded prompt/validation improvements.
