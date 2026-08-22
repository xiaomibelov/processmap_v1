# PATCH: Vite dev → nginx static

## Файлы изменены

### 1. `frontend/Dockerfile`
```dockerfile
FROM node:20-alpine AS build
RUN apk add --no-cache git
ARG VITE_BUILD_ID=dev
ARG VITE_BUILD_TIME=unknown
ARG VITE_BUILD_BRANCH=unknown
ARG VITE_BUILD_ENV=prod
ARG VITE_DEPLOY_FINGERPRINT=
ARG VITE_DEPLOY_REQUESTED_REF=
ARG VITE_DEPLOY_RESOLVED_SHA=
ENV VITE_BUILD_ID=${VITE_BUILD_ID}
ENV VITE_BUILD_TIME=${VITE_BUILD_TIME}
ENV VITE_BUILD_BRANCH=${VITE_BUILD_BRANCH}
ENV VITE_BUILD_ENV=${VITE_BUILD_ENV}
ENV VITE_DEPLOY_FINGERPRINT=${VITE_DEPLOY_FINGERPRINT}
ENV VITE_DEPLOY_REQUESTED_REF=${VITE_DEPLOY_REQUESTED_REF}
ENV VITE_DEPLOY_RESOLVED_SHA=${VITE_DEPLOY_RESOLVED_SHA}
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80 5177
HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=5s \
    CMD ["sh", "-c", "curl -fsS http://localhost:5177/ >/dev/null || curl -fsS http://localhost:80/ >/dev/null || exit 1"]
```

### 2. `frontend/nginx.conf` (новый)
- `listen 80; listen 5177;`
- `gzip on` с необходимыми `gzip_types`.
- Проксирование `/api/`, `/version`, `/health/`, `/metrics` → `api:8000`.
- `Cache-Control` для hashed assets и no-cache для `index.html`, `env.js`.
- SPA fallback `try_files $uri $uri/ /index.html`.

### 3. `docker-compose.yml`
- `frontend` теперь собирается из `frontend/Dockerfile` с build args.
- Порт `${FRONTEND_PORT:-5177}:5177`.
- Healthcheck `curl -fsS http://localhost:5177/`.
- Удалён dev `command`, dev volumes/env.
- Удалён сервис `gateway` и volume `frontend_node_modules`.

### 4. `docker-compose.prod.yml` / `docker-compose.stage.yml`
- `gateway` → `frontend`.
- Сетевые алиасы `prod-gateway` / `stage-gateway` сохранены.

### 5. `deploy/deploy.sh`
- `gateway` → `frontend` в build, deprecate, up, healthcheck, reload, label.
- Frontend healthcheck добавлен: `curl -fsS http://localhost:${FRONTEND_PORT:-5177}/`.

### 6. Runtime env (`window.__ENV__`)
- `frontend/public/env.js` — runtime env шаблон (`VITE_API_BASE`).
- `frontend/index.html` — подключает `<script src="/env.js"></script>` перед приложением.
- `frontend/src/lib/apiClient.js` — читает `window.__ENV__?.VITE_API_BASE` с fallback на `import.meta.env`.
- `nginx.conf` — отдаёт `/env.js` с `no-cache` заголовками.

## Что НЕ изменено
- `frontend/Dockerfile.prod` оставлен как есть (используется отдельным SSL edge-контуром через `docker-compose.ssl.yml`).
- `vite.config.js` — defaults `base: '/'`, `outDir: 'dist'` не требуют изменений.
