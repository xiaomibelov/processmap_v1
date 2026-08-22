#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
CID="${1:?Usage: pm-agent1-planner.sh <contour-id>}"

validate_cid() {
  local value="$1"
  if [[ ! "$value" =~ ^[A-Za-z0-9_./-]+$ ]]; then
    echo "ERROR: invalid contour id: $value" >&2
    exit 2
  fi
}

validate_cid "$CID"

DIR="$ROOT/.planning/contours/$CID"
PROMPT="$ROOT/.agents/agent1-planner/prompts/${CID//\//__}-planner-start.md"
RUN_ID="${PROCESSMAP_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4)}"
RAG_DIR="$ROOT/.agents/run-state/$RUN_ID/rag"
mkdir -p "$RAG_DIR"

mkdir -p "$DIR"
mkdir -p "$(dirname "$PROMPT")"

export PATH="$ROOT/bin:/root/.local/bin:/root/.kimi/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
export RUN_ID="$RUN_ID"
export PROCESSMAP_RUN_ID="$RUN_ID"
export PROCESSMAP_GSD_BIN="$ROOT/bin/gsd"
export PROCESSMAP_CODEX_GSD_TOOLS="$HOME/.codex/get-shit-done/bin/gsd-tools.cjs"
export PROCESSMAP_GSD_SKILLS_DIR="$HOME/.codex/skills"
export PROCESSMAP_GSD_AGENTS_DIR="$HOME/.codex/agents"
export PROCESSMAP_UI_UX_PRO_MAX_DIR="$HOME/.codex/skills/ui-ux-pro-max"

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

# Generate prompt
cat > "$PROMPT" <<PROMPT_EOF
Ты Agent 1 / Planner для ProcessMap.

Рабочая директория:
cd /opt/processmap-test

Contour id:
$CID

Роль:
Подготовить GSD-план и handoff для Agent 2 (единственный Worker) и Agent 3 (Reviewer).

GSD runner binding:
- GSD command: $PROCESSMAP_GSD_BIN
- Codex-local GSD tools: $PROCESSMAP_CODEX_GSD_TOOLS
- GSD skills directory: $PROCESSMAP_GSD_SKILLS_DIR
- GSD agents directory: $PROCESSMAP_GSD_AGENTS_DIR
UI/UX Design Intelligence (ui-ux-pro-max skill):
- Skill path: $PROCESSMAP_UI_UX_PRO_MAX_DIR
- Search script: python3 $PROCESSMAP_UI_UX_PRO_MAX_DIR/scripts/search.py
- Data: $PROCESSMAP_UI_UX_PRO_MAX_DIR/data/ (styles, colors, typography, UX guidelines)

Для UI/UX контуров ОБЯЗАТЕЛЬНО:
1. Перед планированием получить design system рекомендацию:
   python3 $PROCESSMAP_UI_UX_PRO_MAX_DIR/scripts/search.py "<product type>" --design-system -p "ProcessMap"
2. Включить рекомендации (style, colors, typography, effects) в WORKER_PROMPT.md §Design Tokens.
3. В REVIEWER_PROMPT.md добавить проверку соответствия выбранному design system.
4. В PLAN.md указать, какие UI/UX guidelines применяются (contrast, accessibility, animation).
5. Для стек-специфичных деталей использовать:
   python3 $PROCESSMAP_UI_UX_PRO_MAX_DIR/scripts/search.py "<query>" --stack react

Перед fallback обязательно проверить:
- command -v gsd
- gsd без аргументов для usage/status
- test -f "$PROCESSMAP_CODEX_GSD_TOOLS"
- find "$PROCESSMAP_GSD_SKILLS_DIR" -maxdepth 1 -type d -name "gsd-*" | head

Перед планированием обязательно выполнить RAG preflight, если доступен:
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "$CID" \
  --area "ProcessMap planning context" \
  --format md \
  --generate-base-context \
  --run-state-dir "$RAG_DIR" \
  --out "$RAG_DIR/RAG_PREFLIGHT.md"

RAG_BASE_CONTEXT.json будет создан в $RAG_DIR/RAG_BASE_CONTEXT.json и переиспользован Agent 2–3.

Obsidian mirror validation:
- Проверить что /srv/obsidian/project-atlas/ProcessMap/ существует и доступен.
- Если недоступен — записать warning в RAG_DIR/OBSIDIAN_UNAVAILABLE и продолжить.
- Если доступен — mirror-результат записать в RAG_DIR/OBSIDIAN_MIRROR_STATUS.

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

ВАЖНО: Используй атомарную запись для всех артефактов:
  cat > file.tmp << 'EOF'
  ...content...
  EOF
  mv file.tmp file
  touch file.ready

Obsidian mirror/export:
- После записи/обновления artifacts выполнить:
  ./tools/pm-agent-mirror-report.sh "$CID" planner
- Mirror path:
  /srv/obsidian/project-atlas/ProcessMap/AgentReports/$CID/

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
echo "=== Agent 1 / Planner (3-agent pipeline) ==="
echo "Contour: $CID"
echo "Prompt file: $PROMPT"
echo "GSD: $(command -v gsd || echo MISSING)"
echo

echo "Kimi будет запущен интерактивно."
echo "Внутри Kimi вставь короткую команду:"
echo
echo "Прочитай и выполни prompt file:"
echo "$PROMPT"
echo

kimi

# Post-processing: create .ready markers for expected artifacts
echo "Creating .ready markers for expected artifacts..."
for f in PLAN.md WORKER_PROMPT.md REVIEWER_PROMPT.md STATE.json READY_FOR_EXECUTION; do
  if [ -f "$DIR/$f" ] && [ ! -f "$DIR/$f.ready" ]; then
    touch "$DIR/$f.ready"
    echo "  $f → $f.ready"
  fi
done

# Obsidian path validation
if [ -d "/srv/obsidian/project-atlas/ProcessMap" ]; then
  echo "obsidian_available=true" > "$RAG_DIR/OBSIDIAN_MIRROR_STATUS"
else
  echo "obsidian_available=false" > "$RAG_DIR/OBSIDIAN_MIRROR_STATUS"
  echo "WARN: Obsidian mirror unavailable" >&2
fi

if [ -x "$ROOT/tools/pm-agent-mirror-report.sh" ]; then
  "$ROOT/tools/pm-agent-mirror-report.sh" "$CID" planner || true
fi
