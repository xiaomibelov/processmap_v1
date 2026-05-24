#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
TOOLS="$ROOT/tools"

mkdir -p "$TOOLS"
mkdir -p "$ROOT/.agents/agent1-planner/prompts" "$ROOT/.agents/agent1-planner/logs"
mkdir -p "$ROOT/.agents/agent2-worker/prompts" "$ROOT/.agents/agent2-worker/logs"
mkdir -p "$ROOT/.agents/agent3-reviewer/prompts" "$ROOT/.agents/agent3-reviewer/logs"
mkdir -p "$ROOT/.planning/contours"
mkdir -p "$ROOT/.planning/agent-logs"

backup_if_exists() {
  local f="$1"
  if [ -f "$f" ]; then
    cp "$f" "$f.bak.$(date +%Y%m%d_%H%M%S)"
  fi
}

backup_if_exists "$TOOLS/pm-agent-status.sh"
cat > "$TOOLS/pm-agent-status.sh" <<'STATUS_EOF'
#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
CID="${1:-}"

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
  DIR="$ROOT/.planning/contours/$CID"

  echo "=== CONTOUR ==="
  echo "$CID"
  echo "$DIR"
  echo

  if [ ! -d "$DIR" ]; then
    echo "Contour dir missing"
    exit 0
  fi

  for f in \
    PLAN.md \
    WORKER_PROMPT.md \
    REVIEWER_PROMPT.md \
    RUNTIME_PROOF_CHECKLIST.md \
    STATE.json \
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
    if [ -e "$DIR/$f" ]; then
      printf "✅ %s\n" "$f"
    else
      printf "·  %s\n" "$f"
    fi
  done

  echo
  echo "=== 3-AGENT WORKFLOW STATUS ==="
  if [ -f "$DIR/READY_FOR_EXECUTION" ] || [ -f "$DIR/READY_FOR_EXECUTION.ready" ]; then
    echo "Agent 1 (Planner): READY ✅"
  else
    echo "Agent 1 (Planner): pending ·"
  fi
  if [ -f "$DIR/WORKER_DONE" ]; then
    echo "Agent 2 (Worker):  DONE ✅"
  elif [ -f "$DIR/WORKER_STARTED" ]; then
    echo "Agent 2 (Worker):  started ⏳"
  else
    echo "Agent 2 (Worker):  pending ·"
  fi
  if [ -f "$DIR/REVIEW_PASS" ]; then
    echo "Agent 3 (Reviewer): PASS ✅"
  elif [ -f "$DIR/CHANGES_REQUESTED" ]; then
    echo "Agent 3 (Reviewer): CHANGES_REQUESTED ⚠️"
  elif [ -f "$DIR/REVIEW_STARTED" ]; then
    echo "Agent 3 (Reviewer): started ⏳"
  else
    echo "Agent 3 (Reviewer): pending ·"
  fi

  echo
  echo "=== RECENT CONTOUR FILES ==="
  find "$DIR" -maxdepth 1 -type f -printf "%TY-%Tm-%Td %TH:%TM %f\n" 2>/dev/null | sort | tail -30
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
STATUS_EOF

backup_if_exists "$TOOLS/pm-agent1-planner.sh"
cat > "$TOOLS/pm-agent1-planner.sh" <<'PLANNER_EOF'
#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
CID="${1:?Usage: pm-agent1-planner.sh <contour-id>}"

DIR="$ROOT/.planning/contours/$CID"
PROMPT="$ROOT/.agents/agent1-planner/prompts/${CID//\//__}-planner-start.md"

mkdir -p "$DIR"
mkdir -p "$(dirname "$PROMPT")"

cat > "$PROMPT" <<PROMPT_EOF
Ты Agent 1 / Planner для ProcessMap.

Рабочая директория:
cd /opt/processmap-test

Contour id:
$CID

Роль:
Подготовить GSD-план и handoff для Agent 2 (Worker) и Agent 3 (Reviewer).

Обязательная модель:
1. GSD всегда:
   source/runtime truth → source map → bounded plan → executor handoff.
2. Использовать Project Atlas как knowledge source:
   /srv/obsidian/project-atlas/ProcessMap
3. Если RAG server ещё не поднят — использовать filesystem search по Project Atlas.
4. Не писать product code как Planner.
5. Не делать merge/deploy/PR.
6. Не печатать secrets.
7. Создать contour artifacts.

Создать в:
.planning/contours/$CID/

Минимум:
- PLAN.md
- WORKER_PROMPT.md
- REVIEWER_PROMPT.md
- STATE.json
- READY_FOR_EXECUTION

Если UI/runtime задача:
- RUNTIME_NAVIGATION.md
- RUNTIME_PROOF_CHECKLIST.md

STATE.json:
{
  "contour_id": "$CID",
  "phase": "ready_for_execution",
  "planner_status": "complete",
  "worker_status": "pending",
  "reviewer_status": "pending"
}

Финальный ответ:
1. Verdict
2. GSD status
3. Source/runtime truth
4. Files created
5. READY_FOR_EXECUTION status
6. Exact marker Agent 2 waits for
PROMPT_EOF

cd "$ROOT"

clear || true
echo "=== Agent 1 / Planner ==="
echo "Contour: $CID"
echo "Prompt file: $PROMPT"
echo
echo "Kimi будет запущен интерактивно."
echo "Внутри Kimi вставь короткую команду:"
echo
echo "Прочитай и выполни prompt file:"
echo "$PROMPT"
echo

kimi
PLANNER_EOF

backup_if_exists "$TOOLS/pm-agent2-executor-watch.sh"
cat > "$TOOLS/pm-agent2-executor-watch.sh" <<'WORKER_EOF'
#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
CID="${1:?Usage: pm-agent2-executor-watch.sh <contour-id>}"

DIR="$ROOT/.planning/contours/$CID"
PROMPT="$ROOT/.agents/agent2-worker/prompts/${CID//\//__}-worker-start.md"
LOG="$ROOT/.agents/agent2-worker/logs/${CID//\//__}-watch.log"

mkdir -p "$(dirname "$PROMPT")" "$(dirname "$LOG")"

echo "=== Agent 2 / Worker watcher ===" | tee -a "$LOG"
echo "Started: $(date -Iseconds)" | tee -a "$LOG"
echo "Contour: $CID" | tee -a "$LOG"
echo "Waiting for READY_FOR_EXECUTION..." | tee -a "$LOG"

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

    cat > "$PROMPT" <<PROMPT_EOF
Ты Agent 2 / Worker для ProcessMap.

Рабочая директория:
cd /opt/processmap-test

Contour id:
$CID

Выполни инструкции из:
$PROMPT_FILE

Правила:
- Использовать GSD execution discipline.
- Не делать merge/deploy/PR, если это явно не разрешено.
- Не печатать secrets.
- Не выходить за scope.
- Если задача UI/runtime — собрать evidence для Agent 3.
- После выполнения создать:
  .planning/contours/$CID/WORKER_REPORT.md
  .planning/contours/$CID/WORKER_DONE

Если заблокировано:
- создать EXEC_BLOCKED.md с точной причиной.
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
    kimi

    echo "Kimi exited: $(date -Iseconds)" | tee -a "$LOG"
    exit 0
  fi

  sleep 5
done
WORKER_EOF

backup_if_exists "$TOOLS/pm-agent3-reviewer-watch.sh"
cat > "$TOOLS/pm-agent3-reviewer-watch.sh" <<'REVIEWER_EOF'
#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
CID="${1:?Usage: pm-agent3-reviewer-watch.sh <contour-id>}"

DIR="$ROOT/.planning/contours/$CID"
PROMPT="$ROOT/.agents/agent3-reviewer/prompts/${CID//\//__}-reviewer-start.md"
LOG="$ROOT/.agents/agent3-reviewer/logs/${CID//\//__}-watch.log"

mkdir -p "$(dirname "$PROMPT")" "$(dirname "$LOG")"

echo "=== Agent 3 / Reviewer watcher ===" | tee -a "$LOG"
echo "Started: $(date -Iseconds)" | tee -a "$LOG"
echo "Contour: $CID" | tee -a "$LOG"
echo "Waiting for WORKER_DONE + WORKER_REPORT.md..." | tee -a "$LOG"

while true; do
  if [ -f "$DIR/WORKER_DONE" ] \
     && [ -f "$DIR/WORKER_REPORT.md" ] \
     && [ ! -f "$DIR/REVIEW_PASS" ] \
     && [ ! -f "$DIR/CHANGES_REQUESTED" ] \
     && [ ! -f "$DIR/REVIEW_BLOCKED.md" ]; then

    if [ -f "$DIR/REVIEW_STARTED" ]; then
      echo "Review already started; waiting..." | tee -a "$LOG"
      sleep 10
      continue
    fi

    date -u +"%Y-%m-%dT%H:%M:%SZ" > "$DIR/REVIEW_STARTED"

    cat > "$PROMPT" <<PROMPT_EOF
Ты Agent 3 / Reviewer для ProcessMap.

Рабочая директория:
cd /opt/processmap-test

Contour id:
$CID

Выполни review по:
.planning/contours/$CID/REVIEWER_PROMPT.md

Также прочитай:
.planning/contours/$CID/PLAN.md
.planning/contours/$CID/WORKER_REPORT.md

Если есть:
.planning/contours/$CID/RUNTIME_PROOF_CHECKLIST.md

Правила:
- Не писать product code.
- Не делать merge/deploy/PR.
- Проверить фактический результат, а не только отчёт.
- Для UI/runtime задач обязательно Playwright/browser review.
- Если PASS:
  создать REVIEW_REPORT.md и REVIEW_PASS.
- Если FAIL:
  создать REVIEW_REPORT.md, CHANGES_REQUESTED и REWORK_REQUEST.md.
- Если BLOCKED:
  создать REVIEW_BLOCKED.md.
PROMPT_EOF

    clear || true
    echo "=== Agent 3 / Reviewer ==="
    echo "WORKER_DONE detected"
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
    kimi

    echo "Kimi exited: $(date -Iseconds)" | tee -a "$LOG"
    exit 0
  fi

  sleep 5
done
REVIEWER_EOF

chmod +x \
  "$TOOLS/pm-agent-status.sh" \
  "$TOOLS/pm-agent1-planner.sh" \
  "$TOOLS/pm-agent2-executor-watch.sh" \
  "$TOOLS/pm-agent3-reviewer-watch.sh" \
  "$TOOLS/pm-uiux-auto-enrich.sh"

cat > "$ROOT/.planning/agent-logs/AGENT_SCRIPTS_INSTALLED.md" <<INSTALL_EOF
# Agent scripts installed

Created: $(date -Iseconds)
Host: $(hostname)

Scripts:
- tools/pm-agent1-planner.sh
- tools/pm-agent2-executor-watch.sh
- tools/pm-agent3-reviewer-watch.sh
- tools/pm-uiux-auto-enrich.sh
- tools/pm-agent-status.sh

Model (3-agent pipeline):
- Agent 1 runs Planner interactively. Produces PLAN.md, WORKER_PROMPT.md, REVIEWER_PROMPT.md, READY_FOR_EXECUTION.
- Agent 2 waits for READY_FOR_EXECUTION + WORKER_PROMPT.md, then launches Kimi (Worker). Produces WORKER_REPORT.md + WORKER_DONE.
- Agent 3 waits for WORKER_DONE + WORKER_REPORT.md, then launches Kimi (Reviewer). Produces REVIEW_PASS or CHANGES_REQUESTED.
INSTALL_EOF

echo "AGENT_SERVER_SCRIPTS_READY"
echo
ls -la "$TOOLS"/pm-agent*.sh
