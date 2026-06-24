# TESTS: Smoke-test перехода на nginx

## Подготовка
- Стенд: `http://clearvestnic.ru:5177`
- Контейнер: `processmap_v1-frontend-1`

## Автоматические проверки (curl)

### 1. Корень отдаёт 200
```bash
curl -I http://clearvestnic.ru:5177/
# HTTP/1.1 200 OK
# Cache-Control: no-cache, no-store, must-revalidate
```

### 2. SPA fallback — `/analytics` возвращает `index.html`, не 404
```bash
curl -s http://clearvestnic.ru:5177/analytics | head -1
# <!doctype html>
```

### 3. Assets отдаются с gzip
```bash
curl -I -H 'Accept-Encoding: gzip' http://clearvestnic.ru:5177/assets/index-*.css
# Content-Encoding: gzip
# Cache-Control: public, max-age=31536000, immutable
```

### 4. API proxy работает
```bash
curl -fsS http://clearvestnic.ru:5177/version
# {"version": "..."}
```

### 5. Dev/HMR больше не используется
- DevTools → Network: отсутствуют WebSocket-подключения к `wss://`/`ws://` на 5177.
- Response headers: `Server: nginx/1.27.x`, не `Vite`.

## Ручные проверки

### 6. Приложение работает
- Открыть `http://clearvestnic.ru:5177/app`.
- Войти, открыть проект/сессию.
- Перейти в Аналитика → Свойства.
- Убедиться, что:
  - таблица загружается;
  - пагинация 20/50/100 работает;
  - экспорт CSV/XLSX скачивает файл.

### 7. Контейнер healthy
```bash
docker ps --filter name=processmap_v1-frontend-1 --format 'table {{.Names}}\t{{.Status}}'
# processmap_v1-frontend-1   Up X minutes (healthy)
```

### 8. Нет dev-only логики
- В DevTools Console не должно быть ошибок `WebSocket connection to ... failed`.
- Вкладка Network: нет запросов к `/@vite/client` или `/.vite/`.

## Критерии приёмки
- [ ] `curl -I http://clearvestnic.ru:5177/` → `HTTP/1.1 200 OK`.
- [ ] `curl http://clearvestnic.ru:5177/analytics` → содержит `<!doctype html>`.
- [ ] `curl -I -H 'Accept-Encoding: gzip' .../assets/index-*.css` → `Content-Encoding: gzip`.
- [ ] `curl http://clearvestnic.ru:5177/version` → JSON от API.
- [ ] Приложение открывается, навигация и экспорт работают.
- [ ] Контейнер `processmap_v1-frontend-1` в статусе `(healthy)`.
- [ ] Нет WebSocket/HMR подключений в DevTools.
