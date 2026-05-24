# LOCAL_MAC_UNAVAILABLE — Локальный Mac недоступен

## Статус
**Локальный Mac недоступен** из текущего runtime (сервер Linux `clearvestnic.ru`).

## Доказательство
```
pwd:      /opt/processmap-test
whoami:   root
hostname: clearvestnic.ru
uname:    Linux clearvestnic.ru 6.8.0-111-generic
HOME:     /root
```

Проверка локальных файлов:
```
ls: cannot access '/root/Desktop': No such file or directory
ls: cannot access '/root/bin': No such file or directory
~/Desktop/ProcessMap Agents.command          — MISSING
~/bin/processmap-iterm-agents.sh             — MISSING
~/bin/processmap-iterm-agents-3windows.sh    — MISSING
~/bin/processmap-agent-pane.sh               — MISSING
```

## Ограничение
Agent 2 (Worker) запускается на сервере Linux. Он **не может напрямую**:
- Прочитать локальные файлы Mac.
- Применить правки на Mac.
- Выполнить `bash -n` для Mac-скриптов.
- Выполнить `osascript` (macOS-only).
- Запустить dry-run с iTerm.

## Митигация
1. В PLAN.md и WORKER_2_PROMPT.md содержатся **точные спецификации** ожидаемого содержимого каждого локального файла.
2. Agent 2 должен либо применить правки (если каким-то образом имеет доступ к Mac), либо задокументировать их в `LOCAL_LAUNCHER_FIXES_APPLIED.md` / `LOCAL_LAUNCHER_NO_FIX_REQUIRED.md`.
3. Agent 4 (Reviewer) должен проверить, что limitation задокументирован прозрачно, и **не выдавать REVIEW_PASS** если отчёт притворяется, что полная локальная валидация выполнена.

## Требования для полного прохождения контура
Для полного закрытия этого контура необходимо выполнить на локальном Mac:
1. Применить спецификации из планинг-пака.
2. Выполнить `bash -n` для всех 4 файлов.
3. Выполнить dry-run для split mode и fallback mode.
4. Убедиться, что CID передаётся одинаково всем 4 агентам.
5. Переименовать `LOCAL_MAC_UNAVAILABLE.md` в `LOCAL_MAC_VERIFIED.md` с фактическими выводами команд.
