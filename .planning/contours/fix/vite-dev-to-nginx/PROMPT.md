# PROMPT: Переход Vite dev-сервер → nginx + статика

## Контекст
- Стенд: `clearvestnic.ru:5177`, контейнер `app-frontend-1`
- Сейчас: `npm run dev --port 5177` (Vite dev-сервер в Docker)
- Проблема: dev-сервер жрёт RAM/CPU, нет gzip, нет кеширования, не production-ready

## Цель
Production-сборка (`npm run build` → `dist/`) + nginx:alpine отдаёт статику с gzip, cache-control, SPA fallback.

## Задачи (по порядку)

### 1. Build pipeline (build-agent)
- Проверить `vite.config.js`: `base: '/'`, `outDir: 'dist'`
- Убедиться что `npm run build` проходит без ошибок
- Собрать `dist/` и проверить размер (бюджет: <5 MB gzipped)

### 2. Nginx конфиг (nginx-agent)
- `nginx.conf` для SPA:
  - `gzip on`, `gzip_types text/plain text/css application/json application/javascript text/xml`
  - `location / { try_files $uri $uri/ /index.html; }` — SPA fallback
  - `location /api { proxy_pass http://backend; }` — если фронт проксирует API (уточнить)
  - `Cache-Control: public, max-age=31536000, immutable` для assets с hash
  - `Cache-Control: no-cache` для `index.html`
- Порт `5177` сохраняем для совместимости стенда

### 3. Dockerfile multistage (docker-agent)
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5177
```
- Или volume-маппинг `dist/` в существующий nginx контейнер (если CI собирает отдельно)

### 4. Runtime env vars (env-agent)
- Если используется `import.meta.env.VITE_*` — заменить на `window.__ENV__`
- Создать `env.js` шаблон, подставляемый nginx или Docker entrypoint
- Или hardcode API URL для стенда (допустимо для текущей стадии)

### 5. docker-compose.yml (docker-agent)
- Заменить `command: npm run dev --port 5177` на `image: nginx:alpine` + volume
- Или обновить Dockerfile фронта на multistage
- Healthcheck: `curl -f http://localhost:5177/ || exit 1`

### 6. Smoke-test (test-agent)
- `curl -I http://clearvestnic.ru:5177/` → 200, `content-encoding: gzip`
- `curl http://clearvestnic.ru:5177/analytics` → 200 (SPA fallback, не 404)
- Открытие приложения, навигация, экспорт CSV/XLSX — работает
- DevTools Network: нет WebSocket/HMR подключений
- Lighthouse: Performance >90 (дополнительно)

## Дисциплина
- Ветка: `fix/vite-dev-to-nginx`
- Артефакты: `.planning/contours/fix/vite-dev-to-nginx/`
- PR на русском
- **NO merge/deploy без explicit approve**
- Mirror в Obsidian: `/srv/obsidian/project-atlas/ProcessMap/Fixes/vite-dev-to-nginx/`

## Ограничения
- Стаенд должен оставаться доступным по `clearvestnic.ru:5177`
- Zero-downtime deploy: поднять новый контейнер → healthcheck → убить старый
- Если API проксируется через Vite dev server — вынести в nginx или отдельный backend URL

## Формат выхода
- `PLAN.md` — утверждённый план
- `PATCH.md` — изменения (Dockerfile, nginx.conf, docker-compose, env handling)
- `TESTS.md` — smoke-test сценарии
- `PR.md` — описание PR
