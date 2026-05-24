# LOCAL_LAUNCHER_4_AGENT_AUDIT — Аудит локального Mac launcher

## Статус
Локальный Mac недоступен с сервера. Данный аудит основан на результатах предыдущего контура `tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1` и плане текущего контура.

## Файлы

### 1. `~/Desktop/ProcessMap Agents.command`
**Текущее состояние (после аудита v1):**
- Нет жёстко зашитого дефолтного CID.
- CID берётся из `PROCESSMAP_DEFAULT_CID` или запрашивается интерактивно.
- Валидация CID: `^[A-Za-z0-9_./-]+$`.
- Валидация mode: только `1` или `2`.
- `tmux kill-session` требует явного подтверждения.
- Поддержка `PROCESSMAP_AGENTS_DRY_RUN=1`.
- Запускает `$HOME/bin/processmap-iterm-agents.sh` или `$HOME/bin/processmap-iterm-agents-3windows.sh`.

**Что уже поддерживает 4 агентов:**
- CID validation и dry-run инфраструктура агностична к количеству агентов.

**Что требует изменений:**
- Необходимо добавить mode `3` или переименовать mode `2` в «4-window».
- Либо сохранить mode `1` (split) и mode `2` (3-window → 4-window), явно обновив документацию внутри скрипта.
- При выборе mode `1` должно запускаться 4 панели (A1, A2, A3, A4-reviewer).
- При выборе mode `2` должно запускаться 4 окна (или 3 окна, где одно разделено на 2 панели).

### 2. `~/bin/processmap-iterm-agents.sh` (Split Mode)
**Текущее состояние (после аудита v1):**
- Использует `osascript` для управления iTerm.
- Создаёт split panes для A1, A2, A3.
- Вызывает `processmap-agent-pane.sh <agent_num> <CID>`.
- Поддерживает `PROCESSMAP_AGENTS_DRY_RUN`.

**Что требует изменений:**
- Добавить 4-ю панель `A4-reviewer`.
- Сохранить логику split layout (например, 2×2 или 3+1).
- Передавать `4` как аргумент в `processmap-agent-pane.sh`.

### 3. `~/bin/processmap-iterm-agents-3windows.sh` (3-Window Mode)
**Текущее состояние (после аудита v1):**
- Создаёт 3 окна iTerm.
- В каждом окне вызывает `processmap-agent-pane.sh`.
- Поддерживает `PROCESSMAP_AGENTS_DRY_RUN`.

**Что требует изменений:**
- Либо добавить 4-е окно (переименовать скрипт/режим в 4-window).
- Либо добавить Agent 4 в одно из существующих окон через split pane.
- Ключевое требование: **Agent 4 должен иметь выделенный видимый контекст**.

### 4. `~/bin/processmap-agent-pane.sh` (Pane Helper)
**Текущее состояние (после аудита v1):**
- Принимает `AGENT="$1"`, `CID="$2"`.
- Валидирует CID.
- Проверяет существование серверных скриптов.
- Генерирует prompt для Agent 1/2/3 с RAG preflight.
- Работает из `/opt/processmap-test`.

**Что требует изменений:**
- Добавить обработку `AGENT=4` → `A4-reviewer`.
- Генерировать prompt для Agent 4 / Reviewer (ожидание WORKER_2_DONE + WORKER_3_DONE).
- Убедиться, что серверный скрипт `pm-agent4-reviewer-watch.sh` существует (проверка в preflight).

## Рекомендуемые изменения

### Split Mode
```
A1-planner  | A2-worker
A3-worker   | A4-reviewer
```
Или любая другая раскладка, сохраняющая читаемость.

### 3-Window → 4-Window Mode
Варианты:
1. Два окна слева (A1, A2), два справа (A3, A4) — честный 4-window.
2. Три окна, где окно A3/A4 разделено на два pane.

### CID Validation
Сохранить текущую regex `^[A-Za-z0-9_./-]+$`. Распространить на все 4 вызова.

### Dry-Run
В dry-run режиме печатать 4 команды вместо 3:
```
[Dry-run] A1: processmap-agent-pane.sh 1 <CID>
[Dry-run] A2: processmap-agent-pane.sh 2 <CID>
[Dry-run] A3: processmap-agent-pane.sh 3 <CID>
[Dry-run] A4: processmap-agent-pane.sh 4 <CID>
```

## Зависимости от серверной части
- `pm-agent4-reviewer-watch.sh` должен существовать (создаётся Worker 3).
- `pm-agent-status.sh` должен показывать 4-agent статус (обновляется Worker 3).
