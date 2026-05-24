# STATUS_SCRIPT_4_AGENT_REPORT — pm-agent-status.sh в 4-agent режиме

## Контур
`tooling/processmap-agents-4-agent-workflow-migration-v1`

## Что изменилось

### Старый вывод (3-agent)
- Список файлов: `PLAN.md`, `EXECUTOR_PROMPT.md`, `REVIEWER_PROMPT.md`, `STATE.json`, `READY_FOR_EXECUTION`, `EXECUTION_STARTED`, `EXEC_REPORT.md`, `READY_FOR_REVIEW`, `REVIEW_STARTED`, `REVIEW_REPORT.md`, `REVIEW_PASS`, `CHANGES_REQUESTED` и др.
- Без явной секции workflow status.

### Новый вывод (4-agent + backward compatible)
- Расширенный список файлов, включающий:
  - `WORKER_2_PROMPT.md`, `WORKER_3_PROMPT.md`
  - `WORKER_2_STARTED`, `WORKER_2_REPORT.md`, `WORKER_2_DONE`
  - `WORKER_3_STARTED`, `WORKER_3_REPORT.md`, `WORKER_3_DONE`
  - `RAG_PREFLIGHT_WORKER_3.md`
- Новая секция:
```
=== 4-AGENT WORKFLOW STATUS ===
Agent 1 (Planner):   READY ✅
Worker 2:            pending ·
Worker 3:            pending ·
Agent 4 (Reviewer):  pending ·
```
- Возможные состояния каждой роли:
  - `READY ✅` / `DONE ✅` / `PASS ✅`
  - `started ⏳`
  - `pending ·`
  - `CHANGES_REQUESTED ⚠️`

## Backward Compatibility

Если в контуре **нет** `WORKER_2_DONE` / `WORKER_3_DONE`:
- Секция 4-AGENT WORKFLOW STATUS покажет "pending ·" для Worker 2/3 и Agent 4.
- Старые маркеры (`READY_FOR_REVIEW`, `EXEC_REPORT.md`, `REVIEW_PASS`) продолжают отображаться как раньше.
- Старые контуры не сломаны.

## Пример вывода для текущего контура

```
=== CONTOUR ===
tooling/processmap-agents-4-agent-workflow-migration-v1
/opt/processmap-test/.planning/contours/tooling/processmap-agents-4-agent-workflow-migration-v1

✅ PLAN.md
✅ WORKER_2_PROMPT.md
✅ WORKER_3_PROMPT.md
✅ REVIEWER_PROMPT.md
...
✅ READY_FOR_EXECUTION
·  EXECUTION_STARTED
·  WORKER_2_STARTED
✅ WORKER_2_REPORT.md
·  WORKER_2_DONE
·  WORKER_3_STARTED
·  WORKER_3_REPORT.md
·  WORKER_3_DONE
...

=== 4-AGENT WORKFLOW STATUS ===
Agent 1 (Planner):   READY ✅
Worker 2:            pending ·
Worker 3:            pending ·
Agent 4 (Reviewer):  pending ·
```

## Проверка
Команда:
```bash
./tools/pm-agent-status.sh "tooling/processmap-agents-4-agent-workflow-migration-v1"
```
Выполнена успешно, вывод соответствует ожидаемому формату.
