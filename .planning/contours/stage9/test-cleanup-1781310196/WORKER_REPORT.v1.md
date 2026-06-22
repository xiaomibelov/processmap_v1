# Updates (v1)

## Goal

Verify that `.agents/bin/cleanup.sh` correctly deletes old contour and run-state directories while preserving recent ones, per `PLAN.md` for contour `stage9/test-cleanup-1781310196`.

## Source Truth at Execution Time

- Repo: `/opt/processmap-test`
- Remote: `git@github.com:xiaomibelov/processmap_v1.git`
- Branch: `test/stage9-cleanup-1781310196` (tracks `origin/main`)
- HEAD: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Origin/main: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Merge-base: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Status: clean except pre-existing unrelated untracked files (`.planning/contours/stage[1-8]/`, `.planning/contours/stage9/`, `.worktrees/`)

## Files Changed

- None. `git diff --name-only` returned empty.
- `git diff --check` reported no whitespace errors.

## Validation Command Output

### Script existence / executability

```
cleanup.sh executable: yes
test_stage9_cleanup.sh executable: yes
```

### Test harness result

```
PASS: old REVIEW_PASS contour (>7 days) removed
PASS: old non-pass contour (>30 days) removed
PASS: old run-state dir (>30 days) removed
PASS: recent REVIEW_PASS contour (<=7 days) preserved
PASS: recent non-pass contour (<=30 days) preserved
PASS: new REVIEW_PASS contour preserved
PASS: new non-pass contour preserved
PASS: recent run-state dir (<=30 days) preserved
PASS: new run-state dir preserved

Results: 9 passed, 0 failed
```

### Cleanup log tail

```
2026-06-13T00:31:08+00:00 Starting cleanup
2026-06-13T00:31:08+00:00 Cleanup done
```

### Surviving test fixture verification

- No `test-stage9-*` directories remain under `.planning/contours/` or `.agents/run-state/` after the harness cleaned up its own fixtures.
- Pre-existing contour directories (`stage1/` through `stage9/`, plus type-level `audit/`, `feature/`, `fix/`) remain intact.
- Pre-existing run-state directories remain intact.

## Runtime Proof Status

- No browser/UI runtime proof required (server-side bash verification per `PLAN.md`).
- Dev server on `:5177` is running and serving the current build:
  - Response: `HTTP/1.1 200 OK` from `nginx/1.27.5`
  - `Date: Sat, 13 Jun 2026 00:31:23 GMT` (fresh).

## Explicit Unchanged Areas

- No product frontend/backend/agent-ui code modified.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files.
- No merge, rebase, cherry-pick, push, PR, deploy, or release performed.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- No browser/runtime UI navigation.

## Remaining Risks

- The cleanup script uses `find ... -maxdepth 0 -exec rm -rf {} +` on directories it is enumerating. While the test harness passes, this pattern can be fragile if `find` behavior changes or if directory timestamps are modified by external processes.
- The retention rules are encoded in the cleanup script itself (7 days for `REVIEW_PASS`, 30 days for others); any future rule changes require updating both the script and the test harness.
- No further action is required for this verification contour.
