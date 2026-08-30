# PLAN — fix/admin-graphs-rebuild-fail

## Контур

- **type:** fix
- **name:** admin-graphs-rebuild-fail
- **branch:** `fix/admin-graphs-rebuild-fail`
- **base:** `origin/main` (`5d535d40`)
- **worktree:** `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/fix-admin-graphs-rebuild-fail`
- **Предыдущий контур:** `fix/admin-graphs-stage-bootstrap` (PR #870, смержен).

## Проблема

После merge PR #870 первая реальная пересборка графа на stage упала:

- job id: `20260830-101035-254231`;
- лог обрывается через ~10 мс после строки `script=/app/tools/graphify-render-graph.py`;
- exit code: `1`;
- **stderr отсутствует в логе**;
- **статус завис на `running`** — не перешёл в `failed`.

Два независимых дефекта:

1. **Логирование stderr.** `subprocess.Popen(stderr=subprocess.STDOUT, ...)` в теории должен было перенаправить stderr в stdout, но в логе ошибки нет. Нужно гарантированно захватывать stdout + stderr и писать их в `rebuild.log`.
2. **Баг статуса.** При `exit code != 0` job должен переходить в `failed` с текстом ошибки. Сейчас статус может зависнуть в `running`, если подпроцесс падает до/во время чтения pipe, или если внутри `_rebuild_worker` есть путь, приводящий к молчаливому выходу.

## Цель

1. Исправить `_rebuild_worker` так, чтобы:
   - в лог попадали **и stdout, и stderr** скрипта;
   - в лог попадала **финальная строка с кодом выхода**;
   - при `exit code != 0` job гарантированно переходил в `failed` с понятным сообщением;
   - UI отображал `failed`, а не вечный `running`.
2. Покрыть сценарий не-нулевого exit code тестом.
3. Найти и устранить **корневую причину exit 1** на stage.
4. Если корневая причина — отсутствие входных файлов (`graph.json` / `.graphify_analysis.json`) или полного checkout, задокументировать в EXEC_REPORT вариант «сборка в CI/dev + публикация снапшота артефактом» и остановиться для вашего решения.

## План выполнения

### Phase 1 — Воспроизведение в Docker-образе

Собрать актуальный образ из `origin/main` и запустить скрипт руками внутри контейнера:

```bash
docker build -t processmap/rebuild-fail:test .
docker run --rm -it -e GRAPHS_DIR=/app/graphify-out processmap/rebuild-fail:test bash
# внутри контейнера:
ls -la /app/tools/
ls -la /app/graphify-out/
python3 /app/tools/graphify-render-graph.py --graph-dir /app/graphify-out --output /tmp/out.html
```

Ожидаемые гипотезы:
- (a) скрипт ждёт `graph.json` / `.graphify_analysis.json` в `--graph-dir`, а их нет;
- (b) не хватает import-зависимостей (помимо `networkx`);
- (c) нет прав на запись в `/app/graphify-out`;
- (d) скрипту нужен git/checkout-контекст, которого нет в stage-контейнере.

### Phase 2 — Исправление логирования и статуса

**Файл:** `backend/app/admin_graphs.py`, функция `_rebuild_worker`.

Заменить polling-цикл на `subprocess.run` с `capture_output=True` и `timeout=REBUILD_TIMEOUT_SECONDS`:

```python
proc = subprocess.run(
    cmd,
    capture_output=True,
    text=True,
    cwd=base_dir,
    timeout=REBUILD_TIMEOUT_SECONDS,
)
for line in proc.stdout.splitlines():
    _append_log(snapshot_id, line)
for line in proc.stderr.splitlines():
    _append_log(snapshot_id, f"[stderr] {line}")
_append_log(snapshot_id, f"[{_now_iso()}] exit code={proc.returncode}")
if proc.returncode != 0:
    _update_status(snapshot_id, "failed", error=f"rebuild exited with code {proc.returncode}")
    return
```

Преимущества:
- гарантированный захват stdout/stderr;
- таймаут через `subprocess.run(..., timeout=...)` — чистее и надёжнее ручного polling;
- исключение `subprocess.TimeoutExpired` обрабатывается в `try/except` и переводит статус в `timeout`;
- любое другое исключение внутри `_rebuild_worker` переводит статус в `failed`.

Дополнительно: обернуть весь `_rebuild_worker` в `try/except/finally`, чтобы даже при неожиданном падении статус обновлялся до `failed` (если ещё не финальный).

### Phase 3 — Тест на не-нулевой exit code

**Файл:** `backend/tests/test_admin_graphs.py`.

Добавить тест, который:
- подменяет `GRAPHS_DIR` на временную директорию;
- создаёт фейковый `graphify-render-graph.py`, выходящий с кодом `1` и печатающий сообщение в stderr;
- вызывает `start_rebuild()`;
- дожидается завершения (опрашивая `rebuild_status`);
- проверяет, что `status == "failed"`;
- проверяет, что в `log` есть строка из stderr;
- проверяет, что в `log` есть `exit code=1`.

### Phase 4 — Устранение корневой причины exit 1

После воспроизведения в Docker:

- Если причина — **отсутствие `graph.json` / `.graphify_analysis.json`**:
  - Вариант A: seed initial snapshot на stage из локальных артефактов (как планировалось в предыдущем контуре).
  - Вариант B: сделать скрипт более устойчивым (понятная ошибка + UI empty state уже есть), но это не решит проблему «граф устарел».
- Если причина — **недоступен полный checkout репозитория** в stage-контейнере:
  - Не костылить.
  - Задокументировать в EXEC_REPORT.md вариант «сборка в CI/dev + публикация снапшота артефактом».
  - Остановиться и ждать вашего решения.

### Phase 5 — Проверки

1. Локально:
   - `python -m pytest backend/tests/test_admin_graphs.py -v` — 13/13 OK (12 существующих + 1 новый).
   - `./scripts/update_openapi.sh` — 0 errors.
2. В Docker-образе:
   - ручной запуск скрипта показывает понятную ошибку;
   - rebuild job при ошибке переходит в `failed`.
3. На stage после deploy:
   - пересборка запускается через UI/API;
   - при отсутствии входных данных job падает с понятным сообщением (или создаётся seed-снапшот);
   - UI показывает `failed`, а не `running`.

## Acceptance criteria

- [ ] `_rebuild_worker` использует `subprocess.run` с `capture_output=True` и `timeout`.
- [ ] `rebuild.log` содержит stdout, stderr и строку `exit code=N`.
- [ ] При `exit code != 0` job переходит в `failed` с текстом ошибки.
- [ ] UI отображает failed-статус, а не вечный running.
- [ ] Добавлен backend-тест на не-нулевой exit code.
- [ ] Корневая причина exit 1 на stage воспроизведена и задокументирована.
- [ ] Если нужен полный checkout — в EXEC_REPORT.md описан вариант CI/dev + артефакт, работа остановлена для решения.
- [ ] `docs/openapi.yaml` актуален.
- [ ] PR на русском создан; merge/deploy — только по явному approve.

## Риски / блокеры

- Docker build занимает время; нужен BuildKit cache.
- Если скрипту требуется полный repo checkout, текущая stage-архитектура (deploy через git checkout в `/opt/processmap/app` + Docker-образ без исходников) может потребовать изменения пайплайна, а не backend-кода.
