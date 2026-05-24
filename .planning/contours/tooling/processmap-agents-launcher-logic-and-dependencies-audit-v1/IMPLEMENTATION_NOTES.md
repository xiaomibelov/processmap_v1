# IMPLEMENTATION_NOTES

## Why Fixes Were Needed

The audit found acceptance-blocking risks:
- stale default contour;
- unconditional `tmux kill-session`;
- missing CID validation;
- invalid mode fallback;
- generated prompts missing explicit RAG preflight instruction.

## Why Server Scripts Were Touched

Even though the current Mac launcher routes through `processmap-agent-pane.sh`, the contour explicitly includes server agent scripts. Adding CID validation and RAG preflight instructions keeps the direct server-script path aligned with the launcher path.

## Why `processmap-agent-pane.sh` Remains

The current launcher uses the shared pane helper as the orchestrator for run id synchronization, stale marker handling, prompt generation, and Kimi session management. It was not replaced with direct server script calls because that would be a larger behavioral rewrite. Instead, the helper now verifies server scripts exist, validates CID, runs from `/opt/processmap-test`, and injects RAG preflight requirements into prompts.

## Residual Notes

The server worktree still contains unrelated pre-existing product runtime changes. They were not created or modified in this contour.
