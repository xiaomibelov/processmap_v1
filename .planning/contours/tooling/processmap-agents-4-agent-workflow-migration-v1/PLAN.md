# tooling/processmap-agents-4-agent-workflow-migration-v1

## GSD Discipline

Выполненные команды:
```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*' 2>/dev/null | sort | head -50 || true
```

Результаты:
- `gsd`: `/opt/processmap-test/bin/gsd` — найден
- `gsd-sdk`: `/opt/processmap-test/bin/gsd-sdk` — найден
- `PROCESSMAP_GSD_WRAPPER_FOUND`
- `CODEX_GSD_TOOLS_FOUND`
- GSD skills: 48 штук в `/root/.codex/skills/` (gsd-add-backlog … gsd-plan-review-convergence)

GSD mode: **FULL** (wrapper + tools + skills доступны).

Подтверждения:
- Никакая имплементация не выполнялась на этапе планирования.
- Product-файлы не изменены.
- Контур ограничен tooling/workflow миграцией.

## RAG Preflight

Выполненные команды:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "tooling/processmap-agents-4-agent-workflow-migration-v1" \
  --area "ProcessMap agents 4-agent workflow launcher Agent1 Planner Agent2 Worker Agent3 Worker Agent4 Reviewer CID propagation status dry-run" \
  --format md \
  --top-k 12

node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "tooling/processmap-agents-4-agent-workflow-migration-v1" \
  --query "tooling workflow migration review rules 4 agents same CID no product runtime changes no secrets" \
  --format md \
  --top-k 12
```

Факты, использованные в планировании:
- Существующие скрипты `install-processmap-agent-scripts.sh`, `pm-agents-server-tmux.sh`, `pm-agent1-planner.sh`, `pm-agent2-executor-watch.sh`, `pm-agent3-reviewer-watch.sh`, `pm-agent-status.sh`, `pm-agent-reset-stale.sh`, `pm-agent-mirror-report.sh` — всё это 3-agent модель.
- GSD env vars уже экспортируются в `pm-agent1-planner.sh`; тот же паттерн должен сохраняться.
- RAG — read-only suggestion layer; никакой auto-mutation.
- Продуктовый runtime (frontend/src/, backend/app/) — запрет на изменения.

Как RAG изменил план:
- Убедились, что текущая кодовая база tooling действительно 3-agent; миграция требует создания новых скриптов/маркеров.
- Подтвердили необходимость сохранения GSD discipline для Agent 4 Reviewer.

## Source Truth — Server

```text
pwd: /opt/processmap-test
whoami: root
hostname: clearvestnic.ru
date: 2026-05-17T00:04:44+00:00
git branch: fix/lockfile-sync-test
git HEAD: 5b20bc2d1292f419647238eaf37dac55f9315942
origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
git diff --name-only: frontend/src/components/ProcessStage.jsx и др. (product runtime изменения вне этого контура)
git diff --stat: 12 files changed, 116 insertions(+), 68 deletions(-)
```

Текущие server agent-скрипты:
- `tools/pm-agent1-planner.sh` (3972 bytes, 2026-05-16) — 3-agent prompt, GSD env, `kimi` launch
- `tools/pm-agent2-executor-watch.sh` (3253 bytes, 2026-05-16) — ждёт READY_FOR_EXECUTION, пишет EXEC_REPORT.md + READY_FOR_REVIEW
- `tools/pm-agent3-reviewer-watch.sh` (3699 bytes, 2026-05-16) — ждёт READY_FOR_REVIEW + EXEC_REPORT.md, пишет REVIEW_REPORT.md + REVIEW_PASS/CHANGES_REQUESTED
- `tools/pm-agent-status.sh` (1935 bytes, 2026-05-16) — показывает маркеры 3-agent workflow
- `tools/pm-agent-reset-stale.sh` (1322 bytes, 2026-05-14) — сбрасывает EXECUTION_STARTED и REVIEW_STARTED
- `tools/pm-agent-mirror-report.sh` (1837 bytes, 2026-05-14) — миррорит разрешённые файлы в Obsidian
- `tools/pm-agents-server-tmux.sh` — tmux launcher для 3 агентов
- `tools/install-processmap-agent-scripts.sh` — инсталлятор 3-agent структуры
- `tools/pm-gsd-status.sh` — GSD status probe

Важно: все скрипты рассчитаны на старую модель Agent 1 → Agent 2 → Agent 3.

## Source Truth — Local Launcher Requirements

Agent 1 запущен на сервере Linux (clearvestnic.ru). Локальный Mac недоступен.

Ожидаемые локальные файлы:
- `~/Desktop/ProcessMap Agents.command`
- `~/bin/processmap-iterm-agents.sh`
- `~/bin/processmap-iterm-agents-3windows.sh`
- `~/bin/processmap-agent-pane.sh`

Статус: **требуется инспекция Worker 2**.
Создан `LOCAL_MAC_CHECKLIST.md` с полным списком команд для Worker 2.

## Current Workflow Problem

Текущая модель: **3-agent**
- Agent 1 / Planner → Agent 2 / Executor → Agent 3 / Reviewer

Проблемы:
1. Agent 2 один выполняет всю имплементацию; нет параллелизма.
2. Agent 3 совмещает reviewer + финальный gate; при больших контурах перегружен.
3. Нет поддержки параллельных worker lanes.
4. Статус-скрипт не знает о worker lanes.
5. Маркерная модель не поддерживает WORKER_2_DONE / WORKER_3_DONE.

## Target 4-Agent Workflow

Целевая модель:
```
Agent 1 / Planner
  ↓
Agent 2 / Worker (Work Package A)
Agent 3 / Worker (Work Package B)   ← параллельно
  ↓
Agent 4 / Reviewer
```

Требования:
- Один CID передаётся всем 4 агентам.
- Agent 4 ревьюит только после завершения обоих worker lanes.
- Старый 3-agent workflow не ломается без явной документированной миграции.
- Dry-run доказывает конструкцию команд для всех 4 агентов.

## Marker Model

### Старые маркеры (сохранить совместимость)
- `READY_FOR_EXECUTION` — Agent 1 завершил планирование
- `EXECUTION_STARTED` — начата старая executor фаза
- `READY_FOR_REVIEW` — старый executor завершил работу
- `REVIEW_STARTED` — начат старый review
- `REVIEW_PASS` / `CHANGES_REQUESTED` — финальный вердикт старого review
- `EXEC_BLOCKED.md` / `REVIEW_BLOCKED.md` — блокеры
- `EXEC_REPORT.md` / `REVIEW_REPORT.md` — отчёты

### Новые маркеры (добавить)
- `WORKER_2_STARTED` — начат Work Package A
- `WORKER_2_REPORT.md` — отчёт Worker 2
- `WORKER_2_DONE` — Worker 2 завершён
- `WORKER_3_STARTED` — начат Work Package B
- `WORKER_3_REPORT.md` — отчёт Worker 3
- `WORKER_3_DONE` — Worker 3 завершён
- `READY_FOR_REVIEW` — может выставляться Agent 3 (Worker) или отдельным мерж-шагом перед Agent 4
- `REVIEW_REPORT.md` — отчёт Agent 4
- `REVIEW_PASS` / `CHANGES_REQUESTED` — вердикт Agent 4
- `REWORK_REQUEST.md` — запрос на доработку

### Совместимость
- Если в контуре нет WORKER_2_DONE / WORKER_3_DONE, старые маркеры (READY_FOR_REVIEW + EXEC_REPORT.md) продолжают работать.
- Новые скрипты должны понимать обе модели.

## Role Definitions

### Agent 1 / Planner
- GSD discipline, RAG preflight, source/runtime truth.
- Bounded plan, split into Work Package A и Work Package B.
- Создаёт WORKER_2_PROMPT.md, WORKER_3_PROMPT.md, REVIEWER_PROMPT.md.
- Не пишет product code.

### Agent 2 / Worker
- RAG preflight (worker).
- Выполняет Work Package A.
- Пишет WORKER_2_REPORT.md.
- Создаёт WORKER_2_DONE.

### Agent 3 / Worker
- RAG preflight (worker).
- Выполняет Work Package B.
- Пишет WORKER_3_REPORT.md.
- Создаёт WORKER_3_DONE.

### Agent 4 / Reviewer
- Ждёт WORKER_2_DONE + WORKER_3_DONE.
- GSD discipline + RAG preflight (reviewer).
- Ревьюит обоих workers.
- Независимая валидация.
- REVIEW_PASS или CHANGES_REQUESTED.

## Work Split

### Agent 2 / Worker (Work Package A) — Локальный Mac Launcher
- Инспекция локальных скриптов Mac.
- Backup перед правками.
- Обновление локального launcher для поддержки 4 агентов.
- Сохранение split mode [1] и 3-window mode [2].
- Сохранение CID validation.
- Сохранение dry-run.
- Доказательство: один CID доходит до Agent 1/2/3/4.
- Отчёты: WORKER_2_REPORT.md, LOCAL_LAUNCHER_4_AGENT_AUDIT.md, LOCAL_LAUNCHER_FIXES_APPLIED.md (или NO_FIX_REQUIRED), CID_PROPAGATION_4_AGENT_LOCAL.md, LOCAL_DRY_RUN_RESULTS.md, LOCAL_VALIDATION_RESULTS.md.

### Agent 3 / Worker (Work Package B) — Server Tooling
- Инспекция серверных скриптов.
- Backup перед правками.
- Создание/обновление скриптов для 4-agent workflow:
  - `pm-agent4-reviewer-watch.sh` (новый)
  - `pm-agent-status.sh` (обновить для 4-agent)
  - `pm-agent-reset-stale.sh` (обновить для worker маркеров)
  - `pm-agents-server-tmux.sh` (4 окна/панели)
  - `install-processmap-agent-scripts.sh` (4-agent структура + `.agents/agent4-reviewer/`)
  - `pm-agent-mirror-report.sh` (знать о WORKER_*_DONE, REVIEW_REPORT.md)
- RAG preflight commands в сгенерированных prompt-файлах.
- Отчёты: WORKER_3_REPORT.md, SERVER_AGENT_4_WORKFLOW_AUDIT.md, SERVER_AGENT_FIXES_APPLIED.md (или NO_FIX_REQUIRED), AGENT4_REVIEWER_SCRIPT_REPORT.md, STATUS_SCRIPT_4_AGENT_REPORT.md, SERVER_VALIDATION_RESULTS.md.

## Local Launcher Migration Plan

Worker 2 отвечает за локальный Mac launcher.

Требуется:
1. Проверить `~/Desktop/ProcessMap Agents.command` — какой режим по умолчанию? Как передаёт CID?
2. Проверить `~/bin/processmap-iterm-agents.sh` — split pane mode [1]; сколько панелей?
3. Проверить `~/bin/processmap-iterm-agents-3windows.sh` — 3-window fallback [2]; должен стать 4-window или явно поддерживать 4 агента.
4. Проверить `~/bin/processmap-agent-pane.sh` — helper для pane management.
5. Добавить 4-го агента (Agent 4 / Reviewer) во все режимы запуска.
6. Сохранить CID validation (только `A-Za-z0-9_./-`).
7. Сохранить `PROCESSMAP_AGENTS_DRY_RUN=1` режим.
8. Сохранить opt-in `tmux kill`.
9. Доказать, что один CID передаётся всем 4 ролям.
10. Если локальный Mac недоступен — задокументировать и запросить команды у пользователя.

## Server Tooling Migration Plan

Worker 3 отвечает за серверные скрипты.

Требуется:
1. **pm-agent4-reviewer-watch.sh** (новый):
   - Ждёт `WORKER_2_DONE` + `WORKER_3_DONE`.
   - Ждёт `WORKER_2_REPORT.md` + `WORKER_3_REPORT.md`.
   - Генерирует prompt для Agent 4 Reviewer (English).
   - Запускает `kimi` интерактивно.
   - После exit делает mirror-report.

2. **pm-agent-status.sh** (обновить):
   - Добавить проверку `WORKER_2_DONE`, `WORKER_3_DONE`, `WORKER_2_REPORT.md`, `WORKER_3_REPORT.md`.
   - Добавить проверку Agent 4 маркеров (`REVIEW_REPORT.md`, `REVIEW_PASS`, `CHANGES_REQUESTED`).
   - Сохранить обратную совместимость со старыми маркерами.

3. **pm-agent-reset-stale.sh** (обновить при необходимости):
   - Добавить сброс `WORKER_2_STARTED` / `WORKER_3_STARTED` если нет соответствующих DONE.
   - Сохранить безопасные правила (не трогать DONE/REPORT).

4. **pm-agents-server-tmux.sh** (обновить):
   - Добавить окно/панель для Agent 4 Reviewer.
   - Обновить проверку наличия всех 4 скриптов.

5. **install-processmap-agent-scripts.sh** (обновить):
   - Создавать `.agents/agent4-reviewer/prompts` и `logs`.
   - Писать 4-agent скрипты (или сохранить 3-agent + добавить 4-й).

6. **pm-agent-mirror-report.sh** (обновить):
   - Добавить `WORKER_2_REPORT.md`, `WORKER_3_REPORT.md`, `REWORK_REQUEST.md` в allowlist.
   - Добавить новые маркеры: `WORKER_2_DONE`, `WORKER_3_DONE`.

7. **pm-agent1-planner.sh** (опционально обновить):
   - Генерируемый prompt должен знать о 4-agent workflow.
   - Сохранить обратную совместимость.

## Status/Reset/Mirror Plan

### Status Script
Должен показывать:
- Agent 1: READY_FOR_EXECUTION, PLAN.md
- Worker 2: WORKER_2_STARTED → WORKER_2_DONE, WORKER_2_REPORT.md
- Worker 3: WORKER_3_STARTED → WORKER_3_DONE, WORKER_3_REPORT.md
- Reviewer 4: REVIEW_STARTED → REVIEW_PASS / CHANGES_REQUESTED, REVIEW_REPORT.md
- RAG preflight artifacts
- run ids
- Старые маркеры (EXECUTION_STARTED, EXEC_REPORT.md, READY_FOR_REVIEW) — для совместимости

### Reset Script
Безопасные правила:
- Сбрасывать `*_STARTED` только если нет соответствующего `*_DONE` или `*_REPORT.md`.
- Никогда не удалять `REVIEW_PASS`, `CHANGES_REQUESTED`, `WORKER_2_DONE`, `WORKER_3_DONE`.

### Mirror Script
Allowlist должен включать:
- PLAN.md, WORKER_2_PROMPT.md, WORKER_3_PROMPT.md, REVIEWER_PROMPT.md
- WORKER_2_REPORT.md, WORKER_3_REPORT.md, REVIEW_REPORT.md
- REWORK_REQUEST.md, EXEC_BLOCKED.md, REVIEW_BLOCKED.md
- STATE.json, AGENT_RUN_ID, READY_FOR_EXECUTION, WORKER_2_DONE, WORKER_3_DONE
- READY_FOR_REVIEW, REVIEW_PASS, CHANGES_REQUESTED
- RAG_PREFLIGHT_PLANNER.md, RAG_PREFLIGHT_REVIEWER.md
- RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md

## Validation Plan

### Локальная валидация (Worker 2)
- `bash -n` для всех локальных скриптов.
- `PROCESSMAP_AGENTS_DRY_RUN=1` для main launcher.
- Split mode dry-run показывает 4 agent commands.
- 3-window/4-window dry-run показывает 4 agent commands.
- Невалидный CID отклоняется.
- Невалидный mode отклоняется.
- tmux kill остаётся opt-in.

### Серверная валидация (Worker 3)
- `bash -n` для всех серверных скриптов.
- `./tools/pm-agent-status.sh <CID>` показывает 4-agent states.
- Новый `pm-agent4-reviewer-watch.sh` проходит `bash -n`.
- RAG preflight CLI работает.
- Нет изменений в product runtime.
- Нет секретов в выводе.

### Agent 4 Reviewer валидация
- Оба WORKER_2_DONE и WORKER_3_DONE существуют.
- Оба worker-отчёта прочитаны.
- Независимая инспекция изменённых файлов.
- `bash -n` для локальных и серверных скриптов.
- Dry-run подтверждает 4 агента.
- CID propagation проверена.
- Маркерная модель проверена.
- Status output проверен.
- Product runtime не изменён.

## Acceptance Criteria

Agent 4 может выдать REVIEW_PASS только если:
1. Планинг-пак Agent 1 существует.
2. WORKER_2_PROMPT.md существует.
3. WORKER_3_PROMPT.md существует.
4. REVIEWER_PROMPT.md для Agent 4 существует.
5. Worker 2 завершён и создал WORKER_2_DONE.
6. Worker 3 завершён и создал WORKER_3_DONE.
7. Agent 4 ревьюил оба worker-выхода.
8. Same CID propagation к Agent 1/2/3/4 доказана.
9. Split mode [1] поддерживает 4 агентов.
10. 3-window/fallback mode поддерживает 4 агентов или явно стал 4-window fallback.
11. Dry-run доказывает конструкцию команд.
12. CID validation сохранена.
13. tmux kill остаётся opt-in.
14. Серверные скрипты запускаются из /opt/processmap-test.
15. Agent 4 reviewer script/path существует.
16. pm-agent-status показывает 4-agent status.
17. RAG preflight compatibility сохранена.
18. Нет изменений product runtime.
19. Нет изменений frontend/backend app.
20. Нет package install.
21. Нет секретов в отчётах.
22. Резервные копии существуют перед правками.
23. Документация/отчёты на русском.
24. Agent prompts на английском.

Нет REVIEW_PASS если:
- Любая роль mislabeled так, что workflow ломается.
- Agent 3 остаётся reviewer в активном launcher/status flow.
- Agent 4 не может ревьюить обоих workers.
- Один worker lane может быть тихо пропущен.
- Локальный launcher не был инспектирован, но заявлен полный pass.
- Product runtime файлы изменены.

## Non-goals

Явные non-goals:
- Нет работы по Diagram performance.
- Нет Product Actions.
- Нет UI product changes.
- Нет RAG feature development.
- Нет MCP repair.
- Нет GSD repair.
- Нет backend/frontend runtime changes.
- Нет package install.
- Нет commit/push/PR.
- Нет stage/prod deploy.
- Нет secrets inspection.
- Нет редизайна iTerm UI за пределами 4-agent support.
- Нет удаления split mode [1].

## Agent 2 / Worker Plan

См. `WORKER_2_PROMPT.md` (English).

Кратко:
- Инспекция локальных Mac launcher файлов.
- Backup.
- Миграция на 4-agent: добавить Agent 4 pane/window во все режимы.
- Сохранить CID validation, dry-run, tmux kill opt-in.
- Доказать CID propagation.
- Отчёты на русском.

## Agent 3 / Worker Plan

См. `WORKER_3_PROMPT.md` (English).

Кратко:
- Инспекция серверных скриптов.
- Backup.
- Создание/обновление скриптов для 4-agent workflow.
- Новый `pm-agent4-reviewer-watch.sh`.
- Обновление `pm-agent-status.sh`, `pm-agent-reset-stale.sh`, `pm-agents-server-tmux.sh`, `install-processmap-agent-scripts.sh`, `pm-agent-mirror-report.sh`.
- RAG preflight commands в prompts.
- Отчёты на русском.

## Agent 4 / Reviewer Plan

См. `REVIEWER_PROMPT.md` (English).

Кратко:
- Ждать WORKER_2_DONE + WORKER_3_DONE.
- GSD discipline + RAG preflight.
- Читать оба worker-отчёта.
- Независимая инспекция.
- `bash -n`, dry-run, CID propagation, marker model, status output.
- Product runtime unchanged, no secrets.
- REVIEW_PASS или CHANGES_REQUESTED.

## Risks

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Локальный Mac недоступен для Worker 2 | Высокая | Среднее | LOCAL_MAC_CHECKLIST.md; запросить у пользователя вывод команд |
| Старый 3-agent workflow сломается при обновлении | Средняя | Высокое | Сохранить обратную совместимость; не удалять старые маркеры |
| Agent 4 reviewer script конфликтует со старым Agent 3 reviewer | Низкая | Высокое | Новое имя `pm-agent4-reviewer-watch.sh`; старое `pm-agent3-reviewer-watch.sh` оставить как legacy или переименовать в worker |
| CID propagation сломается при добавлении 4-го агента | Низкая | Высокое | Dry-run validation; explicit echo CID в каждом скрипте |
| tmux session конфликт при 4 окнах | Низкая | Среднее | Тестировать `tmux new-window` / `select-window` |

## Gates

### Gate 1 — Agent 1 Planning Complete
- [x] PLAN.md
- [x] WORKER_2_PROMPT.md
- [x] WORKER_3_PROMPT.md
- [x] REVIEWER_PROMPT.md
- [x] STATE.json
- [x] AGENT_RUN_ID
- [x] READY_FOR_EXECUTION

### Gate 2 — Worker 2 Complete
- [ ] WORKER_2_STARTED (опционально)
- [ ] WORKER_2_REPORT.md
- [ ] WORKER_2_DONE
- [ ] LOCAL_LAUNCHER_4_AGENT_AUDIT.md
- [ ] LOCAL_LAUNCHER_FIXES_APPLIED.md или LOCAL_LAUNCHER_NO_FIX_REQUIRED.md
- [ ] CID_PROPAGATION_4_AGENT_LOCAL.md
- [ ] LOCAL_DRY_RUN_RESULTS.md
- [ ] LOCAL_VALIDATION_RESULTS.md

### Gate 3 — Worker 3 Complete
- [ ] WORKER_3_STARTED (опционально)
- [ ] WORKER_3_REPORT.md
- [ ] WORKER_3_DONE
- [ ] SERVER_AGENT_4_WORKFLOW_AUDIT.md
- [ ] SERVER_AGENT_FIXES_APPLIED.md или SERVER_AGENT_NO_FIX_REQUIRED.md
- [ ] AGENT4_REVIEWER_SCRIPT_REPORT.md
- [ ] STATUS_SCRIPT_4_AGENT_REPORT.md
- [ ] SERVER_VALIDATION_RESULTS.md

### Gate 4 — Agent 4 Review Complete
- [ ] REVIEW_REPORT.md
- [ ] REVIEW_PASS или CHANGES_REQUESTED
- [ ] Если CHANGES_REQUESTED — REWORK_REQUEST.md

---

**Agent 1 / Planner завершил планирование.**
**Contour**: tooling/processmap-agents-4-agent-workflow-migration-v1
**Run ID**: 20260517T000255Z-41876
**Status**: READY_FOR_EXECUTION
