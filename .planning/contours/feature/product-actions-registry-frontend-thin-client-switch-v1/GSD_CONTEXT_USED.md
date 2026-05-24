# GSD_CONTEXT_USED

Статус: `OK`

Проверка:

- `gsd` wrapper найден: `/opt/processmap-test/bin/gsd`.
- Skills доступны на сервере.
- План создан с bounded scope, acceptance criteria, STATE.json и отдельными worker prompts.

Ограничение:

- `gsd` usage probe выводит справку с exit code 1 при запуске без команды; это не блокирует planning pack.

Правило:

- Agent 1 не меняет product code.
- Worker 3 независим от Worker 2.
- Только Agent 4 ждет оба worker markers.
