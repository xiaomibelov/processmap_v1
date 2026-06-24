# PLAN: Переход frontend с Vite dev-сервера на nginx + статика

## Контекст
- Стенд: `clearvestnic.ru:5177`
- Сейчас в `docker-compose.yml` сервис `frontend` запускал `npm run dev --port 5177` (Vite dev-сервер внутри Docker).
- Проблемы: высокое потребление RAM/CPU, отсутствие gzip/кеширования, HMR/WebSocket в production-контуре.
- Цель: production-сборка (`npm run build`) + `nginx:alpine` с gzip, cache-control, SPA fallback и проксированием API.

## Проверено заранее
- `vite.config.js` не задаёт `base` и `outDir` → defaults `/` и `dist` (корректно).
- `npm run build` проходит без ошибок.
- Размер `dist/`: ~4.9 MB uncompressed, JS+CSS gzipped ~1.2 MB (<5 MB бюджет).

## Изменения

### 1. Build pipeline
- Используется существующий `npm run build`.
- В `frontend/Dockerfile` добавлен multistage build:
  - stage `build`: `node:20-alpine` → `npm ci --include=dev` → `npm run build`.
  - stage `serve`: `nginx:1.27-alpine` → копируется `dist/` и `nginx.conf`.
- Build args передают `VITE_BUILD_ID/TIME/BRANCH/ENV` и fingerprint-переменные (как раньше в `Dockerfile.prod`).

### 2. Nginx конфигурация (`frontend/nginx.conf`)
- Listen: `80` (для внутреннего edge-прокси) и `5177` (для прямого проброса на стенде).
- `gzip on` с типами: `text/plain`, `text/css`, `text/xml`, `text/javascript`, `application/json`, `application/javascript`, `application/xml+rss`, `application/atom+xml`, `image/svg+xml`.
- SPA fallback: `location / { try_files $uri $uri/ /index.html; }`.
- API proxy: `/api/`, `/version`, `/health/`, `/metrics` → `api:8000`.
- Cache headers:
  - `/assets/` → `public, max-age=31536000, immutable`.
  - `index.html` и `/` → `no-cache, no-store, must-revalidate`.

### 3. Dockerfile (`frontend/Dockerfile`)
- Полностью заменён dev-вариант на multistage nginx.
- `EXPOSE 80 5177`.
- `HEALTHCHECK` по `localhost:5177/`, fallback на `localhost:80/`.

### 4. Runtime env vars
- API base использует относительные пути (`/api`), проксируется nginx.
- Все `VITE_*` — build-time переменные, проброшенные через `ARG`/`ENV` в Dockerfile и через `args:` в `docker-compose.yml`.
- Runtime-инъекция через `window.__ENV__` не требуется.

### 5. `docker-compose.yml`
- Сервис `frontend` переключён на новый `Dockerfile`.
- Убран dev `command`, `CHOKIDAR_USEPOLLING`, `WATCHPACK_POLLING`, `VITE_HMR_PORT`, `VITE_PORT` и volume `frontend:/app`.
- Порт `${FRONTEND_PORT:-5177}:5177`.
- Добавлен `healthcheck`.
- Сервис `gateway` удалён из базового compose (дублировал `frontend`).
- Volume `frontend_node_modules` удалён.

### 6. `docker-compose.prod.yml` / `docker-compose.stage.yml`
- Сервис `gateway` переименован в `frontend`.
- Сетевой алиас сохранён (`prod-gateway` / `stage-gateway`) для совместимости с edge-прокси.

### 7. `deploy/deploy.sh`
- Заменены все упоминания `gateway` на `frontend`.
- Healthcheck теперь проверяет и API `/version`, и frontend root `/`.
- Zero-downtime: создаётся новый `frontend`-контейнер → healthcheck → старый deprecated.

## Риски и откаты
- **Риск**: новый nginx не поднимается → deploy.sh откатит на последний deprecated `frontend`.
- **Риск**: конфликт портов 5177 → перед deploy остановить старый `gateway`/`frontend`.
- **Откат**: `docker compose stop frontend && docker start processmap_v1-frontend-1-deprecated-<ts>` или `git revert` + redeploy.

## Порядок применения
1. Смержить PR.
2. На стенде: `git pull`, `./deploy/deploy.sh`.
3. Убедиться, что `processmap_v1-frontend-1` healthy и отдаёт `/` с gzip на `/assets/`.
4. Провести smoke-test (см. `TESTS.md`).
