# RUNTIME_BEHAVIOR_IMPACT

## User-visible Changes

- Launcher no longer silently starts an old hard-coded contour when Enter is pressed.
- User must enter a CID unless `PROCESSMAP_DEFAULT_CID` is explicitly set.
- Selected server/root/CID/mode are printed before launch.
- Remote status is shown before launch.
- Killing old `processmap-agents` tmux session is opt-in.
- Invalid mode is rejected instead of falling through.
- Invalid CID is rejected.
- `PROCESSMAP_AGENTS_DRY_RUN=1` can inspect command construction without opening iTerm panes/windows.

## Preserved Behavior

- Split mode `[1]` remains supported.
- 3-window fallback `[2]` remains supported.
- A1/A2/A3 still launch via `processmap-agent-pane.sh` with one shared run id and one shared CID.
- Existing per-CID stale reset behavior remains in helpers.

## Not Changed

- No frontend/backend runtime.
- No package files.
- No Docker/runtime.
- No RAG core tooling.
- No deploy behavior.
