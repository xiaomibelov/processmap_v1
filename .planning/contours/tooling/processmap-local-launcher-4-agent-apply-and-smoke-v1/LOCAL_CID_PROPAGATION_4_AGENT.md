# LOCAL_CID_PROPAGATION_4_AGENT — Доказательство передачи CID всем 4 агентам

## Цель
Доказать, что один и тот же CID передаётся от лаунчера к Agent 1, Agent 2, Agent 3 и Agent 4.

## Цепочка передачи CID

### Уровень 1: Main Launcher
```
~/Desktop/ProcessMap Agents.command
  → считывает CID (или берёт из PROCESSMAP_DEFAULT_CID)
  → валидирует: [[ "$CID" =~ ^[A-Za-z0-9_./-]+$ ]]
  → передаёт в выбранный helper script как единственный аргумент
```

### Уровень 2: Helper Scripts (Split / Fallback)
```
~/bin/processmap-iterm-agents.sh "$CID"
  → валидирует CID той же regex
  → вызывает 4 раза: processmap-agent-pane.sh <N> "$CID"

~/bin/processmap-iterm-agents-3windows.sh "$CID"
  → валидирует CID той же regex
  → вызывает 4 раза: processmap-agent-pane.sh <N> "$CID"
```

### Уровень 3: Pane Helper
```
~/bin/processmap-agent-pane.sh <agent-number> "$CID"
  → валидирует CID той же regex
  → запускает server-side скрипт с тем же "$CID"
```

### Уровень 4: Server-Side Watchers
```
tools/pm-agent1-planner.sh "$CID"
tools/pm-agent2-executor-watch.sh "$CID"
tools/pm-agent3-reviewer-watch.sh "$CID"
tools/pm-agent4-reviewer-watch.sh "$CID"
  → каждый валидирует CID: ^[A-Za-z0-9_./-]+$
  → каждый использует CID для построения путей:
    DIR="$ROOT/.planning/contours/$CID"
    PROMPT=".../${CID//\//__}-..."
```

## Доказательство идентичности

Во всех 4 вызовах на уровне 2 используется **одна и та же переменная `$CID`**:
```bash
processmap-agent-pane.sh 1 "$CID"
processmap-agent-pane.sh 2 "$CID"
processmap-agent-pane.sh 3 "$CID"
processmap-agent-pane.sh 4 "$CID"
```

Нет переопределения, нет модификации, нет подстановки через eval без кавычек.

## Dry-run proof (ожидаемый вывод на Mac)

```
$ PROCESSMAP_AGENTS_DRY_RUN=1 ~/bin/processmap-iterm-agents.sh "tooling/test-cid-v1"
[Dry-run] A1: processmap-agent-pane.sh 1 tooling/test-cid-v1
[Dry-run] A2: processmap-agent-pane.sh 2 tooling/test-cid-v1
[Dry-run] A3: processmap-agent-pane.sh 3 tooling/test-cid-v1
[Dry-run] A4: processmap-agent-pane.sh 4 tooling/test-cid-v1
```

Во всех 4 строках CID идентичен: `tooling/test-cid-v1`.

## Server-side proof (выполнено на сервере)

Проверка server-side скриптов:
```bash
$ grep -n 'CID="' tools/pm-agent1-planner.sh tools/pm-agent2-executor-watch.sh tools/pm-agent3-reviewer-watch.sh tools/pm-agent4-reviewer-watch.sh
tools/pm-agent1-planner.sh:5:CID="${1:?Usage: pm-agent1-planner.sh <contour-id>}"
tools/pm-agent2-executor-watch.sh:5:CID="${1:?Usage: pm-agent2-executor-watch.sh <contour-id>}"
tools/pm-agent3-reviewer-watch.sh:5:CID="${1:?Usage: pm-agent3-reviewer-watch.sh <contour-id>}"
tools/pm-agent4-reviewer-watch.sh:5:CID="${1:?Usage: pm-agent4-reviewer-watch.sh <contour-id>}"
```

Все 4 скрипта используют одинаковый паттерн: `CID="${1:?...}"`.
Все 4 валидируют CID через `^[A-Za-z0-9_./-]+$`.

## Заключение

CID проходит через 4 уровня без изменений:
1. Launcher → helper (1 аргумент)
2. Helper → pane helper (передаётся как `$2`, но та же строка)
3. Pane helper → server script (передаётся как `$1`)
4. Server script → prompt/log пути (используется как есть)

**Вердикт:** CID propagation для 4-agent workflow **гарантирована спецификацией**.
Фактическое подтверждение на Mac требуется при следующем ручном запуске.
