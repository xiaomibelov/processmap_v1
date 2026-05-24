# ProcessMap Agents Pipeline — Верхнеуровневая схема

## Архитектура потока данных

```
+-----------------------------------------------------------------------------+
|  MAC (локальная машина пользователя)                                        |
|                                                                             |
|  +------------------------+     +--------------------------------------+    |
|  | ProcessMap Agents.cmd  |---->|  processmap-iterm-agents.sh          |    |
|  | (интерактивный лаунчер)|     |  (спавнит iTerm panes/windows)       |    |
|  +------------------------+     +--------------------------------------+    |
|              |                                    |                         |
|              | state file                         | по одному на агента     |
|              v                                    v                         |
|  +------------------------+     +--------------------------------------+    |
|  | ~/.processmap-agents-  |     |  processmap-agent-pane.sh            |    |
|  | launcher.env           |     |  (per-agent SSH wrapper)             |    |
|  +------------------------+     |                                      |    |
|                                 |  - mkdir remote run-state            |    |
|                                 |  - scp upload script                 |    |
|                                 |  - ssh -tt execute                   |    |
|                                 +--------------------------------------+    |
|                                                  |                          |
+--------------------------------------------------+--------------------------+
                                                   |
                                                   v SSH
+-----------------------------------------------------------------------------+
|  UBUNTU SERVER (clearvestnic.ru)                                            |
|                                                                             |
|  +---------------------------------------------------------------------+    |
|  |  RUN STATE: ~/.agents/run-state/<RUN_ID>/                           |    |
|  |  - scripts/agent-1-xxx.sh                                           |    |
|  |  - scripts/agent-2-xxx.sh                                           |    |
|  |  - rag/RAG_BASE_CONTEXT.json (shared)                               |    |
|  |  - kimi-agent-N-<ts>.log                                            |    |
|  +---------------------------------------------------------------------+    |
|                              |                                              |
|         +--------------------+--------------------+                         |
|         v                    v                    v                         |
|  +-------------+      +-------------+      +-------------+                  |
|  |  AGENT 1    |      |  AGENT 2    |      |  AGENT 3    |                  |
|  |  Planner    |      |  Executor   |      |  Executor   |                  |
|  |  (kimi)     |      |  Part 1     |      |  Part 2     |                  |
|  |             |      |  (kimi)     |      |  (kimi)     |                  |
|  | Читает:     |      |             |      |             |                  |
|  | - contour   |      | Читает:     |      | Читает:     |                  |
|  | - RAG       |      | - PLAN.md   |      | - PLAN.md   |                  |
|  | - Obsidian  |      | - RAG base  |      | - Part 1    |                  |
|  | - GSD       |      |   context   |      |   report    |                  |
|  |             |      |             |      |             |                  |
|  | Пишет:      |      | Пишет:      |      | Пишет:      |                  |
|  | - PLAN.md   |----->| - код       |----->| - код       |                  |
|  | - PROMPT'ы  |      | - отчёт     |      | - merge     |                  |
|  | - READY_FOR |      | - READY_FOR |      | - READY_FOR |                  |
|  |   EXECUTION |      |   MERGE_P1  |      |   MERGE_P2  |                  |
|  +-------------+      +-------------+      +-------------+                  |
|         |                    |                    |                         |
|         +--------------------+--------------------+                         |
|                              v                                              |
|                       +-------------+                                       |
|                       |  AGENT 4    |                                       |
|                       |  Reviewer   |                                       |
|                       |  (kimi)     |                                       |
|                       |             |                                       |
|                       | Читает:     |                                       |
|                       | - EXEC_REPORT                                     |
|                       | - code diffs|                                       |
|                       |             |                                       |
|                       | Пишет:      |                                       |
|                       | - REVIEW_PASS                                     |
|                       | - CHANGES_REQUESTED                               |
|                       +-------------+                                       |
|                                                                             |
+-----------------------------------------------------------------------------+
```

## Маркеры синхронизации (state machine)

| Маркер | Кто пишет | Кто ждёт | Назначение |
|--------|-----------|----------|------------|
| READY_FOR_EXECUTION | Agent 1 | Agent 2,3 | План готов |
| EXECUTION_STARTED | Agent 2 | — | Предотвращает двойной запуск |
| READY_FOR_MERGE_PART_1 | Agent 2 | Agent 3 | Часть 1 готова |
| READY_FOR_MERGE_PART_2 | Agent 3 | — | Часть 2 готова |
| READY_FOR_REVIEW | Agent 3 | Agent 4 | На ревью |
| REVIEW_PASS | Agent 4 | — | Успешно |
| CHANGES_REQUESTED | Agent 4 | Agent 3 | Доработка |
| EXEC_BLOCKED.md | Any | All | Блокировка |

## Файлы артефактов

```
.planning/contours/<CID>/
  PLAN.md                          # Agent 1
  EXECUTOR_PART_1_PROMPT.md        # Agent 1 -> Agent 2
  EXECUTOR_PART_2_PROMPT.md        # Agent 1 -> Agent 3
  REVIEWER_PROMPT.md               # Agent 1 -> Agent 4
  RAG_PREFLIGHT_PLANNER.md         # Agent 1 (proof)
  OBSIDIAN_CONTEXT_USED.md         # Agent 1 (proof)
  GSD_CONTEXT_USED.md              # Agent 1 (proof)
  READY_FOR_EXECUTION              # Agent 1 (trigger)
  AGENT_RUN_ID                     # Agent 1 (run binding)
  EXEC_REPORT.md                   # Agent 2+3 (result)
  REVIEW_REPORT.md                 # Agent 4 (result)
```
