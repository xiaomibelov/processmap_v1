# PR — fix/vite-dev-to-nginx

## Заголовок
infra: заменить Vite dev-сервер на nginx + production build

## Описание
- Текущий стенд `clearvestnic.ru:5177` работал на `npm run dev` (Vite dev-сервер)
- Перевод на production-сборку (`npm run build` → `dist/`) + nginx:alpine
- Добавлено: gzip, cache-control, SPA fallback (`try_files`)
- Runtime env: `window.__ENV__` вместо `import.meta.env` (для стенда)

## Изменения
- `Dockerfile` — multistage: Node build → nginx:alpine
- `nginx.conf` — SPA fallback, gzip, cache headers
- `docker-compose.yml` — сервис `frontend` на nginx, healthcheck
- `public/env.js` — runtime env шаблон

## Тестирование
- Smoke-test 5/5 PASS на стенде
- `curl` проверяет gzip, SPA fallback, cache headers
- UI: навигация, экспорт, фильтры — работают
- Нет HMR WebSocket в production

## Стенд
- `clearvestnic.ru:5177` — обновлён, zero downtime

## Checklist
- [ ] Smoke-test PASS
- [ ] Approve пользователя
