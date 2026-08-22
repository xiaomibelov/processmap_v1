# TESTS — Smoke-test vite-dev-to-nginx

## Сценарии

### 1. Gzip + статус
```bash
curl -I http://clearvestnic.ru:5177/
```
- Ожидаем: HTTP 200, `content-encoding: gzip` или `Content-Type: text/html`

### 2. SPA fallback (deep link)
```bash
curl http://clearvestnic.ru:5177/analytics
curl http://clearvestnic.ru:5177/settings
```
- Ожидаем: HTTP 200, содержит `<div id="root">` (не 404)

### 3. UI функционал
- Открыть `clearvestnic.ru:5177`
- Навигация: Analytics, Settings, Diagram — работают
- Экспорт CSV/XLSX из Analytics — работает
- Фильтры, пагинация 20/50/100 — работают

### 4. Нет HMR dev-соединений
- DevTools → Network → WS
- Ожидаем: 0 WebSocket подключений (не должно быть `vite` HMR)

### 5. Cache headers
```bash
curl -I http://clearvestnic.ru:5177/assets/index-*.js
```
- Ожидаем: `cache-control: public, max-age=31536000, immutable`

## Критерии приёмки
- Все 5 сценариев PASS
- Стенд доступен по `clearvestnic.ru:5177`
- Zero downtime deploy (<5 мин простоя)
