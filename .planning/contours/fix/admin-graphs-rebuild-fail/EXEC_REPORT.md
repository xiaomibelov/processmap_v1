# EXEC_REPORT — fix/admin-graphs-rebuild-fail

## Диагностика

### Симптомы на stage

- job id: `20260830-101035-254231`;
- лог обрывается через ~10 мс после строки `script=/app/tools/graphify-render-graph.py`;
- exit code: `1`;
- stderr отсутствовал в логе;
- статус завис на `running`.

### Воспроизведение в Docker-образе

Собран образ из `origin/main` (`5d535d40`) с PR #870:

```bash
docker build -t processmap/rebuild-fail:test .
docker run --rm -e GRAPHS_DIR=/app/graphify-out processmap/rebuild-fail:test \
  python3 /app/tools/graphify-render-graph.py --graph-dir /app/graphify-out --output /tmp/out.html
```

Вывод:

```
Traceback (most recent call last):
  File "/app/tools/graphify-render-graph.py", line 1307, in <module>
    raise SystemExit(main())
                     ^^^^^^
  File "/app/tools/graphify-render-graph.py", line 1282, in main
    G, communities, _analysis = _load_graph_and_communities(graph_dir)
                                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/app/tools/graphify-render-graph.py", line 176, in _load_graph_and_communities
    raise FileNotFoundError(f"graph.json not found at {graph_path}")
FileNotFoundError: graph.json not found at /app/graphify-out/graph.json
EXIT:1
```

### Корневая причина exit 1

`graphify-render-graph.py` требует на вход `graph.json` и `.graphify_analysis.json` в `--graph-dir`. На stage директория `/app/graphify-out/` пуста, поэтому скрипт падает с `FileNotFoundError`.

Скрипт **не требует полного checkout репозитория** — только входные JSON-файлы. Это важно: проблема решается seed-ом существующего снапшота, а не переделкой архитектуры.

### Почему статус завис на running и stderr не попал в лог

В `backend/app/admin_graphs.py` использовался `subprocess.Popen` с ручным polling и `stderr=subprocess.STDOUT`. При быстром падении подпроцесса чтение `proc.stdout` могло не захватить stderr, а финальный код возврата не всегда корректно переводил статус в `failed`.

## Исправления

### backend/app/admin_graphs.py

- `_rebuild_worker` переписан на `subprocess.run(..., capture_output=True, timeout=...)`. Это гарантирует:
  - stdout и stderr пишутся в `rebuild.log`;
  - финальная строка `exit code=N` всегда присутствует;
  - при `exit code != 0` job переходит в `failed` с последней строкой stderr в сообщении;
  - при таймауте job переходит в `timeout` с partial stdout/stderr;
  - любое неожиданное исключение переводит job в `failed`.
- Убран неиспользуемый импорт `time`.

### backend/tests/test_admin_graphs.py

- Добавлен тест `test_rebuild_fails_with_nonzero_exit_code`:
  - подменяет `_resolve_render_script` на фейковый скрипт, выходящий с кодом `1`;
  - проверяет, что статус становится `failed`;
  - проверяет, что в логе есть `exit code=1`, `stderr-line`, `stdout-line`;
  - проверяет, что `error` непустое.

## Проверки

- Backend tests: `python -m pytest tests/test_admin_graphs.py -v` — **13 passed**.
- OpenAPI: `npx @redocly/cli lint docs/openapi.yaml` — **validated**.
- Docker image `processmap/rebuild-fail:test` собран; ручной запуск скрипта показывает понятную ошибку `graph.json not found`.

## Что остаётся

### 1. Deploy PR на stage

После merge этого PR образ на stage будет содержать исправленный `admin_graphs.py`. Пересборка через UI/API теперь не будет зависать в `running` — она будет падать в `failed` с сообщением `graph.json not found`, пока не появится seed.

### 2. Seed initial snapshot на stage

Чтобы первая пересборка на stage завершилась успешно, нужно положить в `/app/graphify-out/` файлы:

- `graph.json`
- `.graphify_analysis.json`

Источник: локальные артефакты из `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/feature-admin-graphs-tab/graphify-out/` (самые свежие).

Два варианта:

**Вариант A — быстрый seed вручную (рекомендуется для разблокировки stage):**

```bash
# На машине разработчика:
docker cp p0-work-worktrees/feature-admin-graphs-tab/graphify-out/graph.json processmap_stage-api-1:/app/graphify-out/graph.json
docker cp p0-work-worktrees/feature-admin-graphs-tab/graphify-out/.graphify_analysis.json processmap_stage-api-1:/app/graphify-out/.graphify_analysis.json

# Внутри контейнера:
docker exec -it processmap_stage-api-1 bash
mkdir -p /app/graphify-out/snapshots/20260830-000000-000000
python3 /app/tools/graphify-render-graph.py \
  --graph-dir /app/graphify-out \
  --output /app/graphify-out/snapshots/20260830-000000-000000/graph.html
cp /app/graphify-out/graph.json /app/graphify-out/snapshots/20260830-000000-000000/graph.json
cp /app/graphify-out/.graphify_analysis.json /app/graphify-out/snapshots/20260830-000000-000000/.graphify_analysis.json
cat > /app/graphify-out/snapshots/20260830-000000-000000/meta.json <<'EOF'
{
  "id": "20260830-000000-000000",
  "created_at": "2026-08-30T00:00:00+00:00",
  "commit_sha": "5d535d40",
  "commit_message": "manual seed after fix/admin-graphs-rebuild-fail",
  "is_current": false
}
EOF
cd /app/graphify-out/snapshots && ln -sfn 20260830-000000-000000 current
```

**Вариант B — сборка в CI/dev + публикация артефактом (sustainable):**

- graphify CLI (node) запускается в CI или dev-окружении, где есть полный checkout;
- генерируются `graph.json` + `.graphify_analysis.json`;
- артефакты публикуются как часть release/deployment (например, копируются в контейнер при deploy);
- stage/prod всегда получают готовые входные файлы, рендер выполняется внутри образа.

Этот вариант исключает необходимость держать node/graphify CLI в production-образе, но требует изменения deploy-пайплайна.

## Рекомендация

Сейчас скрипту не нужен полный checkout — нужны только входные JSON. Поэтому не требуется останавливаться для архитектурного решения. Рекомендуется:

1. Смержить этот PR (исправляет логирование и статус).
2. Засидировать первый снапшот на stage вручную (Вариант A).
3. В фоне запланировать Вариант B как отдельный контур по улучшению deploy-пайплайна.

## Acceptance criteria

- [x] `_rebuild_worker` использует `subprocess.run` с `capture_output=True` и `timeout`.
- [x] `rebuild.log` содержит stdout, stderr и строку `exit code=N`.
- [x] При `exit code != 0` job переходит в `failed` с текстом ошибки.
- [x] UI отображает failed-статус, а не вечный running.
- [x] Добавлен backend-тест на не-нулевой exit code.
- [x] Корневая причина exit 1 на stage воспроизведена и задокументирована.
- [x] `docs/openapi.yaml` актуален.
