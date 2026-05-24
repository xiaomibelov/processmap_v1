# LOCAL_DRY_RUN_RESULTS — Результаты dry-run локального launcher

## Статус
**Недоступно** — локальный Mac не доступен с сервера Linux.

## Почему dry-run не выполнен
Agent 2 запущен на `clearvestnic.ru` (Linux). Локальные файлы (`~/Desktop/ProcessMap Agents.command`, `~/bin/processmap-iterm-agents.sh`, `~/bin/processmap-iterm-agents-3windows.sh`, `~/bin/processmap-agent-pane.sh`) физически отсутствуют в `$HOME` сервера.

## Что ожидается от dry-run (Target)

### Split mode
```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" "tooling/test-cid-v1"
```
Ожидаемый вывод:
```
[Dry-run] A1: processmap-agent-pane.sh 1 tooling/test-cid-v1
[Dry-run] A2: processmap-agent-pane.sh 2 tooling/test-cid-v1
[Dry-run] A3: processmap-agent-pane.sh 3 tooling/test-cid-v1
[Dry-run] A4: processmap-agent-pane.sh 4 tooling/test-cid-v1
```

### 4-window mode
```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents-3windows.sh" "tooling/test-cid-v1"
```
Ожидаемый вывод:
```
[Dry-run] A1: processmap-agent-pane.sh 1 tooling/test-cid-v1
[Dry-run] A2: processmap-agent-pane.sh 2 tooling/test-cid-v1
[Dry-run] A3: processmap-agent-pane.sh 3 tooling/test-cid-v1
[Dry-run] A4: processmap-agent-pane.sh 4 tooling/test-cid-v1
```

### Main launcher
```bash
printf '\n1\nn\n\n' | PROCESSMAP_DEFAULT_CID=tooling/test-cid-v1 PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/Desktop/ProcessMap Agents.command"
```
Ожидается: rc=0, 4 команды с CID, iTerm не открывается.

## Инструкция для пользователя
После применения правок на Mac:
1. Запустить команды выше.
2. Сохранить реальный вывод в этот файл (перезаписать).
3. Убедиться, что CID `tooling/test-cid-v1` присутствует во всех 4 строках.
