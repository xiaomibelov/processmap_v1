# SERVER_AGENT_4_WORKFLOW_AUDIT — Аудит серверных скриптов

## Контур
`tooling/processmap-agents-4-agent-workflow-migration-v1`

## Дата аудита
2026-05-17

## Скрипты и их состояние

### 1. `tools/pm-agent1-planner.sh`
- **Текущее поведение**: Генерирует prompt для Agent 1 / Planner. Создаёт `PLAN.md`, `EXECUTOR_PROMPT.md`, `REVIEWER_PROMPT.md`, `STATE.json`, `READY_FOR_EXECUTION`. Экспортирует GSD env vars.
- **4-agent поддержка**: Частичная. Теперь в generated prompt упоминается необходимость создавать `WORKER_2_PROMPT.md` и `WORKER_3_PROMPT.md` для 4-agent режима.
- **Что нужно было**: Добавить awareness о 4-agent workflow без ломания обратной совместимости.
- **Статус**: ✅ Обновлён.

### 2. `tools/pm-agent2-executor-watch.sh`
- **Текущее поведение**: Ждёт `READY_FOR_EXECUTION` + `EXECUTOR_PROMPT.md`. Генерирует prompt для Agent 2 / Executor. Запускает `kimi`.
- **4-agent поддержка**: В 4-agent workflow Agent 2 становится Worker (Work Package A). Скрипт остаётся без изменений, так как он запускается по старому триггеру `READY_FOR_EXECUTION`.
- **Что нужно было**: Не требовалось изменений для 4-agent.
- **Статус**: ✅ Без изменений, совместим.

### 3. `tools/pm-agent3-reviewer-watch.sh`
- **Текущее поведение**: Ждёт `READY_FOR_REVIEW` + `EXEC_REPORT.md`. Генерирует prompt для Agent 3 / Reviewer.
- **4-agent поддержка**: В 4-agent workflow этот скрипт остаётся как legacy reviewer, но теперь есть отдельный `pm-agent4-reviewer-watch.sh` для Agent 4. Старый скрипт можно оставить для 3-agent контуров.
- **Что нужно было**: Не изменять, сохранить backward compatibility.
- **Статус**: ✅ Без изменений, совместим.

### 4. `tools/pm-agent4-reviewer-watch.sh` (новый)
- **Текущее поведение**: Не существовал до этого контура.
- **4-agent поддержка**: Полная. Ждёт обоих workers, генерирует prompt для Agent 4, запускает `kimi`.
- **Статус**: ✅ Создан.

### 5. `tools/pm-agent-status.sh`
- **Текущее поведение**: Показывал только 3-agent маркеры.
- **4-agent поддержка**: Теперь показывает `WORKER_2_*`, `WORKER_3_*` маркеры и секцию **4-AGENT WORKFLOW STATUS**.
- **Статус**: ✅ Обновлён.

### 6. `tools/pm-agent-reset-stale.sh`
- **Текущее поведение**: Сбрасывал `EXECUTION_STARTED` и `REVIEW_STARTED` по safe rules.
- **4-agent поддержка**: Теперь сбрасывает `WORKER_2_STARTED` и `WORKER_3_STARTED` по аналогичным safe rules.
- **Статус**: ✅ Обновлён.

### 7. `tools/pm-agents-server-tmux.sh`
- **Текущее поведение**: Создавал 3 окна (A1-planner, A2-executor, A3-reviewer) + status.
- **4-agent поддержка**: Теперь создаёт 4 окна (A1-planner, A2-worker, A3-worker, A4-reviewer) + status. Проверяет наличие `pm-agent4-reviewer-watch.sh`.
- **Статус**: ✅ Обновлён.

### 8. `tools/install-processmap-agent-scripts.sh`
- **Текущее поведение**: Создавал структуру для 3 агентов.
- **4-agent поддержка**: Теперь создаёт `.agents/agent4-reviewer/`, включает `pm-agent4-reviewer-watch.sh` в установку, обновляет `AGENT_SCRIPTS_INSTALLED.md`.
- **Статус**: ✅ Обновлён.

### 9. `tools/pm-agent-mirror-report.sh`
- **Текущее поведение**: Миррорил ограниченный список файлов в Obsidian vault.
- **4-agent поддержка**: Allowlist расширен новыми worker/reviewer маркерами и отчётами.
- **Статус**: ✅ Обновлён.

## Обратная совместимость

Все старые маркеры (`READY_FOR_EXECUTION`, `EXECUTION_STARTED`, `EXEC_REPORT.md`, `READY_FOR_REVIEW`, `REVIEW_STARTED`, `REVIEW_REPORT.md`, `REVIEW_PASS`, `CHANGES_REQUESTED`) продолжают работать.
Если в контуре нет `WORKER_2_DONE` / `WORKER_3_DONE`, старый 3-agent flow не затронут.

## Рекомендации

1. В будущих контурах, использующих 4-agent workflow, Agent 1 должен создавать `WORKER_2_PROMPT.md` и `WORKER_3_PROMPT.md` вручную или через обновлённый planner prompt.
2. Старый `pm-agent3-reviewer-watch.sh` можно пометить как legacy для 3-agent контуров, но пока он полностью совместим.
3. `pm-agent-status.sh` теперь является единым источником truth для обеих моделей.
