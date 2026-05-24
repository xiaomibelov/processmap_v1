# LOCAL_DRY_RUN_RESULTS — Результаты dry-run

## Статус
Фактический dry-run на Mac **не выполнен** — локальные файлы отсутствуют на сервере.

## Среда
- **Хост:** `clearvestnic.ru` (Linux)
- **Дата:** 2026-05-17T00:50:43+00:00
- **Локальные файлы:** все 4 файла отсутствуют

## Ожидаемые результаты dry-run (спецификация)

### Test A: Split mode dry-run
**Команда (Mac):**
```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" "tooling/test-cid-v1"
```

**Ожидаемый вывод:**
```
[Dry-run] A1: processmap-agent-pane.sh 1 tooling/test-cid-v1
[Dry-run] A2: processmap-agent-pane.sh 2 tooling/test-cid-v1
[Dry-run] A3: processmap-agent-pane.sh 3 tooling/test-cid-v1
[Dry-run] A4: processmap-agent-pane.sh 4 tooling/test-cid-v1
```

**Ожидаемый exit code:** 0

---

### Test B: Fallback mode dry-run
**Команда (Mac):**
```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents-3windows.sh" "tooling/test-cid-v1"
```

**Ожидаемый вывод:**
```
[Dry-run] A1: processmap-agent-pane.sh 1 tooling/test-cid-v1
[Dry-run] A2: processmap-agent-pane.sh 2 tooling/test-cid-v1
[Dry-run] A3: processmap-agent-pane.sh 3 tooling/test-cid-v1
[Dry-run] A4: processmap-agent-pane.sh 4 tooling/test-cid-v1
```

**Ожидаемый exit code:** 0

---

### Test C: CID rejection (split mode)
**Команда (Mac):**
```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" "bad cid"
```

**Ожидаемый вывод:**
```
ERROR: invalid contour id: bad cid
Allowed characters: A-Z a-z 0-9 _ - / .
```

**Ожидаемый exit code:** 2

---

### Test D: Main launcher dry-run
**Команда (Mac):**
```bash
printf '\n1\nn\n\n' | PROCESSMAP_DEFAULT_CID=tooling/test-cid-v1 PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/Desktop/ProcessMap Agents.command"
```

**Ожидаемый вывод:**
```
=== ProcessMap Agents Launcher ===
Using default CID: tooling/test-cid-v1
Mode: [1] split panes  [2] multi-window fallback: 1
Kill existing tmux session 'processmap-agents'? [y/N]: n
[Dry-run] Would run: /Users/mac/bin/processmap-iterm-agents.sh "tooling/test-cid-v1"
```

**Ожидаемый exit code:** 0

---

### Test E: Pane helper dry-run (Agent 4)
**Команда (Mac):**
```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-agent-pane.sh" 4 "tooling/test-cid-v1"
```

**Ожидаемый вывод:**
```
[Dry-run] A4: /opt/processmap-test/tools/pm-agent4-reviewer-watch.sh "tooling/test-cid-v1"
```

**Ожидаемый exit code:** 0

## Server-side dry-run substitute

На сервере была проверена корректность server-side скриптов:

```bash
$ bash -n tools/pm-agent1-planner.sh
$ bash -n tools/pm-agent2-executor-watch.sh
$ bash -n tools/pm-agent3-reviewer-watch.sh
$ bash -n tools/pm-agent4-reviewer-watch.sh
```

**Результат:** Все 4 скрипта прошли `bash -n` без ошибок.

```bash
$ PROCESSMAP_AGENTS_DRY_RUN=1 bash -c 'source tools/pm-agent1-planner.sh tooling/test-cid-v1 2>/dev/null || true'
```

Server-side скрипты не поддерживают `PROCESSMAP_AGENTS_DRY_RUN` — это флаг только для Mac-стороны.

## Заключение

Фактические dry-run тесты на Mac **не проведены** из-за отсутствия локальных файлов.
Спецификации и ожидаемые результаты задокументированы выше.
При следующем ручном запуске на Mac необходимо выполнить тесты A–E и обновить этот файл.
