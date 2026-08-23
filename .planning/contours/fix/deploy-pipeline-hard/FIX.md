# fix/deploy-pipeline-hard

Контур закрывает два корневых источника красных деплоев ProcessMap и делает «падает на хосте» невозможным по построению.

## Проблемы

### A. Гонка SHA (ложный отказ)
- `deploy-stage.yml` сравнивал `origin/main` с `github.sha`.
- Если `main` сдвигался между триггером и деплоем, guard падал с ошибкой `origin/main X != workflow sha Y`.

### B. Сборка frontend Docker падает на хосте
- Локальный `npm run build` зелёный, но `docker build ./frontend` падает на `RUN npm run build`.
- Полный стектрейс: `vite:build-import-analysis` ломается в `src/shared/i18n/ru.js:894:0` из-за лишней закрывающей скобки `};`.
- Аналогичная ошибка найдена в `src/shared/i18n/en.js`.

## Исправления

### A. Guard DEPLOY_SHA + concurrency
- В `deploy-stage.yml` добавлен шаг **Resolve deploy ref and SHA**:
  - `DEPLOY_SHA` вычисляется после `git fetch origin main`;
  - сервер сверяет разрешённый SHA с `EXPECTED_SHA`;
  - `freshness proof` работает против `DEPLOY_SHA`.
- Добавлен `concurrency: group: deploy-stage, cancel-in-progress: false` — деплои не гоняются, а встают в очередь.
- Добавлен `workflow_dispatch` с явным `ref`: можно задеплоить конкретный коммит/ветку/тег.

### B. CI-сборка всех образов
- Добавлен `.github/workflows/docker-build.yml`:
  - триггеры `pull_request` и `push` в `main`;
  - матрица: `api`, `frontend`, `notifications`, `agent`;
  - `push: false`, кэш BuildKit через `type=gha`;
  - предварительная валидация `docker compose config --quiet`.
- Падение любой сборки = красный PR.

### C. Корень ошибки frontend
- Удалена лишняя закрывающая скобка в:
  - `frontend/src/shared/i18n/ru.js`;
  - `frontend/src/shared/i18n/en.js`.
- После правки `docker build ./frontend` проходит успешно.

### D. Документация
- В `docs/agent/RELEASE_CHECKLIST.md` добавлен пункт: «Образы собираются в CI на каждый PR; деплой на хост только переносит/перезапускает уже доказанное».

## Локальная проверка

```bash
cd /Users/mac/agents_place/kimi_PM/server-backup/opt/processmap-test-worktrees/fix-deploy-pipeline-hard

# frontend — был красным, стал зелёным
docker build ./frontend

# остальные образы
docker build . -f Dockerfile -t processmap/api:local-test
docker build ./backend/services/notifications -t processmap/notifications:local-test
docker build ./backend/services/agent -t processmap/agent:local-test
```

Все четыре образа собраны локально без ошибок.

## Git

- Ветка: `fix/deploy-pipeline-hard`
- HEAD: актуальный HEAD ветки `fix/deploy-pipeline-hard`
- Base: `origin/main` (`9bd344d9`)
- Fix-коммит: `9c8b1d7e`
- PR: https://github.com/xiaomibelov/processmap_v1/pull/new/fix/deploy-pipeline-hard

## Статус

- [x] Корневая причина B найдена и воспроизведена
- [x] Патч кода/манифеста (не Dockerfile-обход)
- [x] Переписан guard A
- [x] Добавлен CI job docker-build
- [x] Добавлена строка в деплой-документацию
- [x] Локальная сборка всех образов зелёная
- [x] Push в `origin/fix/deploy-pipeline-hard`
- [ ] PR создан (требуется ручное создание из-за ограничений токена)
- [ ] Merge — только владелец
- [ ] CI GitHub Actions зелёный на ветке
