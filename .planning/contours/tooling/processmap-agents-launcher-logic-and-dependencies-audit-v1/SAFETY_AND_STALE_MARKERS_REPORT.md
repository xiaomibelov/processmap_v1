# SAFETY_AND_STALE_MARKERS_REPORT

## Default Contour Safety

Before: pressing Enter launched stale hard-coded default `tooling/project-atlas-server-docs-import-and-triage-v1`.

After:
- No local hard-coded stale default remains.
- Optional default must be explicitly set in `PROCESSMAP_DEFAULT_CID`.
- Empty CID is rejected if no env default exists.

## tmux Kill Safety

Before: main launcher always ran:

```bash
tmux kill-session -t processmap-agents
```

After:
- Launcher asks: `Kill old server tmux session 'processmap-agents' before launch? [y/N]`
- Default is no.
- No session is killed unless the user explicitly answers yes.

## Stale Marker Safety

`pm-agent-reset-stale.sh` remains per-CID and guarded:
- Removes `EXECUTION_STARTED` only when no execution output exists.
- Removes `REVIEW_STARTED` only when no review output exists.
- Does not delete plan, execution report, review report, pass/fail markers, or prompts.

## Dry-run Safety

`PROCESSMAP_AGENTS_DRY_RUN=1` prints A1/A2/A3 commands and does not open iTerm panes/windows.

## Result

Stale default and unconditional tmux-kill risks are addressed.
