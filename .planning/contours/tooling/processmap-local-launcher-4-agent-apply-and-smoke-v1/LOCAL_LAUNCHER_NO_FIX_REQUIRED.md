# LOCAL_LAUNCHER_NO_FIX_REQUIRED — Локальные файлы отсутствуют

## Статус
Локальные Mac-файлы **не найдены** на текущем runtime (Linux-сервер `clearvestnic.ru`).
Правки невозможно применить автоматически — требуется ручная установка на Mac.

## Доказательство отсутствия

```
pwd:      /opt/processmap-test
whoami:   root
hostname: clearvestnic.ru
uname:    Linux clearvestnic.ru 6.8.0-111-generic
HOME:     /root
```

Проверка файлов:
```
~/Desktop/ProcessMap Agents.command          — MISSING
~/bin/processmap-iterm-agents.sh             — MISSING
~/bin/processmap-iterm-agents-3windows.sh    — MISSING
~/bin/processmap-agent-pane.sh               — MISSING
```

## Чек-лист: что ДОЛЖНО быть создано на локальном Mac

### 1. `~/bin/processmap-agent-pane.sh` (Pane Helper)

**Цель:** Запускать серверные скрипты агентов через SSH в нужной iTerm-панели.

**Обязательное содержимое:**
```bash
#!/usr/bin/env bash
set -euo pipefail

AGENT="${1:?Usage: processmap-agent-pane.sh <agent-number> <contour-id>}"
CID="${2:?Usage: processmap-agent-pane.sh <agent-number> <contour-id>}"

ROOT="/opt/processmap-test"

validate_cid() {
  local value="$1"
  if [[ ! "$value" =~ ^[A-Za-z0-9_./-]+$ ]]; then
    echo "ERROR: invalid contour id: $value" >&2
    echo "Allowed characters: A-Z a-z 0-9 _ - / ." >&2
    exit 2
  fi
}

validate_cid "$CID"

case "$AGENT" in
  1) CMD="$ROOT/tools/pm-agent1-planner.sh \"$CID\"" ;;
  2) CMD="$ROOT/tools/pm-agent2-executor-watch.sh \"$CID\"" ;;
  3) CMD="$ROOT/tools/pm-agent3-reviewer-watch.sh \"$CID\"" ;;
  4) CMD="$ROOT/tools/pm-agent4-reviewer-watch.sh \"$CID\"" ;;
  *) echo "ERROR: unknown agent number: $AGENT" >&2; exit 1 ;;
esac

if [ "${PROCESSMAP_AGENTS_DRY_RUN:-0}" = "1" ]; then
  echo "[Dry-run] A${AGENT}: $CMD"
  exit 0
fi

# Здесь SSH-сессия или локальное выполнение на сервере
cd "$ROOT"
# Для удалённого сервера:
# ssh processmap@clearvestnic.ru "cd $ROOT && $CMD"
# Для локального dev-окружения:
eval "$CMD"
```

**Проверки:**
- [ ] `bash -n ~/bin/processmap-agent-pane.sh` — успешно
- [ ] `PROCESSMAP_AGENTS_DRY_RUN=1 ~/bin/processmap-agent-pane.sh 1 tooling/test-cid-v1` — выводит команду с CID
- [ ] `PROCESSMAP_AGENTS_DRY_RUN=1 ~/bin/processmap-agent-pane.sh 4 tooling/test-cid-v1` — выводит команду с CID
- [ ] `PROCESSMAP_AGENTS_DRY_RUN=1 ~/bin/processmap-agent-pane.sh 1 "bad cid"` — exit code 2
- [ ] CID передаётся одинаково для агентов 1, 2, 3, 4

---

### 2. `~/bin/processmap-iterm-agents.sh` (Split Mode — 2×2 grid)

**Цель:** Создать 4 панели iTerm и запустить в каждой своего агента.

**Обязательное содержимое:**
```bash
#!/usr/bin/env bash
set -euo pipefail

CID="${1:?Usage: processmap-iterm-agents.sh <contour-id>}"

validate_cid() {
  local value="$1"
  if [[ ! "$value" =~ ^[A-Za-z0-9_./-]+$ ]]; then
    echo "ERROR: invalid contour id: $value" >&2
    echo "Allowed characters: A-Z a-z 0-9 _ - / ." >&2
    exit 2
  fi
}

validate_cid "$CID"

if [ "${PROCESSMAP_AGENTS_DRY_RUN:-0}" = "1" ]; then
  echo "[Dry-run] A1: processmap-agent-pane.sh 1 $CID"
  echo "[Dry-run] A2: processmap-agent-pane.sh 2 $CID"
  echo "[Dry-run] A3: processmap-agent-pane.sh 3 $CID"
  echo "[Dry-run] A4: processmap-agent-pane.sh 4 $CID"
  exit 0
fi

osascript <<EOF
 tell application "iTerm2"
   tell current window
     set newTab to (create tab with default profile)
     tell newTab
       tell current session
         set name to "A1-planner"
         write text "processmap-agent-pane.sh 1 \"$CID\""
         split horizontally with default profile
         tell last session
           set name to "A2-executor"
           write text "processmap-agent-pane.sh 2 \"$CID\""
         end tell
         split vertically with default profile
         tell last session
           set name to "A3-reviewer"
           write text "processmap-agent-pane.sh 3 \"$CID\""
         end tell
         tell first session
           split vertically with default profile
           tell last session
             set name to "A4-reviewer"
             write text "processmap-agent-pane.sh 4 \"$CID\""
           end tell
         end tell
       end tell
     end tell
   end tell
 end tell
EOF
```

**Проверки:**
- [ ] `bash -n ~/bin/processmap-iterm-agents.sh` — успешно
- [ ] `PROCESSMAP_AGENTS_DRY_RUN=1 ~/bin/processmap-iterm-agents.sh tooling/test-cid-v1` — 4 строки, каждая с CID
- [ ] `PROCESSMAP_AGENTS_DRY_RUN=1 ~/bin/processmap-iterm-agents.sh "bad cid"` — exit code 2
- [ ] В dry-run режиме iTerm НЕ открывается

---

### 3. `~/bin/processmap-iterm-agents-3windows.sh` (Fallback Mode)

**Цель:** 4 отдельных окна iTerm (или 3 окна + 1 сплит) для случаев, когда grid неудобен.

**Обязательное содержимое:**
```bash
#!/usr/bin/env bash
set -euo pipefail

CID="${1:?Usage: processmap-iterm-agents-3windows.sh <contour-id>}"

validate_cid() {
  local value="$1"
  if [[ ! "$value" =~ ^[A-Za-z0-9_./-]+$ ]]; then
    echo "ERROR: invalid contour id: $value" >&2
    echo "Allowed characters: A-Z a-z 0-9 _ - / ." >&2
    exit 2
  fi
}

validate_cid "$CID"

if [ "${PROCESSMAP_AGENTS_DRY_RUN:-0}" = "1" ]; then
  echo "[Dry-run] A1: processmap-agent-pane.sh 1 $CID"
  echo "[Dry-run] A2: processmap-agent-pane.sh 2 $CID"
  echo "[Dry-run] A3: processmap-agent-pane.sh 3 $CID"
  echo "[Dry-run] A4: processmap-agent-pane.sh 4 $CID"
  exit 0
fi

for AGENT in 1 2 3 4; do
  osascript <<EOF
    tell application "iTerm2"
      set newWindow to (create window with default profile)
      tell newWindow
        tell current session
          set name to "A${AGENT}"
          write text "processmap-agent-pane.sh ${AGENT} \"$CID\""
        end tell
      end tell
    end tell
EOF
done
```

**Проверки:**
- [ ] `bash -n ~/bin/processmap-iterm-agents-3windows.sh` — успешно
- [ ] `PROCESSMAP_AGENTS_DRY_RUN=1 ~/bin/processmap-iterm-agents-3windows.sh tooling/test-cid-v1` — 4 строки с CID
- [ ] Agent 4 имеет выделенный видимый контекст

---

### 4. `~/Desktop/ProcessMap Agents.command` (Main Launcher)

**Цель:** Графический запускатель: запросить CID, выбрать режим, запустить.

**Обязательное содержимое:**
```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$HOME"

echo "=== ProcessMap Agents Launcher ==="
echo

if [ -n "${PROCESSMAP_DEFAULT_CID:-}" ]; then
  CID="$PROCESSMAP_DEFAULT_CID"
  echo "Using default CID: $CID"
else
  read -rp "Enter contour id: " CID
fi

if [[ ! "$CID" =~ ^[A-Za-z0-9_./-]+$ ]]; then
  echo "ERROR: invalid contour id: $CID" >&2
  echo "Allowed characters: A-Z a-z 0-9 _ - / ." >&2
  exit 2
fi

echo
while true; do
  read -rp "Mode: [1] split panes  [2] multi-window fallback: " MODE
  case "$MODE" in
    1) SCRIPT="$HOME/bin/processmap-iterm-agents.sh"; break ;;
    2) SCRIPT="$HOME/bin/processmap-iterm-agents-3windows.sh"; break ;;
    *) echo "Invalid mode. Enter 1 or 2." ;;
  esac
done

read -rp "Kill existing tmux session 'processmap-agents'? [y/N]: " KILL_TMUX
if [[ "$KILL_TMUX" =~ ^[Yy]$ ]]; then
  tmux kill-session -t processmap-agents 2>/dev/null || true
fi

if [ "${PROCESSMAP_AGENTS_DRY_RUN:-0}" = "1" ]; then
  echo "[Dry-run] Would run: $SCRIPT \"$CID\""
  exit 0
fi

exec "$SCRIPT" "$CID"
```

**Проверки:**
- [ ] `bash -n ~/Desktop/ProcessMap\ Agents.command` — успешно
- [ ] CID с пробелом отклоняется
- [ ] Режим 3 отклоняется, повторный запрос
- [ ] tmux kill остаётся opt-in (требует явного Y)
- [ ] Dry-run не запускает iTerm

---

## Чек-лист server-side зависимостей (уже готовы)

| Файл | Статус |
|------|--------|
| `tools/pm-agent1-planner.sh` | ✅ Присутствует |
| `tools/pm-agent2-executor-watch.sh` | ✅ Присутствует |
| `tools/pm-agent3-reviewer-watch.sh` | ✅ Присутствует |
| `tools/pm-agent4-reviewer-watch.sh` | ✅ Присутствует |
| `tools/pm-agent-mirror-report.sh` | ✅ Присутствует |

Все 4 серверных watcher-скрипта экспортируют:
- `PATH` с `/opt/processmap-test/bin`
- `PROCESSMAP_GSD_BIN`
- `PROCESSMAP_CODEX_GSD_TOOLS`
- `PROCESSMAP_GSD_SKILLS_DIR`
- `PROCESSMAP_GSD_AGENTS_DIR`

## Заключение

Локальные Mac-файлы **не были изменены**, потому что их нет на сервере.
Выше приведён полный список того, что должно быть создано на Mac вручную или через `install-processmap-agent-scripts.sh` (если скрипт установки будет расширен для Mac-клиента).
