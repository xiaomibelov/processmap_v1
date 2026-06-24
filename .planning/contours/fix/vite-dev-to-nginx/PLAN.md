# PLAN — Переход Vite dev → nginx + статика

## Статус: ожидает approve

## Шаг 1: Production build (build-agent)
- Проверить `vite.config.js`: `base: '/'`, `outDir: 'dist'`
- `npm run build` → проверить `dist/` на наличие `index.html`, assets с hash
- Проверить размер: main JS/CSS <5 MB gzipped
- **Время**: 15 мин

## Шаг 2: Nginx конфиг (nginx-agent)
- Файл: `nginx.conf`
```nginx
server {
    listen 5177;
    root /usr/share/nginx/html;
    index index.html;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```
- **Время**: 20 мин

## Шаг 3: Dockerfile multistage (docker-agent)
- Заменить текущий Dockerfile на multistage (build → nginx)
- Или обновить `docker-compose.yml`: отдельный сервис nginx с volume `dist/`:
```yaml
frontend:
  image: nginx:alpine
  volumes:
    - ./dist:/usr/share/nginx/html:ro
    - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
  ports:
    - "5177:5177"
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:5177/"]
```
- **Время**: 30 мин

## Шаг 4: Runtime env (env-agent)
- Если `VITE_API_URL` — заменить на `window.__ENV__.API_URL`
- Создать `public/env.js` (пустой шаблон) или hardcode для стенда
- **Время**: 15 мин

## Шаг 5: Smoke-test (test-agent)
- `curl -I :5177/` → 200 + gzip
- `curl :5177/analytics` → 200 (SPA fallback)
- UI: навигация, экспорт CSV/XLSX, фильтры — работают
- DevTools: нет HMR WebSocket
- **Время**: 15 мин

## Итого
- **Реализация**: ~80 мин
- **Риски**: SPA 404 (решается `try_files`), API proxy (если был в Vite — вынести)

## Ветка
`fix/vite-dev-to-nginx`

## Артефакты
- `PLAN.md` (этот файл)
- `PATCH.md` — diff Dockerfile, nginx.conf, docker-compose.yml, env handling
- `TESTS.md` — smoke-test сценарии
- `PR.md` — описание PR

## Mirror
Obsidian: `/srv/obsidian/project-atlas/ProcessMap/Fixes/vite-dev-to-nginx/`
