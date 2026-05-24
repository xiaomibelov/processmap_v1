#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
CID="${1:-}"
LOCAL_MIRROR="${PROCESSMAP_LOCAL_MIRROR:-}"

# If local mirror is set, prefer it for file checks
resolve_path() {
  local rel="$1"
  if [ -n "$LOCAL_MIRROR" ] && [ -d "$LOCAL_MIRROR" ]; then
    local mirrored="$LOCAL_MIRROR/$rel"
    if [ -e "$mirrored" ]; then
      printf '%s' "$mirrored"
      return 0
    fi
  fi
  printf '%s' "$ROOT/$rel"
}

cd "$ROOT"

echo "=== PROCESSMAP TEST RUNTIME ==="
hostname
whoami
date
echo

echo "=== GIT ==="
git branch --show-current 2>/dev/null || true
git rev-parse --short HEAD 2>/dev/null || true
git status -sb 2>/dev/null || true
echo

echo "=== DOCKER ==="
docker compose -p processmap_test ps 2>/dev/null || true
echo

if [ -n "$CID" ]; then
  CONTOUR_DIR="$(resolve_path ".planning/contours/$CID")"

  echo "=== CONTOUR ==="
  echo "$CID"
  echo "$CONTOUR_DIR"
  echo

  if [ ! -d "$CONTOUR_DIR" ]; then
    echo "Contour dir missing"
    exit 0
  fi

  for f in \
    PLAN.md \
    PLAN.md.ready \
    WORKER_PROMPT.md \
    REVIEWER_PROMPT.md \
    RUNTIME_PROOF_CHECKLIST.md \
    STATE.json \
    DESIGN_SYSTEM.md \
    AGENT_RUN_ID \
    READY_FOR_EXECUTION \
    READY_FOR_EXECUTION.ready \
    WORKER_STARTED \
    WORKER_REPORT.md \
    WORKER_DONE \
    WORKER_DONE.ready \
    REVIEW_STARTED \
    REVIEW_RUN_ID \
    REVIEW_REPORT.md \
    REVIEW_PASS \
    CHANGES_REQUESTED \
    REWORK_REQUEST.md \
    REWORK_COMPLETED \
    EXEC_BLOCKED.md \
    REVIEW_BLOCKED.md \
    RAG_PREFLIGHT_PLANNER.md \
    RAG_PREFLIGHT_WORKER.md \
    RAG_PREFLIGHT_REVIEWER.md
  do
    local p="$CONTOUR_DIR/$f"
    if [ -e "$p" ]; then
      printf "✅ %s\n" "$f"
    else
      printf "·  %s\n" "$f"
    fi
  done

  echo
  echo "=== 3-AGENT WORKFLOW STATUS ==="
  if [ -f "$CONTOUR_DIR/READY_FOR_EXECUTION" ] || [ -f "$CONTOUR_DIR/READY_FOR_EXECUTION.ready" ]; then
    echo "Agent 1 (Planner): READY ✅"
  else
    echo "Agent 1 (Planner): pending ·"
  fi
  if [ -f "$CONTOUR_DIR/WORKER_DONE" ]; then
    echo "Agent 2 (Worker):  DONE ✅"
  elif [ -f "$CONTOUR_DIR/WORKER_STARTED" ]; then
    echo "Agent 2 (Worker):  started ⏳"
  else
    echo "Agent 2 (Worker):  pending ·"
  fi
  if [ -f "$CONTOUR_DIR/REVIEW_PASS" ]; then
    echo "Agent 3 (Reviewer): PASS ✅"
  elif [ -f "$CONTOUR_DIR/CHANGES_REQUESTED" ]; then
    echo "Agent 3 (Reviewer): CHANGES_REQUESTED ⚠️"
  elif [ -f "$CONTOUR_DIR/REVIEW_STARTED" ]; then
    echo "Agent 3 (Reviewer): started ⏳"
  else
    echo "Agent 3 (Reviewer): pending ·"
  fi

  echo
  echo "=== RECENT CONTOUR FILES ==="
  find "$CONTOUR_DIR" -maxdepth 1 -type f -printf "%TY-%Tm-%Td %TH:%TM %f\n" 2>/dev/null | sort | tail -30
else
  echo "=== ACTIVE CONTOUR MARKERS ==="
  find "$ROOT/.planning/contours" -maxdepth 4 -type f \
    \( -name READY_FOR_EXECUTION -o -name WORKER_DONE -o -name REVIEW_PASS -o -name CHANGES_REQUESTED -o -name EXEC_BLOCKED.md -o -name REVIEW_BLOCKED.md \) \
    -print 2>/dev/null | sort
fi

echo
echo "=== GSD ==="
export PATH="$ROOT/bin:$PATH"
echo "gsd: $(command -v gsd || echo MISSING)"
if [ -x "$ROOT/tools/pm-gsd-status.sh" ]; then
  "$ROOT/tools/pm-gsd-status.sh" | sed -n '1,35p' || true
else
  echo "pm-gsd-status.sh missing"
fi
