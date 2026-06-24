# PATCH: fix/stage-deploy-gateway-ref-v2

## Проблема
После фикса `fix/stage-deploy-gateway-ref` stage-deploy всё ещё падал с:
```
no such service: gateway
```
Ошибка возникала ПОСЛЕ успешного старта `frontend`/`api`, потому что пост-деплойные скрипты продолжали обращаться к сервису/контейнеру `gateway`.

## Изменения

### 1. `deploy/scripts/stage_freshness_proof.sh`
- `compose_stage ps -q gateway` → `compose_stage ps -q frontend`.
- Переменная `GATEWAY_CID` → `FRONTEND_CID`.
- Все сообщения об ошибках: `gateway` → `frontend`.
- Env var `STAGE_FRESHNESS_GATEWAY_ROOT` заменён на `STAGE_FRESHNESS_FRONTEND_ROOT` с fallback на старое имя для совместимости.

### 2. `deploy/scripts/server_update.sh`
- `docker compose up -d --remove-orphans postgres redis api frontend gateway` → `... api frontend`.

### 3. `deploy/scripts/server_first_deploy.sh`
- `docker compose up -d api frontend gateway` → `docker compose up -d api frontend`.

### 4. `deploy/deploy.sh`
- Комментарий "deployed gateway" → "deployed frontend".

## Что оставлено без изменений
- `.github/workflows/deploy-prod.yml`, `rollback-prod.yml`, `docker-compose.prod.gateway.yml`, `docker-compose.ssl.yml` — там `gateway` — это отдельный SSL edge-прокси, не связанный с stage-deploy.
