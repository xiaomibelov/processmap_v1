#!/usr/bin/env bash
set -euo pipefail

CID="${1:?Usage: docker-entrypoint.sh <contour-id>}"
LLM="${PROCESSMAP_AGENT_LLM:-kimi}"
RUN_ID="${PROCESSMAP_AGENT_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
RUN_STARTED_AT="${PROCESSMAP_AGENT_RUN_STARTED_AT:-$(date +%s)}"

export PROCESSMAP_AGENT_LOCAL=1
export PROCESSMAP_SERVER=localhost
export PROCESSMAP_ROOT=/opt/processmap-test
export PROCESSMAP_AGENT_LLM="$LLM"
export PROCESSMAP_AGENT_RUN_ID="$RUN_ID"
export PROCESSMAP_AGENT_RUN_STARTED_AT="$RUN_STARTED_AT"
export PROCESSMAP_AGENT1_TASK="${PROCESSMAP_AGENT1_TASK:-}"
export PROCESSMAP_AGENT_DRY_RUN="${PROCESSMAP_AGENT_DRY_RUN:-0}"
export PROCESSMAP_NO_TMUX=1
export TERM=xterm-256color
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/deploy/.local/bin:$PATH"

echo "================================"
echo "  ProcessMap Agents Container"
echo "================================"
echo "Contour: $CID"
echo "Run ID:  $RUN_ID"
echo "LLM:     $LLM"
echo "================================"
echo ""

# Validate contour id (same regex as processmap-iterm-agents.sh)
if [[ ! "$CID" =~ ^[A-Za-z0-9_./-]+$ ]]; then
  echo "ERROR: invalid contour id: $CID" >&2
  exit 2
fi

# Validate LLM
case "$LLM" in
  kimi|codex|claude) ;;
  *)
    echo "ERROR: invalid LLM: $LLM" >&2
    exit 2
    ;;
esac

# Pre-flight: ensure project root exists
if [ ! -d "$PROCESSMAP_ROOT" ]; then
  echo "ERROR: project root not found: $PROCESSMAP_ROOT" >&2
  exit 2
fi

# Pre-flight: ensure agent scripts exist
for agent_script in "$PROCESSMAP_ROOT/tools/pm-agent1-planner.sh" \
                    "$PROCESSMAP_ROOT/tools/pm-agent2-executor-watch.sh" \
                    "$PROCESSMAP_ROOT/tools/pm-agent3-reviewer-watch.sh" \
                    "$PROCESSMAP_ROOT/tools/pm-agent-status.sh"; do
  if [ ! -x "$agent_script" ]; then
    echo "ERROR: agent script not executable: $agent_script" >&2
    exit 2
  fi
done

cleanup() {
  echo ""
  echo "Container shutting down. Stopping agents..."
  pkill -f "processmap-agent-pane.sh" || true
  sleep 1
}
trap cleanup SIGTERM SIGINT

# Start all 4 agents in background
echo "Starting Agent 0 / Analytics..."
/usr/local/bin/processmap-agent-pane.sh 0 "$CID" &
A0_PID=$!

echo "Starting Agent 1 / Planner..."
/usr/local/bin/processmap-agent-pane.sh 1 "$CID" &
A1_PID=$!

echo "Starting Agent 2 / Worker..."
/usr/local/bin/processmap-agent-pane.sh 2 "$CID" &
A2_PID=$!

echo "Starting Agent 3 / Reviewer..."
/usr/local/bin/processmap-agent-pane.sh 3 "$CID" &
A3_PID=$!

echo ""
echo "All agents started. Waiting for completion..."
echo "PIDs: A0=$A0_PID A1=$A1_PID A2=$A2_PID A3=$A3_PID"
echo ""

# Wait for all agents. When any agent exits, the container stops.
# Agent 0 runs forever (analytics reconnect loop).
# Agents 1-3 exit when their work is done.
wait

echo "All agents have exited."
