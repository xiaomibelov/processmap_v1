# TESTS — admin-graphs-tab

## 1. Backend unit tests

Файл: `backend/tests/test_admin_graphs.py`

Запуск (внутри api-контейнера, требуется `pydantic`/`fastapi` из образа):
```bash
cd /app/backend
python -m unittest tests.test_admin_graphs -v
```

На хосте (требуется установленный backend-venv):
```bash
cd backend
python -m unittest tests.test_admin_graphs -v
```

Покрытие:
- `test_snapshots_admin_allowed` — admin получает список снапшотов.
- `test_snapshots_viewer_forbidden_403` — org_viewer получает 403 на `/api/admin/graphs/snapshots`.
- `test_snapshots_unauth_401` — неавторизованный запрос получает 401.
- `test_current_snapshot_*` — мета/HTML/JSON текущего снапшота, 404 при отсутствии.
- `test_rebuild_starts_job` — `POST /api/admin/graphs/rebuild` возвращает `job_id`.
- `test_analytics_*` — аналитика по текущему снапшоту: слои, hubs, communities, layer gaps.

## 2. Frontend unit tests

Файлы:
- `frontend/src/lib/apiRoutes.test.mjs`
- `frontend/src/lib/apiModules/adminApi.graphs.test.mjs`
- `frontend/src/features/admin/pages/AdminGraphsPage.test.mjs`

Запуск (внутри frontend-контейнера или при наличии Node.js на хосте):
```bash
cd frontend
npm test -- src/lib/apiRoutes.test.mjs src/lib/apiModules/adminApi.graphs.test.mjs src/features/admin/pages/AdminGraphsPage.test.mjs
npm run test:smoke -- --run src/features/admin/pages/AdminGraphsPage.test.mjs
```

Покрытие:
- Маршруты `/api/admin/graphs/*` формируются корректно.
- `adminApi` функции обрабатывают 200/403/401 и валидируют `job_id`.
- `AdminGraphsPage` рендерит аналитику, viewer, историю снапшотов и кнопку пересборки.

## 3. Интеграционные / ручные проверки

| Проверка | Как выполнить | Ожидаемый результат |
|---|---|---|
| Вкладка рендерится под admin | Войти как `admin@local`, открыть `/admin/graphs` | Виден вьювер графа, панель управления, аналитика |
| 403 для не-admin | Войти как `org_viewer`, открыть `/admin/graphs` | Страница «Для входа в административную консоль нужна роль...» |
| 403 на API для не-admin | `curl -H "Authorization: Bearer <viewer_token>" /api/admin/graphs/snapshots` | `403 forbidden` |
| Фоновая пересборка не блокирует | Нажать «Пересобрать граф», затем переключиться на другую вкладку | UI остаётся отзывчивым, статус обновляется через polling |
| Snapshot JSON валиден | `GET /api/admin/graphs/snapshot/current/json` | JSON с `RAW_NODES` (layer/confidence/scenarios) |

## 4. Скриншоты для PR

- `screenshot-admin-graphs-viewer.png` — вкладка с вьювером и панелью управления.
- `screenshot-admin-graphs-analytics.png` — панель аналитики: KPI, распределение по слоям, hubs, communities, layer gaps.
- `screenshot-admin-graphs-rebuild.png` — запуск пересборки и лог выполнения.
- `screenshot-admin-graphs-403.png` — доступ запрещён для org_viewer.

## 5. Критерии приёмки

- [x] `/admin/graphs` доступен только admin / org_admin / org_owner / project_manager / auditor.
- [x] `graph.html`, `/api/admin/graphs/*` и файлы снапшотов недоступны без admin-авторизации.
- [x] Пересборка запускается фоново, таймаут 10 мин, история ≤10 снапшотов.
- [x] Аналитика содержит: распределение по слоям, % unclassified, топ hubs, крупнейшие communities, изолированные ноды, layer gaps (frontend↔backend).
- [x] OpenAPI `docs/openapi.yaml` обновлён, `./scripts/update_openapi.sh` завершается с `0 errors`.
