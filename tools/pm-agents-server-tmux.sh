#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
CID="${1:-tooling/project-atlas-server-docs-import-and-triage-v1}"
SESSION="processmap-agents"

cd "$ROOT"

echo "=== ProcessMap server tmux launcher (3-agent pipeline) ==="
echo "Root:    $ROOT"
echo "Contour: $CID"
echo "Session: $SESSION"
echo

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run as root."
  exit 2
fi

for f in \
  "$ROOT/tools/pm-agent1-planner.sh" \
  "$ROOT/tools/pm-agent2-executor-watch.sh" \
  "$ROOT/tools/pm-agent3-reviewer-watch.sh" \
  "$ROOT/tools/pm-agent-status.sh"
do
  if [ ! -x "$f" ]; then
    echo "ERROR: missing executable: $f"
    exit 2
  fi
done

if [ -x "$ROOT/tools/pm-agent-reset-stale.sh" ]; then
  "$ROOT/tools/pm-agent-reset-stale.sh" "$CID" || true
fi

# If already inside tmux, create missing windows in current session and switch to analytics.
if [ -n "${TMUX:-}" ]; then
  echo "Already inside tmux; creating windows in current session."

  tmux new-window -n "A0-analytics" -c "$ROOT" "watch -n 60 '$ROOT/tools/pm-agent-status.sh' '$CID'" || true
  tmux new-window -n "A1-planner" -c "$ROOT" "$ROOT/tools/pm-agent1-planner.sh '$CID'" || true
  tmux new-window -n "A2-worker" -c "$ROOT" "$ROOT/tools/pm-agent2-executor-watch.sh '$CID'" || true
  tmux new-window -n "A3-reviewer" -c "$ROOT" "$ROOT/tools/pm-agent3-reviewer-watch.sh '$CID'" || true

  tmux select-window -t "A0-analytics" || true
  exit 0
fi

# If session exists, attach. Do not recreate duplicates.
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Attaching existing session: $SESSION"
  exec tmux attach-session -t "$SESSION"
fi

echo "Creating new session: $SESSION"

tmux new-session -d -s "$SESSION" -n "A0-analytics" -c "$ROOT" \
  "watch -n 60 '$ROOT/tools/pm-agent-status.sh' '$CID'"

tmux new-window -t "$SESSION:" -n "A1-planner" -c "$ROOT" \
  "$ROOT/tools/pm-agent1-planner.sh '$CID'"

tmux new-window -t "$SESSION:" -n "A2-worker" -c "$ROOT" \
  "$ROOT/tools/pm-agent2-executor-watch.sh '$CID'"

tmux new-window -t "$SESSION:" -n "A3-reviewer" -c "$ROOT" \
  "$ROOT/tools/pm-agent3-reviewer-watch.sh '$CID'"

# Select by window name inside session. This must not fail the launcher.
tmux select-window -t "$SESSION:A0-analytics" || true

echo "Session created:"
tmux list-windows -t "$SESSION"

exec tmux attach-session -t "$SESSION"
