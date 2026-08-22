#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
CID="${1:?Usage: pm-agent-reset-stale.sh <contour-id>}"
DIR="$ROOT/.planning/contours/$CID"

cd "$ROOT"

if [ ! -d "$DIR" ]; then
  echo "BLOCKED: contour dir missing: $DIR"
  exit 2
fi

echo "=== Reset stale markers ==="
echo "Contour: $CID"
echo "Dir: $DIR"
echo

echo "=== Before ==="
"$ROOT/tools/pm-agent-status.sh" "$CID" || true

echo
echo "=== Kimi processes ==="
ps aux | grep "[k]imi" || true

read_marker() {
  local file="$1"
  tr -d '\r\n' < "$file" 2>/dev/null || true
}

supersede_stale_review_markers() {
  local run_id
  local review_run
  local has_stale=0
  local marker
  local archive_dir

  run_id="$(read_marker "$DIR/AGENT_RUN_ID")"
  [ -n "$run_id" ] || return 0

  review_run="$(read_marker "$DIR/REVIEW_RUN_ID")"
  if [ -n "$review_run" ] && [ "$review_run" = "$run_id" ]; then
    return 0
  fi

  for marker in REVIEW_STARTED REVIEW_RUN_ID REVIEW_REPORT.md REVIEW_PASS CHANGES_REQUESTED REWORK_REQUEST.md REVIEW_BLOCKED.md; do
    if [ -e "$DIR/$marker" ]; then
      has_stale=1
      break
    fi
  done

  [ "$has_stale" = "1" ] || return 0

  archive_dir="$DIR/review-stale-superseded-$run_id-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$archive_dir"
  for marker in REVIEW_STARTED REVIEW_RUN_ID REVIEW_REPORT.md REVIEW_PASS CHANGES_REQUESTED REWORK_REQUEST.md REVIEW_BLOCKED.md; do
    if [ -e "$DIR/$marker" ]; then
      mv "$DIR/$marker" "$archive_dir/$marker"
    fi
  done

  cat > "$DIR/STALE_REVIEW_MARKERS_SUPERSEDED.md" <<EOF
# Stale Review Markers Superseded

Run ID: $run_id
Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Reason: pm-agent-reset-stale current-run preflight
Archived to: $archive_dir
Previous REVIEW_RUN_ID: ${review_run:-<missing>}
EOF
  echo "Superseded stale review markers into $archive_dir"
}

supersede_stale_review_markers

# Safe rule:
# Remove WORKER_STARTED only if worker has no outputs.
if [ -f "$DIR/WORKER_STARTED" ] \
   && [ ! -f "$DIR/WORKER_DONE" ] \
   && [ ! -f "$DIR/WORKER_REPORT.md" ]; then
  echo "Removing stale WORKER_STARTED"
  rm -f "$DIR/WORKER_STARTED"
else
  echo "WORKER_STARTED not stale or no removal needed"
fi

# Safe rule:
# Remove REVIEW_STARTED only if review has no outputs.
if [ -f "$DIR/REVIEW_STARTED" ] \
   && [ ! -f "$DIR/REVIEW_REPORT.md" ] \
   && [ ! -f "$DIR/REVIEW_PASS" ] \
   && [ ! -f "$DIR/CHANGES_REQUESTED" ] \
   && [ ! -f "$DIR/REVIEW_BLOCKED.md" ]; then
  echo "Removing stale REVIEW_STARTED"
  rm -f "$DIR/REVIEW_STARTED"
else
  echo "REVIEW_STARTED not stale or no removal needed"
fi

echo
echo "=== After ==="
"$ROOT/tools/pm-agent-status.sh" "$CID" || true
