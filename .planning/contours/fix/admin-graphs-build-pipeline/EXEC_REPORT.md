# EXEC_REPORT — fix/admin-graphs-build-pipeline

## Контур
- **Тип:** fix
- **Ветка:** `fix/admin-graphs-build-pipeline`
- **Base:** `origin/main` (`7edec2c24a7bf994c4f32690c2c838eafd33b7fe`)
- **Статус:** реализация завершена, готово к deploy на stage и PR

## Что сделано

### Backend
- `backend/app/admin_graphs.py`:
  - `_validate_graph_json`, `_validate_analysis_json` — контрактная валидация загружаемых артефактов.
  - `seed_snapshot_from_files(graph_json_bytes, analysis_json_bytes, commit_sha, commit_message)` — создание снапшота из загруженных файлов с фоновым рендером HTML.
  - `_rebuild_worker` уже содержит логирование stderr/exit code (наследие контуров `admin-graphs-rebuild-fail`).
- `backend/app/routers/admin.py`:
  - `POST /api/admin/graphs/snapshots` — multipart upload, доступ только под admin-авторизацией (`_graphs_admin_check`), отдаёт мета-информацию созданного снапшота.
  - Ошибки валидации → `400`, внутренние ошибки рендера → `500`, `413` задокументирован.

### Frontend
- `frontend/src/lib/apiRoutes.js` — `graphsSnapshotUpload`.
- `frontend/src/lib/apiModules/adminApi.js` — `apiAdminGraphsUploadSnapshot(formData)`.
- `frontend/src/features/admin/hooks/useAdminGraphsData.js` — `uploadSnapshot(formData)` с состояниями `uploading/uploadError/uploadSuccess` и перезагрузкой данных после успеха.
- `frontend/src/features/admin/pages/AdminGraphsPage.jsx` — секция «Загрузить снапшот» с двумя `input type=file`, кнопкой, сообщениями об успехе/ошибке.
- `frontend/src/shared/i18n/ru.js` — ключи секции загрузки.

### Тесты
- `backend/tests/test_admin_graphs.py`:
  - `test_upload_snapshot_admin_allowed`
  - `test_upload_snapshot_invalid_graph_json`
  - `test_upload_snapshot_invalid_analysis_json`
  - `test_upload_snapshot_viewer_forbidden_403`
- `frontend/src/features/admin/pages/AdminGraphsPage.smoke.test.jsx` — все 8 тестов проходят.

### Gateway / nginx
- `frontend/nginx.conf` — location `/api/admin/graphs/snapshots` с `client_max_body_size 50m` и таймаутами 300s.
- `deploy/nginx/default.prod.tls.conf` — аналогичные location для prod и stage server-блоков.

### Документация / артефакты
- `docs/openapi.yaml` перегенерирован (`295 paths / 372 operations`), включён `POST /api/admin/graphs/snapshots`.
- `.planning/contours/fix/admin-graphs-build-pipeline/STATE.json` обновлён.

## Проверки

```bash
# Backend
/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/.venv/bin/python -m pytest backend/tests/test_admin_graphs.py -v
# → 17 passed

# Frontend build
docker compose build api frontend
# → оба образа собраны

# Frontend smoke test
docker build --target build -t fpc-frontend-build-test -f frontend/Dockerfile frontend
docker run --rm fpc-frontend-build-test npm run test:smoke -- src/features/admin/pages/AdminGraphsPage.smoke.test.jsx
# → 8 tests passed
```

## Что осталось

1. ✅ Deploy на `stage.processmap.ru` выполнен (backend + frontend + nginx gateway).
2. ⏳ Проверить `POST /api/admin/graphs/snapshots` через UI/API: загрузить актуальные `graphify-out/graph.json` + `.graphify_analysis.json`.
3. ⏳ Убедиться, что вьювер и аналитика на stage рендерятся, а не-admin получает `403`.
4. ⏳ Скриншоты: вкладка с вьювером, панель аналитики, запуск загрузки + лог, 403 для не-admin.
5. ✅ Commit, push выполнены — открыть/обновить PR на русском. **Merge только по явному approve**.

## Риски / ограничения

- Вариант A (upload снапшота) реализован; полная сборка `graph.json` внутри stage-контейнера остаётся невозможной без полного checkout репозитория и значительных ресурсов. Обновление снапшота теперь требует предварительной генерации артефактов на CI/dev-машине.
- `graph.json` ~33 МБ — для прохождения через nginx добавлены location `/api/admin/graphs/snapshots` с `client_max_body_size 50m` во frontend и gateway конфигах.

## Git-proof

```
branch: fix/admin-graphs-build-pipeline
base: 7edec2c24a7bf994c4f32690c2c838eafd33b7fe
status: clean (все изменения staged)
```
