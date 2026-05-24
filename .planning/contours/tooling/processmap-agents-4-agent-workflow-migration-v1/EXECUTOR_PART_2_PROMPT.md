# Agent 3 / Worker Prompt — Server Tooling Migration

## Identity
You are Agent 3 / Worker for ProcessMap.

## Language Rule
- This prompt is in English.
- All generated documentation, reports, and user-facing summaries must be written in **Russian**.
- Preserve exact Russian UI labels when referencing ProcessMap UI.

## Working Directory
`/opt/processmap-test`

## Contour ID
`tooling/processmap-agents-4-agent-workflow-migration-v1`

## Scope — Work Package B
Migrate or extend the **server agent tooling** to support the new 4-agent workflow.

Old: Agent 1 → Agent 2 → Agent 3
New: Agent 1 → Agent 2 + Agent 3 → Agent 4

## Mandatory: RAG Preflight
Before any work, run:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "tooling/processmap-agents-4-agent-workflow-migration-v1" \
  --area "server tooling 4-agent workflow pm-agent-status pm-agent-reset-stale pm-agent4-reviewer-watch install-processmap-agent-scripts tmux CID" \
  --format md \
  --top-k 10
```
Save output to:
`.planning/contours/tooling/processmap-agents-4-agent-workflow-migration-v1/RAG_PREFLIGHT_WORKER_3.md`

## Mandatory: Source Truth
Capture server source truth:
```bash
cd /opt/processmap-test
pwd
whoami
hostname
date -Is
git status -sb
git branch --show-current
git rev-parse HEAD
git diff --name-only
git diff --stat
```

## Files to Inspect
```bash
ls -la tools/pm-agent1-planner.sh \
      tools/pm-agent2-executor-watch.sh \
      tools/pm-agent3-reviewer-watch.sh \
      tools/pm-agent-status.sh \
      tools/pm-agent-reset-stale.sh \
      tools/pm-agent-mirror-report.sh \
      tools/pm-agents-server-tmux.sh \
      tools/install-processmap-agent-scripts.sh \
      tools/pm-gsd-status.sh 2>/dev/null || true
```

For each file:
- Read first 400 lines.
- Run `bash -n` to validate syntax.
- Document current behavior.
- Identify what needs to change for 4-agent support.

## Backup Rule
Before editing any file, create a backup:
```bash
cp "$file" "$file.bak.$(date +%Y%m%d_%H%M%S)"
```

## Required Changes

### 1. New Agent 4 Reviewer Script
Create `tools/pm-agent4-reviewer-watch.sh`:
- `#!/usr/bin/env bash`, `set -euo pipefail`.
- `ROOT="/opt/processmap-test"`.
- `CID="${1:?Usage: pm-agent4-reviewer-watch.sh <contour-id>}"`.
- `validate_cid()` with same regex: `^[A-Za-z0-9_./-]+$`.
- `DIR="$ROOT/.planning/contours/$CID"`.
- `PROMPT="$ROOT/.agents/agent4-reviewer/prompts/${CID//\//__}-reviewer-start.md"`.
- `LOG="$ROOT/.agents/agent4-reviewer/logs/${CID//\//__}-watch.log"`.
- `mkdir -p "$(dirname "$PROMPT")" "$(dirname "$LOG")"`.
- Export PATH + GSD env vars (same as pm-agent1-planner.sh).
- Watcher loop:
  - Wait for `WORKER_2_DONE` AND `WORKER_3_DONE`.
  - Wait for `WORKER_2_REPORT.md` AND `WORKER_3_REPORT.md`.
  - Ensure no `REVIEW_PASS`, `CHANGES_REQUESTED`, `REVIEW_BLOCKED.md` exist.
  - If `REVIEW_STARTED` exists but no outputs, wait (or handle stale).
  - Write `REVIEW_STARTED`.
  - Generate prompt file (English) that instructs Agent 4 to:
    - Read REVIEWER_PROMPT.md from contour.
    - Read PLAN.md, WORKER_2_REPORT.md, WORKER_3_REPORT.md.
    - Run GSD discipline.
    - Run RAG preflight (reviewer).
    - Independently inspect changed files.
    - Run `bash -n` on scripts.
    - Run dry-run if available.
    - Verify CID propagation.
    - Verify marker model.
    - Verify status output.
    - Verify no product runtime changes.
    - Verify no secrets printed.
    - Create REVIEW_REPORT.md + REVIEW_PASS or CHANGES_REQUESTED.
  - Launch `kimi` interactively.
  - After exit, run `pm-agent-mirror-report.sh` if available.

### 2. Update pm-agent-status.sh
Add checks for new markers:
- `WORKER_2_STARTED`
- `WORKER_2_REPORT.md`
- `WORKER_2_DONE`
- `WORKER_3_STARTED`
- `WORKER_3_REPORT.md`
- `WORKER_3_DONE`
- `REVIEW_REPORT.md`
- Keep old markers for backward compatibility.

Add a 4-agent summary section:
```
=== 4-AGENT WORKFLOW STATUS ===
Agent 1 (Planner):   [READY_FOR_EXECUTION present?]
Worker 2:            [WORKER_2_DONE present?]
Worker 3:            [WORKER_3_DONE present?]
Agent 4 (Reviewer):  [REVIEW_PASS / CHANGES_REQUESTED present?]
```

### 3. Update pm-agent-reset-stale.sh
Add safe reset rules for new markers:
- If `WORKER_2_STARTED` exists but no `WORKER_2_DONE` and no `WORKER_2_REPORT.md`, remove `WORKER_2_STARTED`.
- If `WORKER_3_STARTED` exists but no `WORKER_3_DONE` and no `WORKER_3_REPORT.md`, remove `WORKER_3_STARTED`.
- If `REVIEW_STARTED` exists but no `REVIEW_REPORT.md`, `REVIEW_PASS`, `CHANGES_REQUESTED`, or `REVIEW_BLOCKED.md`, remove `REVIEW_STARTED`.
- NEVER remove `WORKER_2_DONE`, `WORKER_3_DONE`, `REVIEW_PASS`, `CHANGES_REQUESTED`.

### 4. Update pm-agents-server-tmux.sh
- Add `pm-agent4-reviewer-watch.sh` to the required file checklist.
- Add a new tmux window/pane for Agent 4 Reviewer.
- Update window names to reflect new roles (A2-worker, A3-worker, A4-reviewer).
- Keep existing session attach logic.

### 5. Update install-processmap-agent-scripts.sh
- Create `.agents/agent4-reviewer/prompts` and `.agents/agent4-reviewer/logs`.
- Add `pm-agent4-reviewer-watch.sh` to the list of generated scripts.
- Update the `AGENT_SCRIPTS_INSTALLED.md` note to mention 4-agent model.
- Keep backward compatibility: do not break 3-agent scripts.

### 6. Update pm-agent-mirror-report.sh
Add to the allowlist:
- `WORKER_2_REPORT.md`
- `WORKER_3_REPORT.md`
- `WORKER_2_DONE`
- `WORKER_3_DONE`
- `REWORK_REQUEST.md`
- Keep existing files.

### 7. Update pm-agent1-planner.sh (Optional but Recommended)
- The generated planner prompt should mention the 4-agent workflow.
- It should still create `EXECUTOR_PROMPT.md` for backward compatibility, OR
- It should create `WORKER_2_PROMPT.md` and `WORKER_3_PROMPT.md` when in 4-agent mode.
- Decision: since this is a migration contour, the simplest safe approach is to keep pm-agent1-planner.sh generating the old prompt (for compatibility) and let Agent 1 (human or AI) manually create WORKER_2_PROMPT.md and WORKER_3_PROMPT.md in the contour.

## Required Reports (in Russian)
Create these files in the contour directory:

1. **WORKER_3_REPORT.md**
   - Summary of work done.
   - Files inspected.
   - Changes made (or not made, with reason).
   - Validation results.
   - Blockers (if any).

2. **SERVER_AGENT_4_WORKFLOW_AUDIT.md**
   - Current state of each server script.
   - What supports 4 agents already.
   - What needs changing.
   - Recommended changes.

3. **SERVER_AGENT_FIXES_APPLIED.md**
   - If changes were made: list each file, backup location, diff summary.
   - Or **SERVER_AGENT_NO_FIX_REQUIRED.md** if no changes needed.

4. **AGENT4_REVIEWER_SCRIPT_REPORT.md**
   - Design of `pm-agent4-reviewer-watch.sh`.
   - How it waits for both workers.
   - Prompt generation logic.
   - GSD env var exports.
   - Path verification.

5. **STATUS_SCRIPT_4_AGENT_REPORT.md**
   - How `pm-agent-status.sh` now shows 4-agent state.
   - Backward compatibility notes.

6. **SERVER_VALIDATION_RESULTS.md**
   - `bash -n` for all server scripts (old and new).
   - `pm-agent-status.sh` output for this contour.
   - RAG preflight CLI test.
   - Proof no product files changed.

## Final Marker
After all work and reports are complete, create:
```
.planning/contours/tooling/processmap-agents-4-agent-workflow-migration-v1/WORKER_3_DONE
```

Contents:
```
WORKER_3_DONE
contour=tooling/processmap-agents-4-agent-workflow-migration-v1
run_id=20260517T000255Z-41876
completed_at=<ISO8601>
```

## Boundaries (HARD)
- NO product runtime changes (frontend/src/, backend/app/).
- NO .env or secrets changes.
- NO package installation.
- NO commit/push/PR/deploy.
- NO GSD repair.
- NO MCP repair.
- All changes must be under `tools/` or `.planning/contours/<CID>/` or `.agents/`.
- Backups before edits.

## Handoff
After WORKER_3_DONE is created, Agent 4 / Reviewer will wait for both WORKER_2_DONE and WORKER_3_DONE before starting review.
