# LOCAL_VALIDATION_RESULTS — Результаты валидации локального launcher

## Статус
**Неполный** — локальный Mac недоступен. Часть проверок выполнена опосредованно на основе данных предыдущего контура.

## Что удалось проверить

### Source Truth (сервер)
```
pwd:      /opt/processmap-test
whoami:   root
hostname: clearvestnic.ru
date:     2026-05-17T00:18:28+00:00
```

### Доступность локальных файлов
```
~/Desktop/ProcessMap Agents.command          — НЕ НАЙДЕН
~/bin/processmap-iterm-agents.sh             — НЕ НАЙДЕН
~/bin/processmap-iterm-agents-3windows.sh    — НЕ НАЙДЕН
~/bin/processmap-agent-pane.sh               — НЕ НАЙДЕН
```

## Что не удалось проверить (требуется Mac)

### bash -n (статический синтаксис)
- [ ] `bash -n "$HOME/Desktop/ProcessMap Agents.command"`
- [ ] `bash -n "$HOME/bin/processmap-iterm-agents.sh"`
- [ ] `bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh"`
- [ ] `bash -n "$HOME/bin/processmap-agent-pane.sh"`

### Mode selection
- [ ] Mode `1` (split) запускает 4 pane.
- [ ] Mode `2` (4-window) запускает 4 окна/контекста.
- [ ] Mode `3` отклонён.

### Invalid CID rejection
- [ ] `PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" 'bad cid'` → ожидается rc=2.
- [ ] `PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents-3windows.sh" 'bad cid'` → ожидается rc=2.

### Dry-run 4-agent
- [ ] Split mode dry-run показывает 4 команды с одинаковым CID.
- [ ] 4-window mode dry-run показывает 4 команды с одинаковым CID.

### tmux kill opt-in
- [ ] Запуск без подтверждения не убивает tmux session.

## Рекомендации
Все отмеченные `[ ]` пункты должны быть выполнены на локальном Mac после применения правок из `LOCAL_LAUNCHER_NO_FIX_REQUIRED.md`. Результаты следует записать в этот файл (перезаписать раздел «Что не удалось проверить» на «Проверено» с фактическими выводами команд).
