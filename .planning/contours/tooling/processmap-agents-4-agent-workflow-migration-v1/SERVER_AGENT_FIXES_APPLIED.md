# SERVER_AGENT_FIXES_APPLIED — Применённые изменения серверных скриптов

## Контур
`tooling/processmap-agents-4-agent-workflow-migration-v1`

## Резервные копии
Все изменённые файлы забэкаплены:
```
tools/pm-agent-status.sh.bak.20260517_001904
tools/pm-agent-reset-stale.sh.bak.20260517_001904
tools/pm-agent-mirror-report.sh.bak.20260517_001904
tools/pm-agents-server-tmux.sh.bak.20260517_001904
tools/install-processmap-agent-scripts.sh.bak.20260517_001904
tools/pm-agent1-planner.sh.bak.20260517_001904
```

## Список изменений

### 1. Создан `tools/pm-agent4-reviewer-watch.sh`
- **Новый файл**
- **Цель**: Watcher для Agent 4 / Reviewer в 4-agent workflow.
- **Основные элементы**:
  - `validate_cid()` с regex `^[A-Za-z0-9_./-]+$`
  - Watcher loop: ожидание `WORKER_2_DONE` + `WORKER_3_DONE` + `WORKER_2_REPORT.md` + `WORKER_3_REPORT.md`
  - Генерация prompt на английском для Agent 4
  - Экспорт GSD env vars (PATH, PROCESSMAP_GSD_BIN, PROCESSMAP_CODEX_GSD_TOOLS, PROCESSMAP_GSD_SKILLS_DIR, PROCESSMAP_GSD_AGENTS_DIR)
  - Запуск `kimi` интерактивно
  - После exit — `pm-agent-mirror-report.sh`

### 2. Изменён `tools/pm-agent-status.sh`
- **Backup**: `tools/pm-agent-status.sh.bak.20260517_001904`
- **Diff summary**:
  - В список проверяемых файлов добавлены: `WORKER_2_PROMPT.md`, `WORKER_3_PROMPT.md`, `WORKER_2_STARTED`, `WORKER_2_REPORT.md`, `WORKER_2_DONE`, `WORKER_3_STARTED`, `WORKER_3_REPORT.md`, `WORKER_3_DONE`, `RAG_PREFLIGHT_WORKER_3.md`
  - Добавлена секция `=== 4-AGENT WORKFLOW STATUS ===` с визуальным статусом 4 ролей
  - В `find` для активных контуров добавлены `WORKER_2_DONE` и `WORKER_3_DONE`

### 3. Изменён `tools/pm-agent-reset-stale.sh`
- **Backup**: `tools/pm-agent-reset-stale.sh.bak.20260517_001904`
- **Diff summary**:
  - Добавлен safe reset для `WORKER_2_STARTED` (если нет `WORKER_2_DONE` и `WORKER_2_REPORT.md`)
  - Добавлен safe reset для `WORKER_3_STARTED` (если нет `WORKER_3_DONE` и `WORKER_3_REPORT.md`)
  - Старые правила для `EXECUTION_STARTED` и `REVIEW_STARTED` без изменений

### 4. Изменён `tools/pm-agents-server-tmux.sh`
- **Backup**: `tools/pm-agents-server-tmux.sh.bak.20260517_001904`
- **Diff summary**:
  - Добавлен `pm-agent4-reviewer-watch.sh` в список обязательных файлов
  - Переименованы окна: `A2-executor` → `A2-worker`, `A3-reviewer` → `A3-worker`
  - Добавлено окно `A4-reviewer`
  - Обновлено `select-window` на `A2-worker`

### 5. Изменён `tools/install-processmap-agent-scripts.sh`
- **Backup**: `tools/install-processmap-agent-scripts.sh.bak.20260517_001904`
- **Diff summary**:
  - Добавлено `mkdir -p` для `.agents/agent4-reviewer/prompts` и `logs`
  - Добавлен `pm-agent4-reviewer-watch.sh` в `chmod +x`
  - Обновлён текст `AGENT_SCRIPTS_INSTALLED.md` (4-agent model)

### 6. Изменён `tools/pm-agent-mirror-report.sh`
- **Backup**: `tools/pm-agent-mirror-report.sh.bak.20260517_001904`
- **Diff summary**:
  - В allowlist добавлены: `WORKER_2_PROMPT.md`, `WORKER_3_PROMPT.md`, `WORKER_2_REPORT.md`, `WORKER_3_REPORT.md`, `WORKER_2_STARTED`, `WORKER_2_DONE`, `WORKER_3_STARTED`, `WORKER_3_DONE`, `RAG_PREFLIGHT_PLANNER.md`, `RAG_PREFLIGHT_EXECUTOR.md`, `RAG_PREFLIGHT_REVIEWER.md`, `RAG_PREFLIGHT_WORKER_3.md`

### 7. Изменён `tools/pm-agent1-planner.sh`
- **Backup**: `tools/pm-agent1-planner.sh.bak.20260517_001904`
- **Diff summary**:
  - В generated prompt добавлена заметка о создании `WORKER_2_PROMPT.md` и `WORKER_3_PROMPT.md` при 4-agent workflow
  - Не ломает обратную совместимость

## Файлы без изменений
- `tools/pm-agent2-executor-watch.sh` — оставлен без изменений (совместим как Worker A)
- `tools/pm-agent3-reviewer-watch.sh` — оставлен без изменений (совместим как legacy reviewer или Worker B)
- `tools/pm-gsd-status.sh` — не затронут

## Проверка
Все изменённые файлы прошли `bash -n`.
