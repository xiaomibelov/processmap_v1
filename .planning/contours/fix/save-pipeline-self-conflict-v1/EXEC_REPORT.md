# Execution Report

## Result

- SaveCoordinator queues are now keyed by session, so `xml` and `rawXml`
  transports cannot overlap for one session.
- Retry attempts re-read the configured base-version source and apply the
  refreshed value to the real transport payload shape.
- `rawXml` now prefers the shared CAS tracker over its captured payload base.
- HTTP 423 returns structured `SESSION_LOCK_BUSY` details with the pre-lock
  `server_current_version` snapshot.
- Existing hard-gate behavior for HTTP 409 is unchanged.

## TDD Evidence

- RED: cross-pipeline test observed `rawXml` starting before `xml` completed.
- RED: retry test sent bases `[228, 228]` after the source advanced to 229.
- GREEN: targeted frontend save suite: 38/38 passed.
- GREEN: deterministic backend 423 response-contract test passed.
- `git diff --check`: passed.
- `graphify update .`: completed; warnings were limited to existing parser/version notices.

## Limits

- A client abort can still leave an unknown server commit outcome. Correct
  automatic reconciliation needs a server mutation id or a versioned XML/hash
  read contract; actor identity alone is unsafe. This patch does not auto-adopt
  a version after timeout or 409.
- Full frontend suite was attempted in a dependency-free Node container. Most
  tests ran, but React-dependent tests could not resolve installed packages and
  one unrelated existing assertion failed. The run is not counted as clean.
- No stage, DB, deploy, merge, push, or PR action was performed.

## Git Proof

- Branch: `fix/save-pipeline-self-conflict-v1`
- Base/HEAD before commit: `5552932ac44e81d9fd2288bfc8f6689afa50e76f`
- Worktree: `/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/fix-save-pipeline-self-conflict-v1`
