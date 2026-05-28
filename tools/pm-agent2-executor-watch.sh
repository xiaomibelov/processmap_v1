#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
CID="${1:?Usage: pm-agent2-executor-watch.sh <contour-id>}"

validate_cid() {
  local value="$1"
  if [[ ! "$value" =~ ^[A-Za-z0-9_./-]+$ ]]; then
    echo "ERROR: invalid contour id: $value" >&2
    exit 2
  fi
}

validate_cid "$CID"

DIR="$ROOT/.planning/contours/$CID"
PROMPT="$ROOT/.agents/agent2-worker/prompts/${CID//\//__}-worker-start.md"
LOG="$ROOT/.agents/agent2-worker/logs/${CID//\//__}-watch.log"
RUN_STATE_DIR="$ROOT/.agents/run-state"
RAG_BASE_CTX=""

mkdir -p "$(dirname "$PROMPT")" "$(dirname "$LOG")"

export PATH="$ROOT/bin:/root/.local/bin:/root/.kimi/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

# Atomic write helper
atomic_write() {
  local target="$1"
  local tmp="${target}.tmp.$$"
  shift
  if [ $# -eq 0 ]; then
    cat > "$tmp"
  else
    printf '%s\n' "$*" > "$tmp"
  fi
  mv "$tmp" "$target"
  touch "${target}.ready"
}

# Versioned write helper
versioned_write() {
  local base="$1"
  local content="$2"
  local run_id
  run_id=$(tr -d '\r\n' < "$DIR/AGENT_RUN_ID" 2>/dev/null || echo "unknown")
  local version_file="$RUN_STATE_DIR/$run_id/WORKER_REPORT_VERSION"
  local version
  version=$(cat "$version_file" 2>/dev/null || echo "0")
  version=$((version + 1))
  echo "$version" > "$version_file"
  local target="${base}.v${version}.md"
  echo "$content" | atomic_write "$target"
  ln -sf "$(basename "$target")" "$base"
  echo "$version"
}

echo "=== Agent 2 / Worker watcher (3-agent pipeline) ===" | tee -a "$LOG"
echo "Started: $(date -Iseconds)" | tee -a "$LOG"
echo "Contour: $CID" | tee -a "$LOG"
echo "Waiting for READY_FOR_EXECUTION + WORKER_PROMPT.md..." | tee -a "$LOG"

while true; do
  PROMPT_FILE=""
  for candidate in "$DIR/WORKER_PROMPT.md" "$DIR/EXECUTOR_PROMPT.md"; do
    if [ -f "$candidate" ]; then
      PROMPT_FILE="$candidate"
      break
    fi
  done

  if [ -f "$DIR/READY_FOR_EXECUTION" ] \
     && [ -n "$PROMPT_FILE" ] \
     && [ ! -f "$DIR/WORKER_DONE" ] \
     && [ ! -f "$DIR/EXEC_BLOCKED.md" ]; then

    if [ -f "$DIR/WORKER_STARTED" ]; then
      echo "Worker already started; waiting..." | tee -a "$LOG"
      sleep 10
      continue
    fi

    date -u +"%Y-%m-%dT%H:%M:%SZ" > "$DIR/WORKER_STARTED"

    # Load RAG base context from run-state if available
    RUN_ID="${PROCESSMAP_RUN_ID:-$(tr -d '\r\n' < "$DIR/AGENT_RUN_ID" 2>/dev/null || echo "unknown")}"
    RAG_BASE_CTX="$RUN_STATE_DIR/$RUN_ID/rag/RAG_BASE_CONTEXT.json"
    if [ -f "$RAG_BASE_CTX" ]; then
      echo "Loaded RAG_BASE_CONTEXT.json from $RAG_BASE_CTX" | tee -a "$LOG"
    else
      echo "WARN: RAG_BASE_CONTEXT.json not found. Base context will be missing." | tee -a "$LOG"
      RAG_BASE_CTX=""
    fi

    cat > "$PROMPT" <<PROMPT_EOF
You are Agent 2 / Worker for ProcessMap.

Working directory:
cd /opt/processmap-test

Contour id:
$CID

Execute instructions from:
$PROMPT_FILE

RAG base context:
${RAG_BASE_CTX:+$(cat "$RAG_BASE_CTX" 2>/dev/null || true)}

Targeted RAG search (only if explicitly instructed by Agent 1):
node tools/rag/pm-rag-agent-preflight.mjs \
  --role worker \
  --contour "$CID" \
  --area "worker context" \
  --format md \
  --query "<specific topic from Agent 1 instructions>" \
  --top-k 5

ВАЖНО: Используй атомарную запись для всех артефактов:
  cat > file.tmp << 'EOF'
  ...content...
  EOF
  mv file.tmp file
  touch file.ready

Rules:
- Use GSD execution discipline.
- Do not merge/deploy/PR unless explicitly allowed.
- Do not print secrets.
- Stay within scope.
- If UI/runtime task — collect evidence for Agent 3.
- After completion create:
  .planning/contours/$CID/WORKER_REPORT.md
  .planning/contours/$CID/WORKER_DONE
- After writing execution artifacts run:
  ./tools/pm-agent-mirror-report.sh "$CID" worker
- Mirror path:
  /srv/obsidian/project-atlas/ProcessMap/AgentReports/$CID/

If blocked:
- create EXEC_BLOCKED.md with exact reason.
PROMPT_EOF

    clear || true
    echo "=== Agent 2 / Worker ==="
    echo "READY_FOR_EXECUTION detected"
    echo "Contour: $CID"
    echo "Start prompt: $PROMPT"
    echo
    echo "Kimi будет запущен интерактивно."
    echo "Внутри Kimi вставь короткую команду:"
    echo
    echo "Прочитай и выполни prompt file:"
    echo "$PROMPT"
    echo

    cd "$ROOT"

    # Auto-enrich prompt with UI/UX design system if applicable
    if [ -x "$ROOT/tools/pm-uiux-auto-enrich.sh" ]; then
      "$ROOT/tools/pm-uiux-auto-enrich.sh" enrich "$CID" "$PROMPT" || true
    fi
    kimi

    # Post-processing: atomic + versioned markers
    if [ -f "$DIR/WORKER_REPORT.md" ]; then
      local version
      version=$(versioned_write "$DIR/WORKER_REPORT" "$(cat "$DIR/WORKER_REPORT.md")")
      echo "WORKER_REPORT versioned to v$version" | tee -a "$LOG"
    fi
    if [ -f "$DIR/WORKER_DONE" ] && [ ! -f "$DIR/WORKER_DONE.ready" ]; then
      touch "$DIR/WORKER_DONE.ready"
    fi

    if [ -x "$ROOT/tools/pm-agent-mirror-report.sh" ]; then
      "$ROOT/tools/pm-agent-mirror-report.sh" "$CID" worker || true
    fi

    echo "Worker done: $(date -Iseconds)" | tee -a "$LOG"
    exit 0
  fi

  sleep 5
done
