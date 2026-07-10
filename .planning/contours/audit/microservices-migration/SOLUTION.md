# ProcessMap — Вынос notifications (error_events) в микросервис

**Контур:** `/opt/processmap-test` (`root@clearvestnic.ru`)  
**Ветка:** `main`  
**Цель:** вынести домен `notifications` (`error_events`) в отдельный микросервис, сохранив работу фронтенда и монолита, не меняя схему БД.

> **Дисциплина:** processmap agents.  
> **Артефакты:** `AUDIT.md`, `5-PLANE.md`, `SOLUTION.md`, `VERIFICATION.md`, `EXEC_REPORT.md`, `READY_FOR_REVIEW`.  
> **Тестирование:** только `clearvestnic.ru:5177`.

---

## Phase 0 — Контекст и ограничения

### Текущее состояние

- `backend/app/error_events/` — schema + domain + background.
- `backend/app/routers/error_events.py` — единый endpoint `POST /api/telemetry/error-events`.
- `backend/app/routers/admin.py` — админские endpoints `GET /api/admin/error-events` и `GET /api/admin/error-events/{event_id}`.
- `backend/app/storage.py` — CRUD для таблицы `error_events` (`append_error_event`, `get_error_event`, `list_error_events`, `count_error_events`, `cleanup_error_events`).
- Аутентификация — JWT HS256, secret из `JWT_SECRET`. Роль/организация живут в БД (`users`, `org_memberships`).

### Ограничения

- Не менять frontend.
- Не менять схему БД (общая PostgreSQL).
- Не удалять старый код монолита сразу (оставить fallback).
- Не деплоить на prod без approve.
- Тестировать только на `clearvestnic.ru:5177`.

---

## Phase 0.5 — Архитектурное решение: коммуникация и технологии

### 0.1 Выбор протокола: монолит ↔ notifications service

| Вариант | За | Против | Решение |
|---|---|---|---|
| **HTTP REST** | Уже есть nginx; нулевая доп. инфраструктура; простой fallback (503); естественно для CRUD | Дополнительный network hop (~1-5ms локально) | ✅ **Выбрано** |
| gRPC | Производительность, строгие контракты | Требует proto, grpc-сервер/клиент, сложнее debug | ❌ |
| RabbitMQ / Celery | Асинхронность, буфер при downtime | Нужен брокер, сложнее гарантировать доставку и ordering | ❌ (на старте) |

**Обоснование:**

- Notifications домен в текущем виде — это не high-throughput event stream, а CRUD над `error_events` и будущими notification entities.
- Все существующие потребители (`POST /api/telemetry/error-events`, `GET /api/admin/error-events*`) ожидают синхронный ответ.
- HTTP REST позволяет сразу использовать nginx path-based routing (`/api/notifications/*` → `notifications:8000`) без новых компонентов.
- Fallback на 503 реализуется тривиально в монолите.
- В будущем, если ingest станет высоконагруженным, можно добавить **RabbitMQ/Celery** как внутренний async pipeline внутри notifications service, не меняя внешнего API.

### 0.2 Стек нового сервиса

- **Framework:** FastAPI (Pydantic v2).
- **DB:** общая PostgreSQL, отдельная schema `notifications` не создаётся на этом этапе.
- **DB access:** собственный repository-слой, копия SQL из `backend/app/storage.py`.
- **Auth:** JWT decode (shared secret) + lookup `users` / `org_memberships` в общей БД.
- **HTTP client в монолите:** `httpx` с таймаутом 5s.
- **Deploy:** Docker Compose (позже — k8s).
- **Observability:** structured logging + Prometheus `/metrics` endpoint (опционально).

### 0.3 Границы и независимость

- Новый сервис **не импортирует** `backend.app.*`.
- DTO и репозиторий копируются/адаптируются из монолита.
- Все общие данные (`users`, `org_memberships`) читаются read-only через собственное DB-подключение.

---

## Phase 1 — Подготовка внутри монолита

### Цель

Вынести чистый DTO и repository для `error_events`, чтобы их можно было переиспользовать и в монолите, и в новом сервисе.

### Задачи

1. **Audit зависимостей** — подтвердить, что `error_events` не импортирует другие доменные модули.
2. **Shared DTO** — создать `backend/app/shared/dto/error_event_dto.py`.
3. **Repository** — создать `backend/app/repositories/error_event_repo.py`.
4. **Рефакторинг монолита** — использовать DTO/repo в `backend/app/routers/error_events.py` и `backend/app/routers/admin.py`.
5. **Тесты** — добавить `backend/tests/test_error_event_dto.py`, `backend/tests/test_error_event_repo.py`; убедиться, что `test_admin_error_events_retrieval.py` зелёный.

### Детали Phase 1

#### 1.1 `backend/app/shared/dto/error_event_dto.py`

Модели:

- `ErrorEventIn` — input payload (без `id`, `ingested_at`).
- `ErrorEventOut` — stored representation.
- `ErrorEventListOut` — list + pagination.
- `ErrorEventPatchIn` — поля для PATCH (status, severity, message, context_json).

Правила:

- `extra="forbid"`.
- Валидация `severity`, `source`, `event_type` — как в `error_events/schema.py`.
- Без зависимостей от `fastapi.Request`.

#### 1.2 `backend/app/repositories/error_event_repo.py`

Функции:

- `append_error_event(dto: ErrorEventIn, *, trusted_user_id, trusted_org_id, request_context) -> ErrorEventOut`
- `get_error_event(event_id: str) -> ErrorEventOut | None`
- `list_error_events(filters, limit, offset, order) -> list[ErrorEventOut]`
- `count_error_events(filters) -> int`
- `update_error_event(event_id, patch) -> ErrorEventOut | None`
- `delete_error_event(event_id) -> bool`
- `cleanup_error_events(retention_days) -> int`

Репозиторий использует `backend/app/storage.py` (shared storage) — БД пока общая.

#### 1.3 Рефакторинг `backend/app/routers/error_events.py`

- Принимать `ErrorEventIn` из DTO.
- Делегировать сохранение в `error_event_repo.append_error_event`.
- Возвращать `ErrorEventOut`.

#### 1.4 Рефакторинг `backend/app/routers/admin.py`

- Использовать `error_event_repo.list_error_events` / `get_error_event` вместо прямых вызовов `storage.py`.
- Сохранить существующую авторизацию (`_telemetry_read_context`).

#### 1.5 Тесты

- `backend/tests/test_error_event_dto.py` — валидация DTO.
- `backend/tests/test_error_event_repo.py` — CRUD на SQLite (использовать `conftest.py` fixture).
- Перезапустить `backend/tests/test_admin_error_events_retrieval.py` — должен остаться зелёным.

### Критерии готовности Phase 1

- [ ] `pytest backend/tests/test_error_event_dto.py backend/tests/test_error_event_repo.py backend/tests/test_admin_error_events_retrieval.py` — PASS.
- [ ] `backend/app/routers/error_events.py` использует `error_event_repo`.
- [ ] `backend/app/routers/admin.py` использует `error_event_repo`.
- [ ] Новые файлы не импортируют `error_events/domain.py` / `error_events/schema.py` (чтобы не тянуть legacy в новый сервис).

---

## Phase 2 — Создание нового сервиса

### Цель

Создать `backend/services/notifications/` — автономный FastAPI-сервис с собственным Dockerfile.

### Структура

```
backend/services/notifications/
├── main.py
├── requirements.txt
├── Dockerfile
├── pyproject.toml (опционально)
├── shared/
│   └── dto/
│       └── error_event_dto.py   # symlink или копия из backend/app/shared/dto/
├── repositories/
│   ├── __init__.py
│   └── error_event_repo.py      # копия из backend/app/repositories/
├── services/
│   ├── __init__.py
│   └── auth_service.py          # JWT decode + DB membership lookup
├── routers/
│   ├── __init__.py
│   └── error_events.py          # endpoints
├── db.py                        # подключение к PostgreSQL/SQLite
└── tests/
    ├── test_error_events.py
    └── test_repo.py
```

### Endpoints нового сервиса

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/error_events` | Ingest ошибки/события | Valid JWT (как текущий telemetry) |
| GET | `/error_events` | List + filters | Admin / auditor / org_admin |
| GET | `/error_events/{event_id}` | Detail | Admin / auditor / org_admin |
| PATCH | `/error_events/{event_id}` | Update | Admin / auditor / org_admin |
| DELETE | `/error_events/{event_id}` | Delete | Admin / org_admin |
| GET | `/health` | Health check | Public |

### Auth service

- `decode_access_token(token)` — HMAC HS256, `JWT_SECRET`.
- `resolve_user_context(token, active_org_id_header)` → `(user_id, org_id, role, is_admin)`.
- Проверка membership через прямой запрос к БД (`users`, `org_memberships`).
- Для `POST /error_events` — достаточно valid user + org membership.
- Для `GET/PATCH/DELETE` — `is_admin=True` или `role in {"org_owner","org_admin","auditor"}`.

### Критерии готовности Phase 2

- [ ] `python -m notifications.main` запускается локально.
- [ ] `pytest backend/services/notifications/tests/` — PASS.
- [ ] `curl http://localhost:8001/health` → `{"status":"ok"}`.

---

## Phase 3 — Инфраструктура

### 3.1 Docker Compose

Добавить в `docker-compose.yml`:

```yaml
notifications:
  build:
    context: ./backend/services/notifications
    dockerfile: Dockerfile
  env_file: .env
  environment:
    - DATABASE_URL=${DATABASE_URL}
    - JWT_SECRET=${JWT_SECRET}
    - REDIS_URL=${REDIS_URL}
  ports:
    - "8001:8000"
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
```

Аналогично в `docker-compose.prod.yml` / `docker-compose.stage.yml` (без `ports` в prod).

### 3.2 Nginx routing

В `deploy/nginx/default.prod.internal.conf` добавить:

```nginx
upstream notifications {
    server notifications:8000;
}

location /api/notifications/ {
    proxy_pass http://notifications/;
    proxy_http_version 1.1;
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Fallback для старого пути (frontend не меняется)
location /api/telemetry/error-events {
    proxy_pass http://notifications/error_events;
    ...
}
```

### 3.3 Environment

Добавить в `.env.example`:

```bash
NOTIFICATIONS_SERVICE_URL=http://notifications:8000
# DATABASE_URL_NOTIFICATIONS=${DATABASE_URL}  # future use
```

### 3.4 CI/CD

- Добавить GitHub Actions step `build-notifications`.
- Build только при изменении `backend/services/notifications/**`.

### Критерии готовности Phase 3

- [ ] `docker-compose up notifications` запускается.
- [ ] `curl http://localhost:8001/health` → ok.
- [ ] `curl http://localhost/api/notifications/error_events` через nginx → проксирует на сервис.

---

## Phase 4 — Миграция роутов в монолите

### Цель

Переключить `/api/telemetry/error-events` и `/api/admin/error-events*` на новый сервис, сохранив fallback.

### Задачи

1. **Монолит `POST /api/telemetry/error-events`**:
   - Заменить внутреннюю логику на `httpx` POST к `http://notifications:8000/error_events`.
   - При недоступности сервиса — вернуть `503` с `{"ok": false, "detail": "notifications service unavailable"}`.
   - Логировать локально `logger.warning`, чтобы не потерять событие.

2. **Монолит `GET /api/admin/error-events*`**:
   - Аналогично проксировать параметры query в `GET /error_events` нового сервиса.
   - Fallback `503`.

3. **Удалить прямые вызовы `storage.*error_event*` из монолита** (кроме `cleanup_error_events`, если он используется cron).

### Критерии готовности Phase 4

- [ ] Все существующие endpoints `/api/notifications/*`, `/api/telemetry/error-events`, `/api/admin/error-events*` работают.
- [ ] При `docker-compose stop notifications` монолит возвращает 503, а не 500/краш.
- [ ] Frontend не менялся.
- [ ] Добавочный latency < 50ms (измерить через `curl -w "%{time_total}"`).

---

## Phase 5 — Verification & deploy

### 5.1 Локальная проверка

```bash
docker-compose up -d notifications

curl -s http://localhost:8001/health

# через nginx
curl -s http://localhost/api/notifications/error_events \
  -H "Authorization: Bearer $TOKEN"
```

### 5.2 Тесты

- Unit tests нового сервиса.
- Integration tests через nginx.
- Regression: `pytest backend/tests/test_admin_error_events_retrieval.py`.

### 5.3 Deploy на `clearvestnic.ru:5177`

1. Собрать образ:
   ```bash
   docker-compose -f docker-compose.yml build notifications
   ```
2. Deploy:
   ```bash
   docker-compose up -d notifications
   docker-compose restart gateway
   ```
3. Проверить:
   - `curl https://clearvestnic.ru:5177/api/notifications/health`
   - `curl https://clearvestnic.ru:5177/api/telemetry/error-events -X POST ...`
   - Проверить fallback: `docker-compose stop notifications`, повторить POST → 503.

### 5.4 Deploy на stage (после explicit approve)

- GitHub Actions auto-deploy.
- Проверить логи, отсутствие 502.

### Критерии готовности Phase 5

- [ ] Новый сервис запущен на `clearvestnic.ru:5177`.
- [ ] `/api/notifications/*` и `/api/telemetry/error-events` работают.
- [ ] Fallback 503 работает.
- [ ] Тесты PASS.
- [ ] Stage deploy проверен (после approve).

---

## Риски и mitigations

| Риск | Mitigation |
|---|---|
| Новый сервис не стартует из-за зависимостей | Минимальный `requirements.txt`; health-check |
| Потеря error events при downtime сервиса | Fallback 503 + локальный warning-лог; в будущем — outbox/queue |
| Рост latency | nginx keepalive + тот же data-center; цель <50ms |
| Циклический импорт / зависимость от монолита | Новый сервис НЕ импортирует `backend.app.*`; использует shared DTO и свой DB-layer |
| RBAC расхождение | Auth service читает те же таблицы users/org_memberships из общей БД |

---

## Точка невозврата

После **Phase 4** маршруты `/api/notifications/*` и `/api/telemetry/error-events` направлены на новый сервис. Откат возможен за 5 минут:

1. Закомментировать nginx `location /api/notifications/`.
2. Вернуть исходную реализацию в `backend/app/routers/error_events.py` / `admin.py`.
3. Перезапустить `gateway` и `api`.

После **Phase 5 (deploy на stage/prod)** откат требует координации и может повлиять на накопленные в новой схеме данные (если БД разделена).

---

## Fallback plan

Если миграция не удалась:

1. Остановить `notifications` сервис.
2. Отключить nginx routing.
3. Вернуть `backend/app/routers/error_events.py` и `admin.py` к состоянию до Phase 4.
4. Перезапустить `api` и `gateway`.
5. Данные остаются в таблице `error_events` общей БД — ничего не теряется.
