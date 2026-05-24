# WORKER_3_REPORT — Server Tooling Migration (Work Package B)

## Контур
`tooling/processmap-agents-4-agent-workflow-migration-v1`

## Run ID
`20260517T000255Z-41876`

## Время выполнения
2026-05-17T00:18 — 2026-05-17T00:22

## Цель
Мигрировать серверные скрипты ProcessMap с 3-agent модели на 4-agent workflow:
- Agent 1 / Planner
- Agent 2 / Worker (Work Package A — локальный Mac launcher)
- Agent 3 / Worker (Work Package B — серверные скрипты)
- Agent 4 / Reviewer

## Что сделано

### 1. RAG Preflight
- Выполнен `node tools/rag/pm-rag-agent-preflight.mjs --role executor ...`
- Результат сохранён в `RAG_PREFLIGHT_WORKER_3.md`
- Ключевые факты: RAG read-only, запрет на product runtime изменения, GSD discipline обязателен.

### 2. Source Truth
- Хост: clearvestnic.ru
- Ветка: `fix/lockfile-sync-test`
- HEAD: `5b20bc2d1292f419647238eaf37dac55f9315942`
- Product runtime изменения присутствуют в рабочей директории, но **не затронуты** этим контуром.

### 3. Инспекция скриптов
Прочитаны и проверены `bash -n`:
- `tools/pm-agent1-planner.sh`
- `tools/pm-agent2-executor-watch.sh`
- `tools/pm-agent3-reviewer-watch.sh`
- `tools/pm-agent-status.sh`
- `tools/pm-agent-reset-stale.sh`
- `tools/pm-agent-mirror-report.sh`
- `tools/pm-agents-server-tmux.sh`
- `tools/install-processmap-agent-scripts.sh`

Все скрипты имели корректный синтаксис до начала работы.

### 4. Резервные копии
Созданы бэкапы с timestamp `20260517_001904` для всех редактируемых файлов.

### 5. Создан новый скрипт
- **`tools/pm-agent4-reviewer-watch.sh`** (новый, 152 строки)
  - Ждёт `WORKER_2_DONE` + `WORKER_3_DONE`
  - Ждёт `WORKER_2_REPORT.md` + `WORKER_3_REPORT.md`
  - Проверяет отсутствие `REVIEW_PASS` / `CHANGES_REQUESTED` / `REVIEW_BLOCKED.md`
  - Пишет `REVIEW_STARTED`
  - Генерирует prompt на английском для Agent 4 Reviewer
  - Экспортирует GSD env vars (PATH, PROCESSMAP_GSD_BIN, PROCESSMAP_CODEX_GSD_TOOLS, PROCESSMAP_GSD_SKILLS_DIR, PROCESSMAP_GSD_AGENTS_DIR)
  - Запускает `kimi` интерактивно
  - После exit запускает `pm-agent-mirror-report.sh`
  - `validate_cid()` с regex `^[A-Za-z0-9_./-]+$`

### 6. Обновлённые скрипты

#### `tools/pm-agent-status.sh`
- Добавлены новые маркеры в список файлов:
  `WORKER_2_PROMPT.md`, `WORKER_3_PROMPT.md`, `WORKER_2_STARTED`, `WORKER_2_REPORT.md`, `WORKER_2_DONE`, `WORKER_3_STARTED`, `WORKER_3_REPORT.md`, `WORKER_3_DONE`, `RAG_PREFLIGHT_WORKER_3.md`
- Добавлена секция **4-AGENT WORKFLOW STATUS** с визуальным статусом каждой роли.
- Обновлён поиск активных контуров: добавлены `WORKER_2_DONE` и `WORKER_3_DONE`.
- Старая совместимость полностью сохранена.

#### `tools/pm-agent-reset-stale.sh`
- Добавлены safe reset правила для `WORKER_2_STARTED` и `WORKER_3_STARTED`.
- Условие: удалять `*_STARTED` только если нет соответствующего `*_DONE` и `*_REPORT.md`.
- `WORKER_2_DONE`, `WORKER_3_DONE`, `REVIEW_PASS`, `CHANGES_REQUESTED` — никогда не удаляются.

#### `tools/pm-agents-server-tmux.sh`
- Добавлен `pm-agent4-reviewer-watch.sh` в список обязательных исполняемых файлов.
- Окна переименованы:
  - `A2-executor` → `A2-worker`
  - `A3-reviewer` → `A3-worker`
  - Добавлено `A4-reviewer`
- В обоих режимах (внутри tmux и новая сессия) создаётся 4 окна + status.

#### `tools/install-processmap-agent-scripts.sh`
- Добавлено создание директории `.agents/agent4-reviewer/prompts` и `logs`.
- Добавлен `pm-agent4-reviewer-watch.sh` в список устанавливаемых скриптов и `chmod +x`.
- Обновлена документация в `AGENT_SCRIPTS_INSTALLED.md`: теперь упоминается 4-agent модель.

#### `tools/pm-agent-mirror-report.sh`
- В allowlist добавлены:
  `WORKER_2_PROMPT.md`, `WORKER_3_PROMPT.md`, `WORKER_2_REPORT.md`, `WORKER_3_REPORT.md`, `WORKER_2_STARTED`, `WORKER_2_DONE`, `WORKER_3_STARTED`, `WORKER_3_DONE`, `RAG_PREFLIGHT_PLANNER.md`, `RAG_PREFLIGHT_EXECUTOR.md`, `RAG_PREFLIGHT_REVIEWER.md`, `RAG_PREFLIGHT_WORKER_3.md`.

#### `tools/pm-agent1-planner.sh` (опциональное обновление)
- В generated prompt добавлена заметка: при использовании 4-agent workflow также создать `WORKER_2_PROMPT.md` и `WORKER_3_PROMPT.md`.
- Обратная совместимость полностью сохранена.

## Валидация

- `bash -n` пройден для всех 9 скриптов (8 старых + 1 новый).
- `pm-agent-status.sh <CID>` корректно показывает 4-agent состояние (проверено на текущем контуре).
- RAG preflight CLI работает.
- Изменения ограничены `tools/`, `.planning/contours/<CID>/`, `.agents/`.
- Product runtime файлы (frontend/src/, backend/app/) **не изменены**.
- Секреты не напечатаны.

## Блокеры
Нет.

## Handoff
Worker 3 завершён. Следующий шаг — Agent 4 / Reviewer, который будет ожидать `WORKER_2_DONE` + `WORKER_3_DONE`.
