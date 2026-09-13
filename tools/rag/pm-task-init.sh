#!/usr/bin/env bash
# pm-task-init.sh — RAG-инициализация задачи (обёртка над tools/rag RAG-CLI).
# Интерфейс совместим с pm-rag-agent-preflight.mjs (--role/--contour), но, т.к. у preflight
# зашит DEFAULT_INDEX без опции --index, health-check и дайджест выполняются через
# pm-rag-search.mjs по рабочему индексу rag-index/RAG_SEARCH_INDEX.json.
# Shell-first, ноль токенов LLM: свежесть индекса + health-check + компактный дайджест.
#
# Usage: pm-task-init.sh --role <planner|executor|reviewer> --contour <type/name> --task "<описание>"
#
# Exit codes: 0 — успех; 1 — невалидные аргументы; 2 — сбой индексации/health-check.
set -euo pipefail

fail() { echo "pm-task-init: FAIL: $1" >&2; exit "${2:-2}"; }

ROLE=""; CONTOUR=""; TASK=""
while [ $# -gt 0 ]; do
  case "$1" in
    --role) ROLE="${2:?--role needs value}"; shift 2 ;;
    --contour) CONTOUR="${2:?--contour needs value}"; shift 2 ;;
    --task) TASK="${2:?--task needs value}"; shift 2 ;;
    *) fail "unknown arg: $1 (usage: --role <planner|executor|reviewer> --contour <type/name> --task \"<описание>\")" 1 ;;
  esac
done
case "$ROLE" in planner|executor|reviewer) ;; *) fail "--role must be planner, executor or reviewer (got: '${ROLE}')" 1 ;; esac
[ -n "$CONTOUR" ] || fail "--contour is required" 1
[ -n "$TASK" ] || fail "--task is required" 1

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WS="${PM_RAG_WS:-/Users/mac/agents_place/kimi_PM}"
INDEX_DIR="${PM_RAG_INDEX_DIR:-$WS/rag-index}"
INDEX="$INDEX_DIR/RAG_SEARCH_INDEX.json"
SOURCES="$INDEX_DIR/processmap-rag-sources.local.json"
REINDEX_SH="$INDEX_DIR/reindex.sh"

# --- Runner: host node, fallback docker -------------------------------------
if command -v node >/dev/null 2>&1; then
  run_node() { (cd "$REPO_ROOT" && node "$@"); }
else
  command -v docker >/dev/null 2>&1 || fail "node и docker недоступны — нечем выполнять RAG-команды"
  run_node() {
    docker run --rm -m 8g -e NODE_OPTIONS=--max-old-space-size=7168 \
      -v "$REPO_ROOT:/ws" -v "$INDEX_DIR:/rag-index" -w /ws \
      node:20-alpine node "$@"
  }
fi

# --- 1. Проверка/восстановление индекса --------------------------------------
INDEX_STATUS="fresh"
REINDEXED_FILES=0

index_valid() {
  [ -f "$INDEX" ] || return 1
  python3 - "$INDEX" <<'PY' >/dev/null 2>&1
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    d = json.load(f)
assert isinstance(d.get("chunks"), list) and len(d["chunks"]) > 0
PY
}

if ! index_valid; then
  INDEX_STATUS="rebuilt (index missing or corrupt)"
  [ -x "$REINDEX_SH" ] || fail "индекс битый/отсутствует и нет $REINDEX_SH"
  bash "$REINDEX_SH" >/dev/null 2>&1 || fail "полный rebuild через reindex.sh завершился с ошибкой"
  index_valid || fail "индекс не валиден даже после rebuild"
else
  # Инкрементальная проверка по mtime: ищем source-файлы новее индекса.
  if [ -f "$SOURCES" ]; then
    REINDEXED_FILES=$(python3 - "$SOURCES" "$INDEX" "$WS" <<'PY'
import json, os, sys
registry, index_path, ws = sys.argv[1], sys.argv[2], sys.argv[3]
with open(registry, encoding="utf-8") as f:
    sources = json.load(f)["sources"]
idx_mtime = os.stat(index_path).st_mtime
skip_dirs = {"node_modules", ".git", "__pycache__", "dist", ".venv"}
changed = 0
for s in sources:
    root = s["path"].replace("/ws", ws, 1)
    if os.path.isfile(root):
        candidates = [root]
    elif os.path.isdir(root):
        candidates = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in skip_dirs]
            for name in filenames:
                candidates.append(os.path.join(dirpath, name))
    else:
        continue
    for p in candidates:
        try:
            if os.stat(p).st_mtime > idx_mtime:
                changed += 1
        except OSError:
            continue
print(changed)
PY
)
    if [ "$REINDEXED_FILES" -gt 0 ]; then
      INDEX_STATUS="reindexed: $REINDEXED_FILES changed file(s)"
      bash "$REINDEX_SH" >/dev/null 2>&1 || fail "reindex.sh завершился с ошибкой"
      index_valid || fail "индекс не валиден после переиндексации"
    fi
  fi
fi

# --- 2. Health-check индекса --------------------------------------------------
# pm-rag-agent-preflight.mjs не принимает --index (DEFAULT_INDEX зашит в него),
# поэтому health-check выполняем через pm-rag-search.mjs по рабочему индексу:
# пробный запрос должен завершиться с exit 0 и валидным JSON.
PROBE=$(run_node tools/rag/pm-rag-search.mjs "ProcessMap runtime validation" \
  --index "$INDEX" --top-k 1 --json 2>/dev/null) \
  || fail "health-check: pm-rag-search не смог загрузить индекс"
echo "$PROBE" | python3 -c 'import json,sys; json.load(sys.stdin)' >/dev/null 2>&1 \
  || fail "health-check: индекс загрузился, но вывод невалиден"

CHUNKS=$(python3 - "$INDEX" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    print(len(json.load(f).get("chunks", [])))
PY
)

# --- 3. Дайджест: топ-10 чанков (score | path | title, без текста) ------------
DIGEST=$(run_node tools/rag/pm-rag-search.mjs "$TASK" --index "$INDEX" --top-k 10 --json 2>/dev/null \
  | python3 -c '
import json, sys
try:
    rows = json.load(sys.stdin)
except Exception:
    sys.exit(0)
seen, out = set(), []
for r in rows:
    p = r.get("path", "")
    if p.startswith("/ws/"):
        p = p[len("/ws/"):]
    if p in seen:
        continue
    seen.add(p)
    title = (r.get("title") or "").replace("|", "/").strip()[:80]
    score = float(r.get("score", 0))
    out.append("%.3f | %s | %s" % (score, p, title))
    if len(out) >= 10:
        break
print("\n".join(out))
')

# --- Вывод: строго ≤ 40 строк -------------------------------------------------
echo "pm-task-init: OK"
echo "index: $INDEX_STATUS (chunks: $CHUNKS)"
echo "role: $ROLE | contour: $CONTOUR"
echo "task: $TASK"
echo "top chunks (score | path | title):"
if [ -n "$DIGEST" ]; then
  echo "$DIGEST"
else
  echo "(no relevant chunks — proceed from first principles)"
fi
