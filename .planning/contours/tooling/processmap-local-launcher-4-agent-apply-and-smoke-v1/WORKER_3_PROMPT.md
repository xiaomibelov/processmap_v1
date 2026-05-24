# Agent 3 / Worker Prompt — Server 4-Agent Compatibility Verification

## Identity
You are Agent 3 / Worker for ProcessMap.

## Language Rule
- This prompt is in English.
- All generated documentation, reports, and user-facing summaries must be written in **Russian**.
- Preserve exact Russian UI labels when referencing ProcessMap UI.

## Working Directory
`/opt/processmap-test`

## Contour ID
`tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1`

## Scope — Work Package B
Verify **server agent tooling** is fully compatible with the 4-agent workflow and with the local Mac launcher expectations.

Old: Agent 1 → Agent 2 → Agent 3
New: Agent 1 → Agent 2 + Agent 3 → Agent 4

## Mandatory: RAG Preflight
Before any work, run:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" \
  --area "server tooling 4-agent workflow pm-agent4-reviewer-watch pm-agent-status pm-agent-reset-stale tmux CID script name contract" \
  --format md \
  --top-k 10
```
Save output to:
`.planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/RAG_PREFLIGHT_WORKER_3.md`

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
git rev-parse origin/main
git diff --name-only
git diff --stat
```

## Files to Inspect
```bash
ls -la tools/pm-agent1-planner.sh \
      tools/pm-agent2-executor-watch.sh \
      tools/pm-agent3-reviewer-watch.sh \
      tools/pm-agent4-reviewer-watch.sh \
      tools/pm-agent-status.sh \
      tools/pm-agent-reset-stale.sh \
      tools/pm-agents-server-tmux.sh \
      tools/install-processmap-agent-scripts.sh \
      tools/pm-agent-mirror-report.sh \
      tools/pm-gsd-status.sh 2>/dev/null || true
```

For each file:
- Read first 400 lines.
- Run `bash -n` to validate syntax.
- Document current behavior.
- Identify what needs to change for 4-agent support or local launcher compatibility.

## Backup Rule
Before editing any file, create a backup:
```bash
cp "$file" "$file.backup_$(date +%Y%m%d_%H%M%S)"
```

## Required Verification

### 1. Agent 4 Reviewer Script Exists and Works
Verify `tools/pm-agent4-reviewer-watch.sh`:
- `#!/usr/bin/env bash`, `set -euo pipefail`.
- `ROOT="/opt/processmap-test"`.
- `CID` parameter with `validate_cid()` regex `^[A-Za-z0-9_./-]+$`.
- `DIR="$ROOT/.planning/contours/$CID"`.
- `PROMPT="$ROOT/.agents/agent4-reviewer/prompts/${CID//\//__}-reviewer-start.md"`.
- `LOG="$ROOT/.agents/agent4-reviewer/logs/${CID//\//__}-watch.log"`.
- Creates directories for prompt and log.
- Exports PATH + GSD env vars (same as pm-agent1-planner.sh).
- Watcher loop:
  - Waits for `WORKER_2_DONE` AND `WORKER_3_DONE`.
  - Waits for `WORKER_2_REPORT.md` AND `WORKER_3_REPORT.md`.
  - Checks no `REVIEW_PASS`, `CHANGES_REQUESTED`, `REVIEW_BLOCKED.md` exist.
  - Writes `REVIEW_STARTED`.
  - Generates prompt file in **English**.
  - Launches `kimi`.
  - Runs mirror report after exit.

### 2. Status Script Shows 4-Agent State
Verify `tools/pm-agent-status.sh`:
- Shows `=== 4-AGENT WORKFLOW STATUS ===` section.
- Lists Agent 1 (Planner), Worker 2, Worker 3, Agent 4 (Reviewer).
- Checks all relevant markers: `READY_FOR_EXECUTION`, `WORKER_2_DONE`, `WORKER_3_DONE`, `REVIEW_PASS`, `CHANGES_REQUESTED`, etc.
- Lists recent contour files.

### 3. Reset Stale Script Handles Worker Markers
Verify `tools/pm-agent-reset-stale.sh`:
- Safely removes `EXECUTION_STARTED` only if no outputs.
- Safely removes `WORKER_2_STARTED` only if no `WORKER_2_DONE` / `WORKER_2_REPORT.md`.
- Safely removes `WORKER_3_STARTED` only if no `WORKER_3_DONE` / `WORKER_3_REPORT.md`.
- Safely removes `REVIEW_STARTED` only if no review outputs.

### 4. Server Tmux Script Supports 4 Windows
Verify `tools/pm-agents-server-tmux.sh`:
- Creates `A1-planner`, `A2-worker`, `A3-worker`, `A4-reviewer`, `status` windows.
- Calls `pm-agent1-planner.sh`, `pm-agent2-executor-watch.sh`, `pm-agent3-reviewer-watch.sh`, `pm-agent4-reviewer-watch.sh`.
- Selects `A2-worker` window after creation.
- Handles already-inside-tmux case by creating windows in current session.

### 5. Script Name Contract with Local Launcher
Verify that the server script names match what the local launcher expects:

| Local launcher calls | Server script expected |
|---------------------|------------------------|
| `pm-agent1-planner.sh` | `tools/pm-agent1-planner.sh` |
| `pm-agent2-executor-watch.sh` | `tools/pm-agent2-executor-watch.sh` |
| `pm-agent3-reviewer-watch.sh` | `tools/pm-agent3-reviewer-watch.sh` |
| `pm-agent4-reviewer-watch.sh` | `tools/pm-agent4-reviewer-watch.sh` |

If any name mismatch exists, document it and fix if within scope.

### 6. Marker Model
Verify the contour directory supports the 4-agent marker model:
- `READY_FOR_EXECUTION` (Agent 1)
- `WORKER_2_STARTED` / `WORKER_2_DONE` / `WORKER_2_REPORT.md`
- `WORKER_3_STARTED` / `WORKER_3_DONE` / `WORKER_3_REPORT.md`
- `READY_FOR_REVIEW`
- `REVIEW_STARTED` / `REVIEW_REPORT.md` / `REVIEW_PASS` or `CHANGES_REQUESTED`

### 7. GSD Environment Variables
Verify all server scripts export:
```bash
export PATH="$ROOT/bin:/root/.local/bin:/root/.kimi/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
export PROCESSMAP_GSD_BIN="$ROOT/bin/gsd"
export PROCESSMAP_CODEX_GSD_TOOLS="/root/.codex/get-shit-done/bin/gsd-tools.cjs"
export PROCESSMAP_GSD_SKILLS_DIR="/root/.codex/skills"
export PROCESSMAP_GSD_AGENTS_DIR="/root/.codex/agents"
```

## Validation Commands

### bash -n all server scripts
```bash
cd /opt/processmap-test
bash -n tools/pm-agent1-planner.sh
bash -n tools/pm-agent2-executor-watch.sh
bash -n tools/pm-agent3-reviewer-watch.sh
bash -n tools/pm-agent4-reviewer-watch.sh
bash -n tools/pm-agent-status.sh
bash -n tools/pm-agent-reset-stale.sh
bash -n tools/pm-agents-server-tmux.sh
```

### Status output
```bash
./tools/pm-agent-status.sh "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1"
```

### Marker check
```bash
ls -la .planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/
```

## Required Outputs

### WORKER_3_REPORT.md (Russian)
Must contain:
1. Source truth (git branch, HEAD, status).
2. RAG preflight summary.
3. Files inspected / changes applied.
4. bash -n results for all server scripts.
5. Status script 4-agent output.
6. Script name contract verification.
7. Marker model verification.
8. Limitations documented.

### SERVER_4_AGENT_COMPATIBILITY_AUDIT.md (Russian)
Detailed audit of each server script's 4-agent compatibility.

### SERVER_SCRIPT_NAME_CONTRACT.md (Russian)
Table mapping local launcher expected names to actual server script names. Any mismatches flagged.

### SERVER_STATUS_VALIDATION.md (Russian)
Validation of `pm-agent-status.sh` output for 4-agent state.

### SERVER_MARKER_MODEL_VALIDATION.md (Russian)
Validation that all expected markers exist or are supported by the scripts.

### SERVER_FIXES_APPLIED.md or SERVER_NO_FIX_REQUIRED.md (Russian)
- If fixes applied: list backups, diffs, what changed.
- If no fix needed: state why server is already compatible.

### SERVER_VALIDATION_RESULTS.md (Russian)
Checklist of all validation items with PASS/FAIL/NOT_RUN status.

### WORKER_3_DONE
Create this empty marker file when all reports are written:
```bash
touch .planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/WORKER_3_DONE
```

## Boundaries
- NO product runtime changes (frontend/src/, backend/app/).
- NO .env or secrets changes.
- NO package installation.
- NO commit/push/PR/deploy.
- Tooling changes only if strictly needed.
- If blocked, create WORKER_3_BLOCKED.md with exact reason.
