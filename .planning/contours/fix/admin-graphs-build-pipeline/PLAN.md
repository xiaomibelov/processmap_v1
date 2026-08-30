# PLAN — fix/admin-graphs-build-pipeline

## Контур

- **type:** fix
- **name:** admin-graphs-build-pipeline
- **branch:** `fix/admin-graphs-build-pipeline`
- **base:** `origin/main` (`7edec2c2`)
- **worktree:** `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/fix-admin-graphs-build-pipeline`
- **Предыдущие контуры:** `fix/admin-graphs-stage-bootstrap` (#870), `fix/admin-graphs-rebuild-fail` (#872).

## Проблема

Stage-контейнер `processmap_stage-api-1` не может самостоятельно произвести `graph.json`. Внутри репозитория `processmap_v1` есть только рендерер `tools/graphify-render-graph.py`, который требует на вход готовые `graph.json` + `.graphify_analysis.json`. Генератор этих файлов находится вне stage-контейнера (отдельный инструмент `graphify`).

Сейчас пересборка на stage падает:

```
rebuild failed: FileNotFoundError: graph.json not found at /app/graphify-out/graph.json
```

## Диагностика stage

См. `STAGE_DIAGNOSTIC.md`. Ключевые факты:

- `processmap_stage-api-1` работает на образе `processmap_stage-api:7edec2c24a7bf994c4f32690c2c838eafd33b7fe` (PR #872 уже развёрнут).
- `/app/graphify-out/` содержит только папку `snapshots/` с неудачными попытками rebuild.
- `/app/tools/` содержит только `graphify-render-graph.py` и `graphify-semantic-config.json`.
- Генератор `graph.json` в репозитории `processmap_v1` отсутствует.

## Выбор решения

**Вариант A — сборка вне stage + upload через admin API.**

Почему не Вариант B:
- Stage-контейнер не содержит checkout репозитория (host checkout `ffaaa38f` — старый).
- В образе нет node/graphify CLI.
- Добавление полноценной сборки внутрь образа увеличит его размер и время деплоя, а также потребует доступа к исходникам в production runtime.

Вариант A разделяет ответственность:
- **Сборка** выполняется в CI/dev, где есть checkout и graphify CLI.
- **Публикация** — через защищённый admin-эндпоинт, который принимает `graph.json` + `.graphify_analysis.json` и кладёт их в `/app/graphify-out/`.
- **Rebuild в UI** — запускает рендер HTML из уже загруженных JSON.

## Цель

1. Разблокировать stage сегодня: залить текущие локальные `graph.json` + `.graphify_analysis.json` и убедиться, что вьювер и аналитика работают.
2. Реализовать устойчивый pipeline:
   - `POST /api/admin/graphs/snapshots` — multipart upload двух JSON-файлов под admin-авторизацией, валидация контракта, сохранение в `graph-dir`.
   - Rebuild в UI = re-render из загруженных файлов.
   - Опциональный CI-триггер — через настраиваемый webhook URL (оставляем точку расширения, не реализуем полноценный CI integration в этом контуре).
3. Сохранить 403 для не-admin на всех admin-эндпоинтах.
4. Покрыть тестами.

## План выполнения

### Phase 1 — Быстрый seed на stage (✅ выполнен)

Скопированы локальные артефакты из `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/feature-admin-graphs-tab/graphify-out/`:

- `graph.json` (33M)
- `.graphify_analysis.json` (1.7M)

В контейнере `processmap_stage-api-1` создан снапшот `20260830-153424-048894`:

```
Loaded graph: 19954 nodes, 55681 edges, 1072 communities
Meta-graph: 1072 community nodes, 1754 cross-community edges
Trace 'create-and-open-session': 5 communities, 1 semantic edges
Trace 'save-diagram': 6 communities, 1 semantic edges
Trace 'ask-ai-agent': 3 communities, 1 semantic edges
Wrote /app/graphify-out/snapshots/20260830-153424-048894/graph.html
```

Symlink `/app/graphify-out/snapshots/current` обновлён.

**Осталось:** верификация через UI/API (требуется admin-авторизация; сделаем после реализации эндпоинта или по предоставленным кредам).

### Phase 2 — Backend API для upload

**Файл:** `backend/app/admin_graphs.py`

Добавить функцию `seed_snapshot_from_files(graph_json_bytes: bytes, analysis_json_bytes: bytes, commit_sha: str = "", commit_message: str = "") -> Dict[str, Any]`:

1. Валидировать `graph.json`: должен быть валидным JSON, содержать ключи `nodes` (list) и `links` или `edges` (list).
2. Валидировать `.graphify_analysis.json`: валидный JSON, содержать `raw_nodes`, `raw_edges`, `communities`.
3. Записать оба файла в `_graphs_dir()`.
4. Создать snapshot-директорию, скопировать файлы, запустить `graphify-render-graph.py` через `_rebuild_worker` (или отдельную функцию рендера).
5. Обновить symlink `current`.
6. Вернуть meta снапшота.

**Файл:** `backend/app/routers/admin.py`

Добавить:

```python
@router.post("/api/admin/graphs/snapshots")
def admin_graphs_upload_snapshot(
    request: Request,
    graph_json: UploadFile = File(...),
    analysis_json: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
) -> Any:
    ...
```

- Проверка прав через `_graphs_admin_check`.
- Чтение обоих файлов в память (лимит размера — FastAPI по умолчанию; для 35MB нужно убедиться, что лимит multipart достаточен, или потоково писать на диск).
- Вызов `seed_snapshot_from_files`.
- Возврат `GraphSnapshotOut`.

**Модели:**

- Добавить `GraphSnapshotUploadOut` или переиспользовать `GraphSnapshotOut`.

### Phase 3 — Frontend UI для upload

**Файлы:**
- `frontend/src/features/admin/pages/AdminGraphsPage.jsx`
- `frontend/src/features/admin/hooks/useAdminGraphsData.js`
- `frontend/src/lib/apiModules/adminApi.js`
- `frontend/src/shared/i18n/ru.js`

Добавить в `AdminGraphsPage` секцию «Загрузить снапшот»:

- Два input type="file": `graph.json`, `.graphify_analysis.json`.
- Кнопка «Загрузить».
- Сообщение об успехе/ошибке.
- Подсказка: «JSON-файлы производятся вне stage (CI/dev). Загрузите их, чтобы обновить граф.»

Добавить `apiAdminGraphsUploadSnapshot(formData)` в `adminApi.js`.

### Phase 4 — Тесты

**Backend:** `backend/tests/test_admin_graphs.py`

- `test_upload_snapshot_admin_allowed`: админ загружает валидные файлы → создаётся снапшот, current symlink обновляется.
- `test_upload_snapshot_invalid_graph_json`: 400 на некорректный JSON.
- `test_upload_snapshot_viewer_forbidden_403`: не-admin получает 403.

**Frontend:**

- Unit test `adminApi.graphs.test.mjs`: вызов `apiAdminGraphsUploadSnapshot` с FormData.
- Smoke test `AdminGraphsPage.smoke.test.jsx`: наличие секции загрузки.

### Phase 5 — OpenAPI и локальные проверки

- `./scripts/update_openapi.sh` — 0 errors.
- `python -m pytest backend/tests/test_admin_graphs.py -v`.
- Frontend smoke/unit tests.

### Phase 6 — Deploy на stage и верификация

- Deploy ветки на stage (разрешено).
- Проверить `POST /api/admin/graphs/snapshots` под admin.
- Проверить 403 для не-admin.
- Проверить, что вьювер `/admin/graphs` показывает граф.
- Проверить аналитику.
- Сделать скриншоты.

### Phase 7 — PR и merge

- PR на русском.
- Merge только по явному approve.

## Контракт upload-эндпоинта

```http
POST /api/admin/graphs/snapshots
Content-Type: multipart/form-data
Authorization: Bearer <admin-token>

graph_json: <graph.json>
analysis_json: <.graphify_analysis.json>
```

**Ответ 200:**

```json
{
  "id": "20260830-153424-048894",
  "created_at": "2026-08-30T15:34:24+00:00",
  "commit_sha": "manual",
  "commit_message": "uploaded via admin UI",
  "is_current": true,
  "html_size": 1072247,
  "json_size": 34389299
}
```

**Ошибки:**
- 400 — невалидный JSON или отсутствуют обязательные поля.
- 401/403 — authz.
- 500 — ошибка рендера.

## Acceptance criteria

- [ ] Stage разблокирован: текущий локальный снапшот залит, `/admin/graphs` отображает граф.
- [ ] `POST /api/admin/graphs/snapshots` реализован, доступен только admin.
- [ ] Загружаемые `graph.json` и `.graphify_analysis.json` валидируются по контракту.
- [ ] После upload symlink `current` обновляется и вьювер/аналитика отдают свежие данные.
- [ ] UI админки содержит форму загрузки снапшота.
- [ ] Rebuild в UI работает поверх загруженных файлов.
- [ ] 403 для не-admin на всех admin-эндпоинтах (включая новый).
- [ ] Backend/frontend тесты проходят.
- [ ] `docs/openapi.yaml` актуален.
- [ ] Скриншоты stage приложены к PR.
- [ ] PR на русском; merge только по явному approve.

## Риски / блокеры

- Размер `graph.json` (~35MB) требует достаточного лимита multipart в FastAPI/Starlette/Uvicorn и nginx.
- Валидация большого JSON в памяти может быть затратной; нужно проверить ресурсы контейнера.
- Если graphify CLI изменит формат `.graphify_analysis.json`, валидацию придётся обновлять.
