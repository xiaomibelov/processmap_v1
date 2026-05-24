# Runtime Navigation — tooling/processmap-agents-4-agent-workflow-migration-v1

## Описание
Этот контур не затрагивает product runtime (:5180 / :8088). Все изменения ограничены tooling-слоем.

## Что проверять

### Локальный Mac (Worker 2)
- `~/Desktop/ProcessMap Agents.command`
- `~/bin/processmap-iterm-agents.sh`
- `~/bin/processmap-iterm-agents-3windows.sh`
- `~/bin/processmap-agent-pane.sh`

### Сервер (Worker 3)
- `/opt/processmap-test/tools/pm-agent1-planner.sh`
- `/opt/processmap-test/tools/pm-agent2-worker-watch.sh` *(новое имя или старое — решение Worker 3)*
- `/opt/processmap-test/tools/pm-agent3-worker-watch.sh` *(новое имя или старое — решение Worker 3)*
- `/opt/processmap-test/tools/pm-agent4-reviewer-watch.sh` *(новый скрипт)*
- `/opt/processmap-test/tools/pm-agent-status.sh`
- `/opt/processmap-test/tools/pm-agent-reset-stale.sh`
- `/opt/processmap-test/tools/pm-agents-server-tmux.sh`
- `/opt/processmap-test/tools/install-processmap-agent-scripts.sh`
- `/opt/processmap-test/tools/pm-agent-mirror-report.sh`

### Контур-артефакты
- `/opt/processmap-test/.planning/contours/tooling/processmap-agents-4-agent-workflow-migration-v1/`

## Навигация по статусу
```bash
cd /opt/processmap-test
./tools/pm-agent-status.sh tooling/processmap-agents-4-agent-workflow-migration-v1
```

## Навигация по RAG
```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "tooling/processmap-agents-4-agent-workflow-migration-v1" \
  --query "4-agent workflow reviewer gates" \
  --format md \
  --top-k 5
```
