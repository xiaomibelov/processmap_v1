# PATCH: fix/stage-deploy-gateway-ref

## Проблема
После merge `fix/vite-dev-to-nginx` сервис `gateway` был удалён из `docker-compose.yml` и заменён на `frontend`. Stage-deploy CI продолжал обращаться к несуществующему сервису `gateway`:
```
err: no such service: gateway
```

## Изменения

### 1. `.github/workflows/deploy-stage.yml`
- Заменены все упоминания `gateway` → `frontend`.
- Имена контейнеров: `processmap_stage-gateway-1` → `processmap_stage-frontend-1`.
- Команды:
  - `build --no-cache api gateway` → `build --no-cache api frontend`
  - `rm -fsv gateway` → `rm -fsv frontend`
  - `up -d ... api gateway` → `up -d ... api frontend`
- Поиск named volumes: `processmap_stage_gateway` → `processmap_stage_frontend`.
- Комментарии приведены в соответствие.

### 2. `.github/workflows/deploy-stage-ref.yml`
- Аналогичные замены `gateway` → `frontend`.
- Имена контейнеров и команды приведены к сервису `frontend`.

### 3. `docker-compose.stage.yml` (проверено)
- Сервис уже называется `frontend` (переименован в `fix/vite-dev-to-nginx`).
- Сетевой алиас `stage-gateway` сохранён для совместимости с edge-прокси.

### 4. `docker-compose.prod.yml` (проверено)
- Сервис уже называется `frontend` с алиасом `prod-gateway`.
- Prod workflow использует отдельный SSL edge `gateway` через `docker-compose.prod.gateway.yml`, поэтому prod-скрипты не затронуты.

## Что не менялось
- `docker-compose.prod.gateway.yml` — отдельный SSL edge-прокси, остаётся `gateway`.
- `docker-compose.ssl.yml` — SSL termination, остаётся `gateway`.
