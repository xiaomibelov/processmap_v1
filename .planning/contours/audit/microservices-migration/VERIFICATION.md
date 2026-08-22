# ProcessMap Notifications Microservice — Verification Report

**Контур:** `clearvestnic.ru:5177` (project `processmap_v1` на `root@clearvestnic.ru`)  
**Дата:** 2026-06-30  
**Сервис:** `notifications` (error events + notifications + system events)  

---

## 1. Unit / service tests

### 1.1 Notifications service

```bash
cd /opt/processmap-test/backend/services/notifications
/opt/processmap-test/backend/.venv/bin/python -m pytest tests/ -q
```

**Результат:** `18 passed`

Покрыты:
- health endpoint
- error events: POST/GET/PATCH/DELETE
- notifications: POST/GET/PATCH/DELETE, валидация priority
- system events: POST/GET/PATCH/DELETE
- repository CRUD для error events

### 1.2 Монолит (регрессия)

```bash
cd /opt/processmap-test
backend/.venv/bin/python -m pytest \
  backend/tests/test_error_event_dto.py \
  backend/tests/test_error_event_repo.py \
  backend/tests/test_admin_error_events_retrieval.py -q
```

**Результат:** `25 passed`

---

## 2. Container / integration checks

### 2.1 Образ сервиса

```bash
cd /opt/processmap-test/backend/services/notifications
docker build -t processmap_v1-notifications:latest .
```

**Результат:** `Successfully built`

### 2.2 Запуск в составе проекта `processmap_v1`

```bash
cd /opt/processmap-test
NOTIFICATIONS_HOST_PORT=8008 docker compose -p processmap_v1 -f docker-compose.yml up -d --build notifications
```

**Результат:** контейнер `processmap_v1-notifications-1` запущен, health-check зелёный.

### 2.3 Прямой запрос к сервису

```bash
curl -s http://localhost:8008/health
```

```json
{"status":"ok","service":"notifications"}
```

---

## 3. End-to-end через `clearvestnic.ru:5177`

### 3.1 Все три домена через frontend Vite-proxy

```bash
# error events
curl -s -X POST "http://clearvestnic.ru:5177/api/notifications/error_events" \
  -H "Authorization: Bearer <token>" \
  -H "X-Active-Org-Id: dcc120964813" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"api_failure","severity":"error","message":"phase3 error event","source":"frontend"}'

# notifications
curl -s -X POST "http://clearvestnic.ru:5177/api/notifications/notifications" \
  -H "Authorization: Bearer <token>" \
  -H "X-Active-Org-Id: dcc120964813" \
  -H "Content-Type: application/json" \
  -d '{"type":"info","title":"phase3 notification","message":"hello","priority":"normal"}'

# system events
curl -s -X POST "http://clearvestnic.ru:5177/api/notifications/system-events" \
  -H "Authorization: Bearer <token>" \
  -H "X-Active-Org-Id: dcc120964813" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"deployment","severity":"info","message":"phase3 deploy","source":"backend"}'
```

**Результат:** все три запроса вернули `{"ok":true,"item":{"id":"..."}}`.

### 3.2 GET list для всех доменов

```bash
curl -s "http://clearvestnic.ru:5177/api/notifications/error_events?limit=1" ...
curl -s "http://clearvestnic.ru:5177/api/notifications/notifications?limit=1" ...
curl -s "http://clearvestnic.ru:5177/api/notifications/system-events?limit=1" ...
```

**Результат:** каждый list endpoint возвращает созданные записи.

### 3.3 Legacy endpoint `/api/telemetry/error-events`

**Результат:** продолжает работать и делегировать запрос в сервис.

---

## 4. Fallback test

```bash
docker stop processmap_v1-notifications-1
# POST /api/notifications/notifications  -> сохранено в монолите
curl -s -X POST "http://clearvestnic.ru:5177/api/notifications/notifications" ...
# POST /api/notifications/system-events -> сохранено в монолите
curl -s -X POST "http://clearvestnic.ru:5177/api/notifications/system-events" ...
docker start processmap_v1-notifications-1
```

**Результат:** при остановленном сервисе монолит сохранил записи локально. После подъёма сервиса новые запросы снова делегируются.

---

## 5. Checklist

| Критерий | Статус |
|---|---|
| Сервис `notifications` запускается отдельно | ✅ |
| `/api/notifications/error_events` работает | ✅ |
| `/api/notifications/notifications` работает | ✅ |
| `/api/notifications/system-events` работает | ✅ |
| Legacy `/api/telemetry/error-events` работает и делегирует в сервис | ✅ |
| Монолит не ломается при недоступности сервиса (fallback) | ✅ |
| Unit tests сервиса: PASS (18) | ✅ |
| Regression tests монолита: PASS (25) | ✅ |
| Frontend не менялся | ✅ |
| Deploy на `clearvestnic.ru:5177` проверен | ✅ |

---

## 6. Известные ограничения

- `JWT_SECRET` в compose имеет дефолт `dev-insecure-change-me`. Для stage/prod должен быть переопределён через env.
- `/api/admin/error-events*` остались в монолите и используют локальный repo (read-only). При желании их тоже можно перевести на сервис.
- Для production рекомендуется добавить nginx gateway вместо прямого Vite-proxy.
