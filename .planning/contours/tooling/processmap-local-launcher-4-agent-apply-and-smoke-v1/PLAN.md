# tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1

## Контекст
Контур является follow-up к `tooling/processmap-agents-4-agent-workflow-migration-v1` (REVIEW_PASS). Серверная часть 4-agent workflow мигрирована и работает. Оставшийся follow-up — локальный Mac launcher, который не был изменён, потому что серверный агент не имеет доступа к Mac.

Цель этого контура: **применить и проверить** локальный Mac launcher для поддержки 4-agent workflow.

## GSD Discipline

### Локальная проверка (выполнена)
```
pwd:      /opt/processmap-test
whoami:   root
hostname: clearvestnic.ru
date:     2026-05-17T00:43:25+00:00
PATH:     /opt/processmap-test/bin:/root/.local/bin:/root/.kimi/bin:...
gsd:      /opt/processmap-test/bin/gsd
gsd-sdk:  /opt/processmap-test/bin/gsd-sdk
kimi:     /root/.local/bin/kimi
codex:    /usr/local/bin/codex
```

### Серверная проверка (выполнена)
```
pwd:      /opt/processmap-test
whoami:   root
hostname: clearvestnic.ru
date:     2026-05-17T00:43:50+00:00
PROCESSMAP_GSD_WRAPPER_FOUND
CODEX_GSD_TOOLS_FOUND
GSD skills: 48+ directories в /root/.codex/skills/
```

**GSD mode: FULL** — используется GSD discipline для планирования.

## RAG Preflight

### Planner preflight
Команда:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" \
  --area "local Mac launcher 4-agent workflow Agent1 Planner Agent2 Worker Agent3 Worker Agent4 Reviewer CID propagation dry-run iTerm" \
  --format md --top-k 12
```
Сохранён в `RAG_PREFLIGHT_PLANNER.md`.

Ключевые факты:
- Серверные 4-agent скрипты уже существуют (tmux launcher, agent4-reviewer-watch).
- RAG = read-only suggestion layer, auto-mutation запрещена.
- GSD discipline обязательна для Agent 1 и Agent 3.

### Reviewer preflight
Команда:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" \
  --query "local launcher 4-agent workflow review rules same CID no product runtime changes no secrets dry-run" \
  --format md --top-k 12
```
Сохранён в `RAG_PREFLIGHT_REVIEWER.md`.

Ключевые факты:
- User rejection history: REVIEW_PASS запрещён, если user-visible сценарий всё ещё failing.
- Для tooling-контура: user-visible = локальный launcher реально запускает 4 агентов или явно документирует ограничение.
- Independent validation required — reviewer не должен доверять только отчётам worker.

## Source Truth — Local Mac

### Статус
**Локальный Mac недоступен** из серверного runtime.

Проверка файлов:
```
~/Desktop/ProcessMap Agents.command          — MISSING
~/bin/processmap-iterm-agents.sh             — MISSING
~/bin/processmap-iterm-agents-3windows.sh    — MISSING
~/bin/processmap-agent-pane.sh               — MISSING
```

Подробнее в `LOCAL_MAC_UNAVAILABLE.md`.

### Что ожидается от локальных файлов
На основе предыдущего контура и аудита:
1. `~/Desktop/ProcessMap Agents.command` — главный launcher (osascript + read).
2. `~/bin/processmap-iterm-agents.sh` — split pane mode [1].
3. `~/bin/processmap-iterm-agents-3windows.sh` — 3-window fallback mode [2].
4. `~/bin/processmap-agent-pane.sh` — shared pane helper.

## Source Truth — Server

### Git
```
branch:      fix/lockfile-sync-test
HEAD:        5b20bc2d1292f419647238eaf37dac55f9315942
origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
status:      12 modified files (product runtime, pre-existing, unrelated)
```

### Server 4-agent scripts
```
-rwxr-xr-x tools/pm-agent1-planner.sh          (4094 bytes)
-rwxr-xr-x tools/pm-agent2-executor-watch.sh   (3253 bytes)
-rwxr-xr-x tools/pm-agent3-reviewer-watch.sh    (3699 bytes)
-rwxr-xr-x tools/pm-agent4-reviewer-watch.sh    (4520 bytes)
-rwxr-xr-x tools/pm-agent-reset-stale.sh        (1982 bytes)
-rwxr-xr-x tools/pm-agents-server-tmux.sh       (2552 bytes)
-rwxr-xr-x tools/pm-agent-status.sh             (3132 bytes)
```

### bash -n результаты
```
BASH_N_OK tools/pm-agent1-planner.sh
BASH_N_OK tools/pm-agent2-executor-watch.sh
BASH_N_OK tools/pm-agent3-reviewer-watch.sh
BASH_N_OK tools/pm-agent4-reviewer-watch.sh
BASH_N_OK tools/pm-agent-status.sh
BASH_N_OK tools/pm-agent-reset-stale.sh
BASH_N_OK tools/pm-agents-server-tmux.sh
```
**Все 7 скриптов прошли синтаксическую проверку.**

### pm-agent-status.sh 4-agent output
Скрипт `pm-agent-status.sh` уже показывает:
- Agent 1 (Planner) status
- Worker 2 status
- Worker 3 status
- Agent 4 (Reviewer) status

## Current Follow-up
Осталось от предыдущего контура:
1. Локальный Mac launcher не был изменён.
2. Не выполнен реальный `bash -n` для Mac-скриптов.
3. Не выполнен реальный dry-run на Mac.
4. Не проверена передача CID ко всем 4 агентам в локальном launcher.

## Target Local 4-Agent Launcher Behavior

### Главный launcher (`~/Desktop/ProcessMap Agents.command`)
- CID берётся из `PROCESSMAP_DEFAULT_CID` или запрашивается интерактивно.
- Валидация CID: `^[A-Za-z0-9_./-]+$`.
- Валидация mode: только `1` или `2`.
- Mode `1` = split pane (4 pane: A1, A2, A3, A4).
- Mode `2` = 4-window fallback (или 3-window с split для A3/A4).
- `tmux kill-session` требует явного подтверждения (opt-in).
- Поддержка `PROCESSMAP_AGENTS_DRY_RUN=1`.
- Запускает `$HOME/bin/processmap-iterm-agents.sh` или `$HOME/bin/processmap-iterm-agents-3windows.sh`.

### Split helper (`~/bin/processmap-iterm-agents.sh`)
- Создаёт 4 split pane в iTerm.
- Вызывает `processmap-agent-pane.sh <agent_num> <CID>`.
- Dry-run печатает 4 команды с одинаковым CID.

### Windows fallback (`~/bin/processmap-iterm-agents-3windows.sh`)
- Создаёт 4 окна iTerm (или 3 окна с split).
- Вызывает `processmap-agent-pane.sh <agent_num> <CID>`.
- Dry-run печатает 4 команды с одинаковым CID.

### Pane helper (`~/bin/processmap-agent-pane.sh`)
- Принимает `AGENT="$1"`, `CID="$2"`.
- Валидирует CID (`^[A-Za-z0-9_./-]+$`).
- AGENT=1 → `pm-agent1-planner.sh`
- AGENT=2 → `pm-agent2-executor-watch.sh`
- AGENT=3 → `pm-agent3-reviewer-watch.sh`
- AGENT=4 → `pm-agent4-reviewer-watch.sh`
- Работает из `/opt/processmap-test`.
- Поддерживает `PROCESSMAP_AGENTS_DRY_RUN=1`.

## Local Launcher Audit Plan

### Вопросы для Worker 2
A. Главный launcher:
- Требуется ли явный CID (если нет PROCESSMAP_DEFAULT_CID)?
- Валидирует ли CID допустимыми символами?
- Отклоняет ли пробелы?
- Отклоняет ли невалидный mode?
- Сохраняет ли split mode [1]?
- Сохраняет ли fallback mode?
- tmux kill opt-in?
- Есть ли dry-run?

B. Распространение CID на 4 агентов:
- Одинаковый CID передаётся Agent 1?
- Одинаковый CID передаётся Agent 2?
- Одинаковый CID передаётся Agent 3?
- Одинаковый CID передаётся Agent 4?
- Корректны ли role labels?
- Корректно ли экранирование команд?

C. Локальный helper:
- Поддерживает ли `processmap-agent-pane.sh` agent number/role 4?
- Вызывает ли корректный серверный скрипт для Agent 4?
- Выполняет ли remote commands из `/opt/processmap-test`?
- Оставляет ли panes/windows открытыми после выхода команды?
- Печатает ли dry-run все 4 команды без открытия iTerm?

D. Server compatibility:
- Совпадают ли имена серверных скриптов с локальными вызовами?
- Доступен ли Agent 4 reviewer script?
- Показывает ли status script 4-agent state?
- Сохранена ли RAG preflight совместимость?

## Server Compatibility Plan

### Вопросы для Worker 3
1. Доступен ли `tools/pm-agent4-reviewer-watch.sh`?
2. Проходит ли `bash -n`?
3. Ждёт ли `WORKER_2_DONE` + `WORKER_3_DONE`?
4. Генерирует ли prompt для Agent 4 на английском?
5. Показывает ли `pm-agent-status.sh` 4-agent state?
6. Работает ли `pm-agent-reset-stale.sh` с worker markers?
7. Создаёт ли `pm-agents-server-tmux.sh` 4 окна?
8. Совпадают ли имена скриптов с тем, что ожидает локальный launcher?

## Work Split

### Agent 2 / Worker (Work Package A)
Фокус: локальный Mac launcher.
- Инспекция локальных файлов (если доступны).
- Применение 4-agent поддержки.
- Backup перед правками.
- `bash -n` для локальных скриптов.
- Dry-run для split mode и fallback mode.
- Доказательство same CID propagation.
- Локальные отчёты на русском.

### Agent 3 / Worker (Work Package B)
Фокус: серверная совместимость.
- Инспекция серверных скриптов.
- Проверка 4-agent совместимости.
- Проверка Agent 4 reviewer script.
- Проверка status script.
- Проверка marker model.
- `bash -n` для серверных скриптов.
- Server отчёты на русском.

### Agent 4 / Reviewer
Фокус: обзор обоих workers.
- GSD discipline.
- RAG preflight.
- Ожидание WORKER_2_DONE + WORKER_3_DONE.
- Чтение обоих отчётов.
- Независимая валидация (local + server).
- Проверка same CID.
- Проверка dry-run.
- Проверка Agent 4 reviewer command.
- Проверка status output.
- Проверка отсутствия product runtime изменений.
- REVIEW_PASS или CHANGES_REQUESTED.

## Bounded Fix Policy

### Локальные разрешённые изменения
- `~/Desktop/ProcessMap Agents.command`
- `~/bin/processmap-iterm-agents.sh`
- `~/bin/processmap-iterm-agents-3windows.sh`
- `~/bin/processmap-agent-pane.sh`

### Серверные разрешённые изменения (только если строго необходимо)
- `tools/pm-agent1-planner.sh`
- `tools/pm-agent2-worker-watch.sh`
- `tools/pm-agent3-worker-watch.sh`
- `tools/pm-agent4-reviewer-watch.sh`
- `tools/pm-agent-status.sh`
- `tools/pm-agent-reset-stale.sh`
- `tools/pm-agents-server-tmux.sh`

### Backup rule
Перед каждой правкой:
```bash
cp "$FILE" "$FILE.backup_$(date +%Y%m%d_%H%M%S)"
```

### Запрещено изменять
- `frontend/src/`
- `backend/app/`
- package файлы
- docker compose
- `.env`
- RAG core tooling
- Project Atlas sync config

## Validation Plan

### Локальная валидация
```bash
bash -n "$HOME/Desktop/ProcessMap Agents.command"
bash -n "$HOME/bin/processmap-iterm-agents.sh"
bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh"
bash -n "$HOME/bin/processmap-agent-pane.sh"
```

### Dry-run
```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" "tooling/test-cid-v1"
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents-3windows.sh" "tooling/test-cid-v1"
```

Требуемое доказательство dry-run:
- Agent 1 command содержит CID.
- Agent 2 command содержит тот же CID.
- Agent 3 command содержит тот же CID.
- Agent 4 command содержит тот же CID.
- Каждая команда делает `cd /opt/processmap-test` или вызывает серверный скрипт, который делает это.

### Серверная валидация
```bash
cd /opt/processmap-test
bash -n tools/pm-agent1-planner.sh
bash -n tools/pm-agent2-executor-watch.sh
bash -n tools/pm-agent3-reviewer-watch.sh
bash -n tools/pm-agent4-reviewer-watch.sh
bash -n tools/pm-agent-status.sh
bash -n tools/pm-agent-reset-stale.sh
bash -n tools/pm-agents-server-tmux.sh
./tools/pm-agent-status.sh "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1"
```

## Acceptance Criteria

Agent 4 может выдать REVIEW_PASS только если:
1. Планинг-пак Agent 1 существует.
2. WORKER_2_PROMPT.md существует.
3. WORKER_3_PROMPT.md существует.
4. REVIEWER_PROMPT.md существует.
5. Worker 2 завершён или локальная недоступность явно задокументирована.
6. Worker 3 завершён.
7. Same CID propagation к Agent 1/2/3/4 доказана.
8. Split mode [1] поддерживает 4 агентов.
9. Fallback mode поддерживает 4 агентов или документирует точный эквивалент.
10. Dry-run доказывает конструкцию команд.
11. CID validation сохранена.
12. Невалидный CID отклоняется.
13. Невалидный mode отклоняется или переспрашивается.
14. tmux kill остаётся opt-in.
15. Серверные скрипты запускаются из `/opt/processmap-test`.
16. Agent 4 reviewer script существует.
17. `pm-agent-status` показывает 4-agent state.
18. RAG preflight совместимость сохранена.
19. Нет изменений product runtime.
20. Нет изменений frontend/backend app.
21. Нет установки пакетов.
22. Нет секретов в отчётах.
23. Резервные копии существуют перед правками.
24. Документация/отчёты на русском.
25. Agent prompts на английском.

REVIEW_PASS **запрещён**, если:
- Локальный launcher всё ещё запускает только 3 агентов.
- Agent 4 не может быть запущен.
- Agent 3 всё ещё обрабатывается как reviewer в локальном launcher.
- CID mismatch возможен.
- Dry-run не показывает все 4 роли.
- Локальные файлы были недоступны, а отчёт притворяется полной локальной валидацией.

## Non-goals

Явные non-goals:
- Нет работы с Diagram.
- Нет Product Actions.
- Нет UI product изменений.
- Нет RAG implementation.
- Нет MCP repair.
- Нет GSD repair.
- Нет frontend/backend runtime изменений.
- Нет установки пакетов.
- Нет commit/push/PR.
- Нет stage/prod deploy.
- Нет инспекции секретов.
- Нет редизайна iTerm UI за пределами 4-agent поддержки.
- Нет удаления split mode [1].

## Agent 2 / Worker Plan

См. `WORKER_2_PROMPT.md` / `EXECUTOR_PART_1_PROMPT.md`.

Обязательные отчёты Agent 2:
- WORKER_2_REPORT.md
- LOCAL_LAUNCHER_AUDIT.md
- LOCAL_LAUNCHER_FIXES_APPLIED.md или LOCAL_LAUNCHER_NO_FIX_REQUIRED.md
- LOCAL_CID_PROPAGATION_4_AGENT.md
- LOCAL_DRY_RUN_RESULTS.md
- LOCAL_VALIDATION_RESULTS.md

## Agent 3 / Worker Plan

См. `WORKER_3_PROMPT.md` / `EXECUTOR_PART_2_PROMPT.md`.

Обязательные отчёты Agent 3:
- WORKER_3_REPORT.md
- SERVER_4_AGENT_COMPATIBILITY_AUDIT.md
- SERVER_SCRIPT_NAME_CONTRACT.md
- SERVER_STATUS_VALIDATION.md
- SERVER_MARKER_MODEL_VALIDATION.md
- SERVER_FIXES_APPLIED.md или SERVER_NO_FIX_REQUIRED.md
- SERVER_VALIDATION_RESULTS.md

## Agent 4 / Reviewer Plan

См. `REVIEWER_PROMPT.md`.

Обязательные выходы Agent 4:
- REVIEW_REPORT.md (на русском)
- REVIEW_PASS или CHANGES_REQUESTED
- Если FAIL: REWORK_REQUEST.md

## Risks

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Локальный Mac недоступен | Высокая | Среднее | Детальная спецификация в планинг-паке; явное документирование limitation; не выдавать фейковый REVIEW_PASS. |
| Имена серверных скриптов изменились | Низкая | Высокое | Worker 3 проверяет name contract; PLAN.md содержит exact expected names. |
| Agent 4 script ещё не создан | Низкая | Высокое | Предыдущий contour уже создал его; Worker 3 проверяет наличие. |
| osascript/iTerm версия несовместима | Средняя | Среднее | Dry-run не зависит от iTerm; bash -n проверяет синтаксис. |
| CID propagation broken в одном из режимов | Средняя | Высокое | Dry-run должен доказать 4 одинаковых CID; reviewer проверяет. |

## Gates

- [x] GSD discipline recorded
- [x] Source/runtime truth captured (server)
- [x] Local source truth captured (unavailable, documented)
- [x] RAG preflight planner done
- [x] RAG preflight reviewer done
- [x] PLAN.md written
- [x] WORKER_2_PROMPT.md written
- [x] WORKER_3_PROMPT.md written
- [x] REVIEWER_PROMPT.md written
- [x] STATE.json written
- [x] AGENT_RUN_ID written
- [ ] READY_FOR_EXECUTION — будет установлен после завершения планирования
