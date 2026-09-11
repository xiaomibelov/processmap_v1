# ProcessMap Notifications Microservice — Execution Report

**Контур:** `/opt/processmap-test` на `root@clearvestnic.ru` (тестовое окружение `clearvestnic.ru:5177`, проект `processmap_v1`)  
**Дата:** 2026-06-30  

---

## Summary

Выделен отдельный микросервис `notifications`, обслуживающий три домена:

1. `error_events`
2. `notifications`
3. `system_events`

Монолит сохранил обратную совместимость: старые endpoints работают и делегируют запросы в сервис по HTTP. При недоступности сервиса монолит fallback'ится на локальные repositories.

---

## Phase 0 — Архитектурное решение

**Коммуникация монолит ↔ notifications service:** HTTP REST.

**Обоснование:**
- Нет дополнительной инфраструктуры (брокер не нужен).
- Все потребители ожидают синхронный ответ.
- Простой fallback (503 / локальный repo).
- Nginx path-based routing (`/api/notifications/*`) готов к использованию.

---

## Phase 1 — Подготовка внутри монолита

Создан shared DTO и repository для всех трёх доменов:

- `backend/app/shared/dto/error_event_dto.py`
- `backend/app/shared/dto/notification_dto.py`
- `backend/app/shared/dto/system_event_dto.py`
- `backend/app/shared/dto/error_event_helpers.py`
- `backend/app/repositories/error_event_repo.py`
- `backend/app/repositories/notification_repo.py`
- `backend/app/repositories/system_event_repo.py`
- `backend/tests/test_error_event_dto.py`
- `backend/tests/test_error_event_repo.py`

В `backend/app/storage.py` добавлены `update_error_event()` и `delete_error_event()`.

---

## Phase 2 — Новый сервис

Создана структура `backend/services/notifications/`:

```
backend/services/notifications/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── db.py
│   ├── dependencies.py
│   ├── routers/
│   │   ├── health.py
│   │   ├── error_events.py
│   │   ├── notifications.py
│   │   └── system_events.py
│   ├── services/
│   │   └── auth_service.py
│   ├── repositories/
│   │   ├── error_event_repo.py
│   │   ├── notification_repo.py
│   │   └── system_event_repo.py
│   └── shared/dto/
│       ├── error_event_dto.py
│       ├── error_event_helpers.py
│       ├── notification_dto.py
│       └── system_event_dto.py
├── tests/
│   ├── conftest.py
│   ├── test_error_events.py
│   ├── test_notifications.py
│   ├── test_system_events.py
│   └── test_repo.py
├── Dockerfile
├── requirements.txt
└── docker-compose.yml
```

Сервис не импортирует `backend.app.*`.

---

## Phase 3 — Инфраструктура

- `docker-compose.yml`: добавлен сервис `notifications` (порт `${NOTIFICATIONS_HOST_PORT:-8008}:8000`).
- `deploy/nginx/default.prod.internal.conf`: добавлен `location /api/notifications/` → `notifications:8000`.
- `.github/workflows/deploy-stage.yml`: сервис включён в checkout, build и up.

---

## Phase 4 — Миграция монолита

- `backend/app/clients/notifications_client.py`: HTTP-клиент ко всем трём доменам.
- `backend/app/routers/error_events.py`:
  - `POST /api/telemetry/error-events` делегирует в сервис, fallback на repo.
  - Proxy endpoints под `/api/notifications/*` для error events, notifications и system events.

---

## Phase 5 — Verification

- Unit tests сервиса: **18 passed**.
- Regression tests монолита: **25 passed**.
- Проверка на `clearvestnic.ru:5177`: POST/GET для всех трёх доменов работают.
- Fallback: при остановленном сервисе монолит сохраняет записи локально.

---

## Deploy status

Контейнер `processmap_v1-notifications-1` запущен на тестовом контуре `clearvestnic.ru:5177`.  
Prod deploy не выполнялся (требуется approve).
