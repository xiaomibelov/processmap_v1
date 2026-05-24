# AGENT4_REVIEWER_SCRIPT_REPORT — Дизайн pm-agent4-reviewer-watch.sh

## Контур
`tooling/processmap-agents-4-agent-workflow-migration-v1`

## Назначение
`tools/pm-agent4-reviewer-watch.sh` — watcher-скрипт для Agent 4 / Reviewer в 4-agent workflow.

## Архитектура

### Entrypoint
```bash
pm-agent4-reviewer-watch.sh <contour-id>
```

### Валидация CID
```bash
validate_cid() {
  local value="$1"
  if [[ ! "$value" =~ ^[A-Za-z0-9_./-]+$ ]]; then
    echo "ERROR: invalid contour id: $value" >&2
    exit 2
  fi
}
```
- Тот же regex, что и в `pm-agent1-planner.sh`, `pm-agent2-executor-watch.sh`, `pm-agent3-reviewer-watch.sh`.

### Пути
- `DIR="$ROOT/.planning/contours/$CID"`
- `PROMPT="$ROOT/.agents/agent4-reviewer/prompts/${CID//\//__}-reviewer-start.md"`
- `LOG="$ROOT/.agents/agent4-reviewer/logs/${CID//\//__}-watch.log"`
- `mkdir -p` для обеих директорий.

### GSD Env Vars
Экспортируются те же переменные, что и в `pm-agent1-planner.sh`:
```bash
export PATH="$ROOT/bin:/root/.local/bin:/root/.kimi/bin:..."
export PROCESSMAP_GSD_BIN="$ROOT/bin/gsd"
export PROCESSMAP_CODEX_GSD_TOOLS="/root/.codex/get-shit-done/bin/gsd-tools.cjs"
export PROCESSMAP_GSD_SKILLS_DIR="/root/.codex/skills"
export PROCESSMAP_GSD_AGENTS_DIR="/root/.codex/agents"
```

### Watcher Loop
1. **Условия запуска** (все должны быть истинны):
   - `[ -f "$DIR/WORKER_2_DONE" ]`
   - `[ -f "$DIR/WORKER_3_DONE" ]`
   - `[ -f "$DIR/WORKER_2_REPORT.md" ]`
   - `[ -f "$DIR/WORKER_3_REPORT.md" ]`
   - `[ ! -f "$DIR/REVIEW_PASS" ]`
   - `[ ! -f "$DIR/CHANGES_REQUESTED" ]`
   - `[ ! -f "$DIR/REVIEW_BLOCKED.md" ]`

2. **Защита от двойного запуска**:
   - Если `REVIEW_STARTED` существует — ждать 10 секунд и continue.

3. **Маркер старта**:
   - `date -u +"%Y-%m-%dT%H:%M:%SZ" > "$DIR/REVIEW_STARTED"`

4. **Генерация prompt**:
   - Язык: English.
   - Содержит:
     - GSD Discipline блок (mandatory checks)
     - Identity: Agent 4 / Reviewer
     - Working directory, Contour ID, Run ID
     - Список input-файлов (PLAN.md, REVIEWER_PROMPT.md, WORKER_2_REPORT.md, WORKER_3_REPORT.md, RUNTIME_PROOF_CHECKLIST.md)
     - RAG preflight command
     - Validation checklist (bash -n, dry-run, CID propagation, marker model, status output, no product runtime changes, no secrets, backups, Agent 4 script existence, tmux kill opt-in)
     - Rules (no product code, no merge/deploy/PR, independent inspection)
     - Output contract (REVIEW_REPORT.md + REVIEW_PASS или CHANGES_REQUESTED)
     - Mirror command

5. **Запуск kimi**:
   - `cd "$ROOT" && kimi`

6. **Post-exit**:
   - `pm-agent-mirror-report.sh "$CID" reviewer` если доступен.
   - Запись в лог времени exit.

## Отличия от pm-agent3-reviewer-watch.sh

| Аспект | pm-agent3-reviewer-watch.sh (legacy) | pm-agent4-reviewer-watch.sh (новый) |
|--------|--------------------------------------|-------------------------------------|
| Триггер | `READY_FOR_REVIEW` + `EXEC_REPORT.md` | `WORKER_2_DONE` + `WORKER_3_DONE` + оба отчёта |
| Роль | Reviewer (3-agent) | Reviewer (4-agent) |
| Prompt language | Russian | English |
| GSD env vars | Да | Да |
| RAG preflight | Да | Да |
| Mirror report | Да | Да |
| CID validation | Да | Да |

## Проверка путей
```bash
ls -la /opt/processmap-test/tools/pm-agent4-reviewer-watch.sh
# -rwxr-xr-x 1 root root 4520 May 17 00:19 /opt/processmap-test/tools/pm-agent4-reviewer-watch.sh
```

## Синтаксис
`bash -n tools/pm-agent4-reviewer-watch.sh` — пройден.
