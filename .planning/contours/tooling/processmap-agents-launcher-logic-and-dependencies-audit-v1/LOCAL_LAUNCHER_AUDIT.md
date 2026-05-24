# LOCAL_LAUNCHER_AUDIT

## Files Inspected

- `/Users/mac/Desktop/ProcessMap Agents.command`
- `/Users/mac/bin/processmap-iterm-agents.sh`
- `/Users/mac/bin/processmap-iterm-agents-3windows.sh`
- `/Users/mac/bin/processmap-agent-pane.sh`

## Before

- `ProcessMap Agents.command` contained `DEFAULT_CID="tooling/project-atlas-server-docs-import-and-triage-v1"`.
- Empty CID launched the stale default.
- Mode values other than `2` fell through to split mode.
- Launcher always ran `tmux kill-session -t processmap-agents`.
- Helpers had stale fallback CID defaults.
- Shared pane helper had stale fallback CID default.

## After

- No stale hard-coded default remains in local launcher stack.
- Optional default must come from `PROCESSMAP_DEFAULT_CID`.
- Empty CID is rejected when no explicit env default exists.
- CID must match `^[A-Za-z0-9_./-]+$`.
- Mode must be `1` or `2`.
- `tmux kill-session` requires explicit confirmation.
- `ssh -n` is used for non-interactive SSH checks so scripted/dry-run stdin is not consumed.
- Split and 3-window helpers require explicit CID and validate it.
- Shared pane helper requires explicit role and CID, validates CID, and checks server agent scripts exist.

## Dependency Status

- `ssh`: present at `/usr/bin/ssh`.
- `osascript`: present at `/usr/bin/osascript`.
- iTerm: running.
- Local scripts executable.

## Result

Local launcher source truth was fully inspected and bounded fixes were applied.
