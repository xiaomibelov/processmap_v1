# PR: Переход frontend с Vite dev-сервера на nginx + статика

## Что изменилось
- Сервис `frontend` больше не запускает `npm run dev` внутри Docker.
- Теперь `frontend/Dockerfile` — multistage: Vite build → `nginx:1.27-alpine`.
- Добавлен `frontend/nginx.conf` с gzip, cache-control, SPA fallback и проксированием API.
- `docker-compose.yml` обновлён: dev volumes/env убраны, порт `5177:5177`, healthcheck.
- Удалён дублирующий сервис `gateway` из базового compose.
- `deploy/deploy.sh` переключён с `gateway` на `frontend` (build, zero-downtime, healthcheck).
- `docker-compose.prod.yml` / `docker-compose.stage.yml`: `gateway` → `frontend`, сетевые алиасы сохранены.

## Почему
- Vite dev-сервер в Docker потреблял RAM/CPU и не предназначен для production.
- nginx даёт gzip, кеширование статики, корректный SPA fallback и стабильный healthcheck.

## Проверено
- `npm run build` — PASS, `dist/` ~4.9 MB uncompressed, JS+CSS gzipped ~1.2 MB.
- Локальный запуск собранного образа:
  - `curl -I http://localhost:5178/` → 200.
  - `curl http://localhost:5178/analytics` → отдаёт `index.html` (SPA fallback).
  - `curl -I -H 'Accept-Encoding: gzip' .../assets/index-*.css` → `Content-Encoding: gzip`.

## Smoke-test на стенде
См. `.planning/contours/fix/vite-dev-to-nginx/TESTS.md`.

## Риски / Rollback
- Если новый контейнер не поднимется, `deploy/deploy.sh` автоматически откатит на предыдущий deprecated `frontend`.
- Ручной откат: `docker compose stop frontend && docker start processmap_v1-frontend-1-deprecated-<ts>`.

## Контур
- `.planning/contours/fix/vite-dev-to-nginx/`
- Mirror в Obsidian: `/srv/obsidian/project-atlas/ProcessMap/Fixes/vite-dev-to-nginx/`
