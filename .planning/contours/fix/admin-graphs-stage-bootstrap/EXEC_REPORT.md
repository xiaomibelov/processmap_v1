# EXEC_REPORT — fix/admin-graphs-stage-bootstrap

## Что сделано

- Диагностика stage (`deploy@stage.processmap.ru`):
  - Checkout `/opt/processmap/app` — `ffaaa38f` (до `feature/admin-graphs-tab`), `tools/graphify-render-graph.py` и `graphify-out/` отсутствуют.
  - Контейнер `processmap_stage-api-1`, image `processmap_stage-api:700eaf02...` — backend-код `/api/admin/graphs/*` уже есть, но `/app/tools/` полностью отсутствует, `networkx` не установлен, `graphify-out/` пустой.
  - Graphify CLI / node на stage отсутствуют.
- Реализованы изменения:
  - `Dockerfile`: копирует `tools/graphify-render-graph.py` и `tools/graphify-semantic-config.json` в `/app/tools/`.
  - `backend/requirements.txt`: добавлен `networkx>=3.0`.
  - `backend/app/admin_graphs.py`: `_rebuild_worker` ищет скрипт рендера в `/app/tools/`, рядом с модулем, fallback на repo root; если не найден — rebuild помечается failed с понятной ошибкой.
  - `frontend/src/features/admin/hooks/useAdminGraphsData.js`: 404 от `current` и `analytics` трактуется как нормальный empty state, реальная ошибка — только при не-404 или падении `snapshots`.
  - `frontend/src/features/admin/pages/AdminGraphsPage.jsx`: нейтральный empty state «Граф ещё не собран» с кнопкой пересборки и подсказкой о длительности.
  - `frontend/src/shared/i18n/ru.js`: ключи `emptyStateTitle`, `emptyStateDescription`, `rebuildDurationHint`.
  - Smoke-test `AdminGraphsPage.smoke.test.jsx`: проверка empty state.

## Проверки

- Backend tests: `tests/test_admin_graphs.py` — 12 passed.
- Frontend unit tests: `adminApi.graphs.test.mjs`, `apiRoutes.test.mjs` — 12 passed.
- Frontend smoke tests: `AdminGraphsPage.smoke.test.jsx` + остальные — 27 passed.
- OpenAPI: `docs/openapi.yaml` валиден (`@redocly/cli lint` — validated).
- Docker image `processmap/admin-graphs-bootstrap:test` собран; внутри:
  - `/app/tools/graphify-render-graph.py` и `graphify-semantic-config.json` на месте;
  - `networkx 3.6.1` импортируется;
  - `python /app/tools/graphify-render-graph.py --help` работает.

## Что осталось после merge/deploy

- После approve и deploy на stage залить initial snapshot:
  - Источник: локальные `graphify-out/graph.json` и `.graphify_analysis.json` из актуального worktree `feature-admin-graphs-tab`.
  - Цель: контейнер `processmap_stage-api-1`, путь `/app/graphify-out/`.
  - Создать `meta.json` и symlink `current` в `/app/graphify-out/snapshots/`.
- Проверить на stage:
  - вкладка `/admin/graphs` открывается под admin;
  - empty state корректно показывается при отсутствии снапшота;
  - пересборка запускается и завершается успешно;
  - аналитика отдаёт данные;
  - 403 для не-admin сохраняется.

## Решение по первому снапшоту

Пересборка на stage сейчас невозможна, потому что в образе отсутствуют `tools/` и `networkx`. После merge этого PR и deploy на stage первый снапшот будет создан либо фоновой пересборкой через UI, либо — для ускорения — залит вручную из локальных артефактов. Причина выбора зафиксирована: до обновления образа пайплайн graphify в контейнере неработоспособен.
