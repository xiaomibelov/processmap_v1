# ProcessMap Pipeline Fixes

## Summary

8 critical fixes applied to the ProcessMap multi-agent pipeline without breaking the existing iTerm pane structure.

---

## 1. Config file instead of env chain

**Before:** Env vars propagated through 5 hops: Desktop → iTerm launcher → pane wrapper → SSH command → remote bash. Fragile and lossy.

**After:**
- `processmap-agent-pane.sh` generates `~/.processmap-agent-run-state/$RUN_ID/config.sh` with all exports
- Copies it to server via `scp` before SSH
- Remote script starts with `source /opt/processmap-test/.agents/run-state/$RUN_ID/config.sh`
- Fallback to env with warning if config.sh missing

**Files changed:** `processmap-agent-pane.sh`

---

## 2. Cleanup /tmp → persistent state directories

**Before:** Remote scripts in `/tmp`, local PID files in `/tmp`, lost on reboot.

**After:**
- Remote scripts: `.agents/run-state/$RUN_ID/scripts/agent-$AGENT-$$.sh`
- Local PID/state: `~/.processmap-agent-run-state/$RUN_ID/`
- Remote script auto-removed via `trap 'rm -f "$SCRIPT_PATH"' EXIT`
- Local PID file cleaned via `EXIT` trap in `processmap-agent-pane.sh`

**Files changed:** `processmap-agent-pane.sh`

---

## 3. Atomic writes + .ready markers

**Before:** Agents wrote directly to target files. Race conditions and partial reads possible.

**After:**
- Write to `file.tmp.$$` → `mv` → `touch file.ready`
- Downstream agents prefer `.ready` marker or check file age > 2s
- Applied to A1 (PLAN.md, STATE.json, etc.) and A2 (EXEC_REPORT.md, READY_FOR_REVIEW)

**Files changed:** `pm-agent1-planner.sh`, `pm-agent2-executor-watch.sh`

---

## 4. Versioning artifacts on rework

**Before:** A3 overwrote `EXEC_REPORT.md` in place. A4 could read partial/stale data.

**After:**
- Counter: `.agents/run-state/$RUN_ID/EXEC_REPORT_VERSION`
- Files written as `EXEC_REPORT.v1.md`, `EXEC_REPORT.v2.md`, ...
- `EXEC_REPORT.md` is always a symlink to current version
- `READY_FOR_REVIEW` contains version number (`READY_FOR_REVIEW.v2`)
- A4 reads version from READY_FOR_REVIEW, then reads matching `EXEC_REPORT.v{N}.md`

**Files changed:** `pm-agent2-executor-watch.sh`, `pm-agent3-reviewer-watch.sh`, `pm-agent4-reviewer-watch.sh`

---

## 5. A3 persistent loop + approval-file mechanism

**Before:** A3 asked "Approve merge/deploy/verify?" interactively. In `ssh -tt` pane this hung forever.

**After:**
- A3 runs in `while true` loop
- After merge, writes `AWAITING_APPROVAL` with action/reason/timestamp
- A0 dashboard shows: `⚠️ AWAITING APPROVAL: merge-deploy-verify`
- User creates `APPROVED` or `REJECTED` file
- A3 polls every 5s
- `APPROVED` → continues to `READY_FOR_REVIEW`
- `REJECTED` → writes `BLOCKED_BY_USER`, stops

**Files changed:** `pm-agent3-reviewer-watch.sh`

---

## 6. A4 persistent loop

**Before:** A4 was one-shot. After `CHANGES_REQUESTED`, process died. No one restarted it.

**After:**
- A4 runs in `while true` loop
- After `REVIEW_PASS` → exits (done)
- After `CHANGES_REQUESTED` → stays alive, monitors `READY_FOR_REVIEW`
- Detects new version via `EXEC_REPORT_VERSION` and `READY_FOR_REVIEW` content
- Runs new review cycle automatically
- `STOP` file causes graceful exit

**Files changed:** `pm-agent4-reviewer-watch.sh`

---

## 7. A3 rework watch

**Before:** No automated rework. CHANGES_REQUESTED required manual relaunch.

**After:**
- A3 monitors `REWORK_REQUEST.md` and `CHANGES_REQUESTED`
- On detection: runs `kimi --yolo -p` with rework prompt
- Updates versioned `EXEC_REPORT.v{N}.md` and symlink
- Removes `CHANGES_REQUESTED` + `REWORK_REQUEST.md`
- Touches new `READY_FOR_REVIEW` with incremented version
- A4 picks up new version automatically

**Files changed:** `pm-agent3-reviewer-watch.sh`

---

## 8. A0 local mirror

**Before:** A0 did SSH for every marker read. High latency and server load.

**After:**
- Background sync via `scp` every 10s inside A0 loop
- Downloads `.planning/contours/$CID/*.ready` and `.agents/run-state/$RUN_ID/*`
- Stores in `~/.processmap-agent-run-state/$RUN_ID/mirror/`
- A0 renders dashboard from local mirror
- SSH only used as fallback if mirror stale > 30s

**Files changed:** `processmap-agent-pane.sh`

---

## 9. Idempotent git operations in A3

**Before:** `git merge` + `git push` could fail or duplicate on rework.

**After:**
- Skip merge if already on `main` and merge commit exists
- Push only if `git log origin/main..main` is non-empty
- Verify with curl retry 5× with exponential backoff
- On verify failure: write `DEPLOY_VERIFY_FAILED`, do not auto-rollback

**Files changed:** `pm-agent3-reviewer-watch.sh`

---

## Files Modified

| File | Location | What changed |
|------|----------|--------------|
| `processmap-agent-pane.sh` | `~/bin/` | Config generation, persistent paths, local mirror, SSH command |
| `pm-agent1-planner.sh` | `/opt/processmap-test/tools/` | Atomic writes, .ready markers |
| `pm-agent2-executor-watch.sh` | `/opt/processmap-test/tools/` | Atomic writes, versioning, .ready markers |
| `pm-agent3-reviewer-watch.sh` | `/opt/processmap-test/tools/` | Persistent loop, approval files, rework watch, versioning, idempotent git |
| `pm-agent4-reviewer-watch.sh` | `/opt/processmap-test/tools/` | Persistent loop, versioning, auto-re-review |
| `pm-agent-status.sh` | `/opt/processmap-test/tools/` | Local mirror support, new markers |

## Backward Compatibility

- If `config.sh` is missing, remote scripts fall back to env vars with a warning
- `.ready` markers are additive; old pipelines without them still work
- Versioning only activates when `EXEC_REPORT_VERSION` file exists
- All changes use bash/ssh/rsync/mv/ln only — no new dependencies
