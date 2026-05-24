# Локальный Mac — чек-лист инспекции

## Статус
- **Сервер**: clearvestnic.ru
- **Пользователь**: root
- **Доступ к локальному Mac**: **ОТСУТСТВУЕТ**
- **Причина**: Agent 1 запущен на сервере Linux, не на Mac. Пути `$HOME/Desktop` и `$HOME/bin` недоступны.

## Ожидаемые локальные файлы
Согласно контракту проекта, локальный запуск осуществляется через:

1. `~/Desktop/ProcessMap Agents.command`
2. `~/bin/processmap-iterm-agents.sh`
3. `~/bin/processmap-iterm-agents-3windows.sh`
4. `~/bin/processmap-agent-pane.sh`

## Чек-лист для Worker 2
Worker 2 должен выполнить следующие шаги на локальном Mac (или запросить у пользователя доступ):

- [ ] `ls -la "$HOME/Desktop" | grep -i "ProcessMap"`
- [ ] `ls -la "$HOME/bin" | grep -E "processmap|agent|iterm"`
- [ ] `sed -n '1,360p' "$HOME/Desktop/ProcessMap Agents.command"`
- [ ] `sed -n '1,420p' "$HOME/bin/processmap-iterm-agents.sh"`
- [ ] `sed -n '1,420p' "$HOME/bin/processmap-iterm-agents-3windows.sh"`
- [ ] `sed -n '1,420p' "$HOME/bin/processmap-agent-pane.sh"`
- [ ] `bash -n "$HOME/Desktop/ProcessMap Agents.command"`
- [ ] `bash -n "$HOME/bin/processmap-iterm-agents.sh"`
- [ ] `bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh"`
- [ ] `bash -n "$HOME/bin/processmap-agent-pane.sh"`

## Критично
Если Worker 2 не имеет доступа к локальному Mac:
- задокументировать это в `LOCAL_LAUNCHER_NO_FIX_REQUIRED.md`;
- или запросить у пользователя вывод указанных команд;
- или выполнить правки через серверные бэкапы/зеркала, если они существуют.

## Примечание
Локальные файлы не являются product runtime. Изменения в них разрешены в рамках этого контура.
