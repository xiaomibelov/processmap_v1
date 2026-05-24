# RUNTIME_NAVIGATION — Навигация по runtime

## Контур
`tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1`

## Локальные файлы (Mac)
- `~/Desktop/ProcessMap Agents.command` — главный launcher
- `~/bin/processmap-iterm-agents.sh` — split pane mode [1]
- `~/bin/processmap-iterm-agents-3windows.sh` — multi-window fallback mode [2]
- `~/bin/processmap-agent-pane.sh` — shared pane helper

## Серверные файлы (cross-check only)
- `/opt/processmap-test/tools/pm-agent1-planner.sh`
- `/opt/processmap-test/tools/pm-agent2-executor-watch.sh`
- `/opt/processmap-test/tools/pm-agent3-reviewer-watch.sh`
- `/opt/processmap-test/tools/pm-agent4-reviewer-watch.sh`
- `/opt/processmap-test/tools/pm-agent-status.sh`
- `/opt/processmap-test/tools/pm-agent-reset-stale.sh`
- `/opt/processmap-test/tools/pm-agents-server-tmux.sh`

## Директория контура
`/opt/processmap-test/.planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/`

## RAG preflight
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role <planner|executor|reviewer> \
  --contour "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" \
  --area "local Mac launcher 4-agent workflow" \
  --format md --top-k 10
```

## Status
```bash
./tools/pm-agent-status.sh "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1"
```

## Важные заметки
- Локальный Mac недоступен из серверного runtime.
- Agent 2 работает с локальными файлами (если доступны) или документирует limitation.
- Agent 3 работает только с серверными скриптами.
- Agent 4 ревьюит обоих.
