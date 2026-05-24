# CID_PROPAGATION_4_AGENT_LOCAL — Распространение CID на 4 агентов (локальный launcher)

## Статус
Локальный Mac недоступен. Данный документ описывает ожидаемый путь распространения CID на основе предыдущего аудита и плана миграции.

## Ожидаемый путь (Target)

### Главный launcher
```text
ProcessMap Agents.command -> "$HOME/bin/processmap-iterm-agents.sh" "$CID"
ProcessMap Agents.command -> "$HOME/bin/processmap-iterm-agents-3windows.sh" "$CID"
```

### Split helper (4 pane)
```text
A1: processmap-agent-pane.sh 1 "$CID"
A2: processmap-agent-pane.sh 2 "$CID"
A3: processmap-agent-pane.sh 3 "$CID"
A4: processmap-agent-pane.sh 4 "$CID"
```

### 4-window helper
```text
A1: processmap-agent-pane.sh 1 "$CID"
A2: processmap-agent-pane.sh 2 "$CID"
A3: processmap-agent-pane.sh 3 "$CID"
A4: processmap-agent-pane.sh 4 "$CID"
```

### Shared pane helper
```text
AGENT="$1"
CID="$2"
cd "$ROOT" where ROOT=/opt/processmap-test
```

## Правила валидации CID
- Разрешённые символы: `A-Z a-z 0-9 _ - / .`
- Regex: `^[A-Za-z0-9_./-]+$`
- Невалидный CID отклоняется на уровне главного launcher и на уровне pane helper.

## Доказательство (ожидаемое)
Dry-run с `tooling/test-cid-v1` должен напечатать все 4 команды с идентичным CID:
```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" tooling/test-cid-v1
# Ожидаемый вывод:
# [Dry-run] A1: processmap-agent-pane.sh 1 tooling/test-cid-v1
# [Dry-run] A2: processmap-agent-pane.sh 2 tooling/test-cid-v1
# [Dry-run] A3: processmap-agent-pane.sh 3 tooling/test-cid-v1
# [Dry-run] A4: processmap-agent-pane.sh 4 tooling/test-cid-v1
```

## Текущий статус
- **Непроверено**: локальные скрипты недоступны для запуска.
- **Рекомендация**: после применения правок на Mac выполнить dry-run и приложить реальный вывод в `LOCAL_DRY_RUN_RESULTS.md`.

## Заметка о сервере
На сервере `pm-agent-status.sh` должен показывать один и тот же CID для всех агентов. Это проверяется Worker 3.
