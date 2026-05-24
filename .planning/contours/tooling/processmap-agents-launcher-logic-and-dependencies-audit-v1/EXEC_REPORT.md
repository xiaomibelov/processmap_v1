# EXEC_REPORT

## Executor Verdict

FIXES_APPLIED. The audit found real launcher risks and applied bounded tooling fixes only.

## Scope Executed

- Read planning pack for `tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1`.
- Ran executor RAG preflight and saved `RAG_PREFLIGHT_EXECUTOR.md`.
- Inspected local Mac launcher files.
- Inspected server agent scripts.
- Applied bounded fixes to local launcher stack and server agent scripts.
- Ran static and dry-run validation.
- Did not modify product runtime, frontend/backend app code, package files, `.env`, Docker runtime, RAG core tooling, or deployment config.

## Key Findings

- The main launcher had stale hard-coded default contour `tooling/project-atlas-server-docs-import-and-triage-v1`.
- Main launcher always killed `tmux` session `processmap-agents` before launch.
- Main launcher accepted invalid mode by falling through to split mode.
- Local helpers and shared pane helper also had stale fallback contour defaults.
- CID validation was missing.
- Current helpers route through `~/bin/processmap-agent-pane.sh`; that wrapper correctly starts remote work from `/opt/processmap-test` and now validates CID and verifies server agent scripts exist.
- Server agent scripts existed and ran from `/opt/processmap-test`, but generated prompts did not explicitly require RAG preflight.

## Fix Summary

Local:
- Removed stale implicit default from main launcher.
- Optional default is now only `PROCESSMAP_DEFAULT_CID`.
- Added CID validation.
- Added mode validation.
- Made `tmux kill-session` optional with confirmation.
- Added remote status before launch.
- Added dry-run support via `PROCESSMAP_AGENTS_DRY_RUN=1`.
- Made helper scripts require explicit CID.
- Added shared pane helper CID validation and server script preflight.
- Added RAG preflight instructions to generated Agent 1/2/3 pane prompts.

Server:
- Added CID validation to `pm-agent1-planner.sh`, `pm-agent2-executor-watch.sh`, and `pm-agent3-reviewer-watch.sh`.
- Added RAG preflight instructions to server-generated Agent 1/2/3 prompts.
- Extended `pm-agent-status.sh` to show run IDs and RAG preflight files.

## Validation Summary

Passed:
- Local `bash -n` for all four local launcher scripts.
- Server `bash -n` for all five server scripts.
- Split helper dry-run prints A1/A2/A3 commands with same CID.
- 3-window helper dry-run prints A1/A2/A3 commands with same CID.
- Main launcher dry-run reaches helper without opening iTerm.
- Invalid CID with spaces is rejected with rc 2.
- Invalid mode is rejected and prompts again.
- `pm-agent-status.sh` shows `AGENT_RUN_ID`, `EXECUTION_RUN_ID`, `REVIEW_RUN_ID`, and RAG preflight files.

## Notes

No uncontrolled real agent launch was performed. A dry-run pane smoke for `tooling/launcher-smoke-test-v1` created only lightweight server-side run/contour scaffolding, not product runtime changes.
