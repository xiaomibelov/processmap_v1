# LOCAL_LAUNCHER_NO_FIX_REQUIRED — Чек-лист правок для Mac

## Почему fix не применён
Agent 2 (Worker) запущен на сервере Linux (`clearvestnic.ru`). Локальные файлы Mac (`~/Desktop/ProcessMap Agents.command`, `~/bin/processmap-iterm-agents.sh` и т.д.) недоступны. Прямые правки невозможны.

## Что нужно сделать на локальном Mac

### Перед правками (Backup)
Для каждого файла создать резервную копию:
```bash
cp "$HOME/Desktop/ProcessMap Agents.command" "$HOME/Desktop/ProcessMap Agents.command.bak.$(date +%Y%m%d_%H%M%S)"
cp "$HOME/bin/processmap-iterm-agents.sh" "$HOME/bin/processmap-iterm-agents.sh.bak.$(date +%Y%m%d_%H%M%S)"
cp "$HOME/bin/processmap-iterm-agents-3windows.sh" "$HOME/bin/processmap-iterm-agents-3windows.sh.bak.$(date +%Y%m%d_%H%M%S)"
cp "$HOME/bin/processmap-agent-pane.sh" "$HOME/bin/processmap-agent-pane.sh.bak.$(date +%Y%m%d_%H%M%S)"
```

### 1. `~/Desktop/ProcessMap Agents.command`
- [ ] Обновить интерактивный prompt mode: добавить описание, что mode 1 = split (4 pane), mode 2 = 4-window.
- [ ] Убедиться, что mode validation принимает только `1` и `2`.
- [ ] Сохранить CID validation (`^[A-Za-z0-9_./-]+$`).
- [ ] Сохранить `PROCESSMAP_AGENTS_DRY_RUN=1` support.
- [ ] Сохранить opt-in `tmux kill-session`.

### 2. `~/bin/processmap-iterm-agents.sh` (Split Mode)
- [ ] Добавить 4-ю панель `A4-reviewer` после A1/A2/A3.
- [ ] Сохранить существующую логику `osascript` split.
- [ ] В dry-run печатать 4 команды с одним и тем же CID.
- [ ] Пример dry-run output:
```
[Dry-run] A1: processmap-agent-pane.sh 1 tooling/processmap-agents-4-agent-workflow-migration-v1
[Dry-run] A2: processmap-agent-pane.sh 2 tooling/processmap-agents-4-agent-workflow-migration-v1
[Dry-run] A3: processmap-agent-pane.sh 3 tooling/processmap-agents-4-agent-workflow-migration-v1
[Dry-run] A4: processmap-agent-pane.sh 4 tooling/processmap-agents-4-agent-workflow-migration-v1
```

### 3. `~/bin/processmap-iterm-agents-3windows.sh` (3-Window → 4-Window)
- [ ] Либо добавить 4-е окно iTerm и переименовать скрипт/комментарии в `4-window`.
- [ ] Либо разделить одно из окон на 2 pane (например, окно 3: A3 сверху, A4 снизу).
- [ ] Ключевое требование: Agent 4 должен иметь **выделенный видимый контекст**.
- [ ] В dry-run печатать 4 команды.

### 4. `~/bin/processmap-agent-pane.sh` (Pane Helper)
- [ ] Добавить case/branches для `AGENT=4` → роль `A4-reviewer`.
- [ ] Проверять существование `pm-agent4-reviewer-watch.sh` на сервере (или добавить TODO-комментарий до момента создания скрипта Worker 3).
- [ ] Генерировать prompt для Agent 4 на английском:
  - Ожидать `WORKER_2_DONE` + `WORKER_3_DONE`.
  - Ожидать `WORKER_2_REPORT.md` + `WORKER_3_REPORT.md`.
  - Выполнить RAG preflight с `--role reviewer`.
- [ ] Сохранить CID validation.
- [ ] Сохранить `cd /opt/processmap-test`.

### 5. CID Validation (все скрипты)
- [ ] Разрешённые символы: `A-Z a-z 0-9 _ - / .`
- [ ] Невалидный CID должен отклоняться с `rc=2` и сообщением об ошибке.
- [ ] Один и тот же CID должен передаваться во все 4 вызова.

### 6. tmux Kill (opt-in)
- [ ] Оставить `tmux kill-session -t processmap-agents` opt-in.
- [ ] Не делать автоматическим по умолчанию.

## После правок — валидация
```bash
bash -n "$HOME/Desktop/ProcessMap Agents.command"
bash -n "$HOME/bin/processmap-iterm-agents.sh"
bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh"
bash -n "$HOME/bin/processmap-agent-pane.sh"

PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" "tooling/test-cid-v1"
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents-3windows.sh" "tooling/test-cid-v1"

PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" "bad cid"  # должен отклонить
```

## Результат
После применения чек-листа:
1. Переименовать этот файл в `LOCAL_LAUNCHER_FIXES_APPLIED.md`.
2. Записать пути бэкапов и summary diff-ов.
3. Запустить `bash -n` и dry-run; сохранить вывод.
4. Создать `WORKER_2_DONE`.
