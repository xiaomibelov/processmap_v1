#!/usr/bin/env bash
set -euo pipefail

# ProcessMap Agent 3 — Reviewer (3-agent pipeline)
# Persistent loop with versioning support.

ROOT="/opt/processmap-test"
CID="${1:?Usage: pm-agent3-reviewer-watch.sh <contour-id>}"

validate_cid() {
  local value="$1"
  if [[ ! "$value" =~ ^[A-Za-z0-9_./-]+$ ]]; then
    echo "ERROR: invalid contour id: $value" >&2
    exit 2
  fi
}

validate_cid "$CID"

DIR="$ROOT/.planning/contours/$CID"
RUN_STATE_DIR="$ROOT/.agents/run-state"
LOG="$ROOT/.agents/agent3-reviewer/logs/${CID//\//__}-watch.log"

mkdir -p "$(dirname "$LOG")"

CONFIG_SH="$RUN_STATE_DIR/$(cat "$DIR/AGENT_RUN_ID" 2>/dev/null || echo 'unknown')/config.sh"
if [ -f "$CONFIG_SH" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG_SH" || true
else
  echo "WARN: config.sh not found; falling back to env" | tee -a "$LOG"
fi

export PATH="${PROCESSMAP_ROOT:-$ROOT}/bin:/root/.local/bin:/root/.kimi/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

read_run_id() { tr -d '\r\n' < "$DIR/AGENT_RUN_ID" 2>/dev/null || true; }
read_review_version() { tr -d '\r\n' < "$DIR/REVIEW_RUN_ID" 2>/dev/null || true; }
read_worker_version() {
  local vfile="$RUN_STATE_DIR/$(read_run_id)/WORKER_REPORT_VERSION"
  cat "$vfile" 2>/dev/null || echo "0"
}

stop_requested() {
  local run_id="${1:-}"
  [ -n "$run_id" ] && [ -f "$RUN_STATE_DIR/$run_id/STOP" ]
}

supersede_stale_review_markers() {
  local run_id="${1:-}"
  local review_run
  review_run=$(read_review_version)
  [ -n "$review_run" ] && [ "$review_run" = "$run_id" ] && return 0

  local archive_dir="$DIR/review-stale-superseded-$run_id-$(date -u +%Y%m%dT%H%M%SZ)"
  local has_stale=0
  for marker in REVIEW_STARTED REVIEW_RUN_ID REVIEW_REPORT.md REVIEW_PASS CHANGES_REQUESTED REWORK_REQUEST.md REVIEW_BLOCKED.md; do
    [ -e "$DIR/$marker" ] && { has_stale=1; break; }
  done
  [ "$has_stale" = "0" ] && return 0

  mkdir -p "$archive_dir"
  for marker in REVIEW_STARTED REVIEW_RUN_ID REVIEW_REPORT.md REVIEW_PASS CHANGES_REQUESTED REWORK_REQUEST.md REVIEW_BLOCKED.md; do
    [ -e "$DIR/$marker" ] && mv "$DIR/$marker" "$archive_dir/$marker"
  done
  echo "Superseded stale review markers into $archive_dir" | tee -a "$LOG"
}

# RAG base context loader (targeted only — no base preflight repeat)
load_rag_context() {
  local run_id="${1:-}"
  local ctx="$RUN_STATE_DIR/$run_id/rag/RAG_BASE_CONTEXT.json"
  if [ -f "$ctx" ]; then
    echo "Loaded RAG_BASE_CONTEXT.json" | tee -a "$LOG"
    echo "$ctx"
  else
    echo "WARN: RAG_BASE_CONTEXT.json not found at $ctx" | tee -a "$LOG"
    echo ""
  fi
}

echo "=== Agent 3 / Reviewer watcher (3-agent pipeline) ===" | tee -a "$LOG"
echo "Started: $(date -Iseconds)" | tee -a "$LOG"
echo "Contour: $CID" | tee -a "$LOG"

last_worker_version="0"

while true; do
  RUN_ID="$(read_run_id)"
  [ -z "$RUN_ID" ] && { sleep 5; continue; }

  if stop_requested "$RUN_ID"; then
    echo "STOP requested. Exiting Agent 3 loop." | tee -a "$LOG"
    exit 0
  fi

  supersede_stale_review_markers "$RUN_ID"

  # Check for WORKER_DONE + WORKER_REPORT.md
  if [ -f "$DIR/WORKER_DONE" ] && [ -f "$DIR/WORKER_REPORT.md" ]; then
    current_worker_version="$(read_worker_version)"

    # If we already reviewed this version, skip
    if [ -f "$DIR/REVIEW_PASS" ] && [ "$last_worker_version" = "$current_worker_version" ]; then
      echo "Review PASS already recorded for version $current_worker_version. Exiting." | tee -a "$LOG"
      exit 0
    fi

    # If CHANGES_REQUESTED and no new version, wait
    if [ -f "$DIR/CHANGES_REQUESTED" ] && [ "$last_worker_version" = "$current_worker_version" ]; then
      echo "CHANGES_REQUESTED still active for version $current_worker_version. Waiting for rework..." | tee -a "$LOG"
      sleep 5
      continue
    fi

    # New version detected or first review
    if [ "$last_worker_version" != "$current_worker_version" ] || [ ! -f "$DIR/REVIEW_STARTED" ]; then
      last_worker_version="$current_worker_version"
      date -u +"%Y-%m-%dT%H:%M:%SZ" > "$DIR/REVIEW_STARTED"
      printf '%s\n' "$RUN_ID" > "$DIR/REVIEW_RUN_ID"

      local prompt_file="$ROOT/.agents/agent3-reviewer/prompts/${CID//\//__}-reviewer-v${current_worker_version}.md"
      mkdir -p "$(dirname "$prompt_file")"

      RAG_CTX_PATH="$(load_rag_context "$RUN_ID")"

      cat > "$prompt_file" <<PROMPT_EOF
You are Agent 3 / Reviewer for ProcessMap.

Working directory:
cd /opt/processmap-test

Contour id:
$CID

Run ID:
$RUN_ID

Worker Report Version:
$current_worker_version

RAG base context (reused from Agent 1):
${RAG_CTX_PATH:+$(cat "$RAG_CTX_PATH" 2>/dev/null || true)}

Targeted RAG (only if specific review topic requires it):
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "$CID" \
  --area "review context" \
  --format md \
  --query "<specific review topic>" \
  --top-k 5

Review inputs:
- .planning/contours/$CID/PLAN.md
- .planning/contours/$CID/REVIEWER_PROMPT.md
- .planning/contours/$CID/WORKER_REPORT.v${current_worker_version}.md (or WORKER_REPORT.md symlink)
- .planning/contours/$CID/RUNTIME_PROOF_CHECKLIST.md if present

Rules:
- Do not write product code.
- Do not merge/deploy/PR.
- If PASS: create REVIEW_REPORT.md and REVIEW_PASS.
- If FAIL: create REVIEW_REPORT.md, CHANGES_REQUESTED, and REWORK_REQUEST.md.
- If BLOCKED: create REVIEW_BLOCKED.md.
PROMPT_EOF

      echo "Starting review for version $current_worker_version" | tee -a "$LOG"

      # Auto-enrich prompt with UI/UX design system if applicable
      if [ -x "$ROOT/tools/pm-uiux-auto-enrich.sh" ]; then
        "$ROOT/tools/pm-uiux-auto-enrich.sh" enrich "$CID" "$prompt_file" || true
      fi
      if command -v kimi >/dev/null 2>&1; then
        kimi --yolo -p "Read and execute prompt file: $prompt_file" || true
      else
        echo "ERROR: kimi not available" | tee -a "$LOG"
      fi

      if [ -x "$ROOT/tools/pm-agent-mirror-report.sh" ]; then
        "$ROOT/tools/pm-agent-mirror-report.sh" "$CID" reviewer || true
      fi

      echo "Review cycle completed for version $current_worker_version" | tee -a "$LOG"
    fi
  fi

  sleep 5
done
