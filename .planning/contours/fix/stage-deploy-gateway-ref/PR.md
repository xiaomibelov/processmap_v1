# PR — fix/stage-deploy-gateway-ref

## Заголовок
infra: stage-deploy — заменить `gateway` на `frontend` в CI

## Описание
- После перехода на nginx static (`fix/vite-dev-to-nginx`) сервис `gateway` удалён из `docker-compose.yml`.
- Stage-deploy CI падал с ошибкой `no such service: gateway`.
- Заменены все обращения к `gateway` на `frontend` в stage workflow.

## Изменения
- `.github/workflows/deploy-stage.yml` — `gateway` → `frontend`.
- `.github/workflows/deploy-stage-ref.yml` — `gateway` → `frontend`.
- `docker-compose.stage.yml` — сервис уже `frontend`, алиас `stage-gateway` сохранён.

## Тестирование
- YAML syntax проверен.
- `docker compose config` для stage проходит.
- В workflow не осталось упоминаний `gateway`.

## Как проверить после merge
1. Запустить `Deploy to Stage` workflow из `main`.
2. Убедиться, что `processmap_stage-frontend-1` поднялся.
3. Проверить `curl -I http://stage-url/` → 200.

## Checklist
- [ ] Smoke-test PASS
- [ ] Approve пользователя
