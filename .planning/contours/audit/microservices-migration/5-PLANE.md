# ProcessMap — 5-PLANE анализ (microservices migration contour)

**Контур:** `/opt/processmap-test` на `root@clearvestnic.ru`, ветка `main`, HEAD `41abd486`.

---

## 1. CODE — структура кода и связанность

### 1.1 Архитектурный слой

```
backend/app/
├── main.py                     # точка входа FastAPI
├── startup/                    # app factory, middleware, boot checks
├── routers/                    # FastAPI endpoints (~30 файлов)
├── services/                   # бизнес-логика (частично вынесена из legacy)
├── save_services/              # доменные write-сервисы (analytics, property, status)
├── repositories/               # новый DB-access слой (org/project/session)
├── ai/                         # AI/LLM agents
├── rag/                        # поиск / RAG
├── clipboard/                  # копирование/вставка BPMN
├── exporters/                  # BPMN/Mermaid/YAML экспорт
├── error_events/               # телеметрия / мониторинг ошибок
├── validators/                 # валидация процесса
├── utils/                      # authz, response builders, helpers
├── storage.py                  # единый файл сырого SQL для всех таблиц
├── models.py                   # Pydantic-модели (Session, Project, User …)
├── schemas/                    # Pydantic input/output схемы
├── _legacy_main.py             # ~10.8k строк legacy-кода
└── legacy/                     # legacy route registry, request context
```

### 1.2 Проблемы на плоскости CODE

| Проблема | Доказательство | Влияние на миграцию |
|---|---|---|
| **God-file `storage.py`** | 38 таблиц, сырой SQL | Невозможно выделить сервис без переноса/копирования его кусков |
| **God-file `_legacy_main.py`** | ~10.8k строк, импортируется 5+ сервисами | Циклические зависимости; любой сервис, использующий legacy, не выносится |
| **Shared Pydantic `Session`** | используется 8 сервисами | Требуется разделение на internal + shared DTO |
| **Cyclic imports** | 32 SCC: `_legacy_main` ↔ `services.*`, Celery ↔ tasks | Блокирует независимую компиляцию сервисов |
| **Отсутствие чётких границ** | `process-core` импортирует `rbac` (9 связей), `sessions` зависит от `canvas-engine` | Раннее разделение приведёт к distributed monolith |

### 1.3 Метрики связанности

- Внутренние import-связи между доменными сервисами: **34** (без shared-*).
- process-core → rbac: **9** связей (самая сильная).
- sessions → rbac/process-core/canvas-engine: **5** связей.
- notifications: **0** доменных связей.

---

## 2. WORKSPACE — организация репозитория и командных границ

### 2.1 Текущее состояние

- **Mono-repo**, один `backend/app/` пакет.
- **Веточная стратегия:** feature/fix/audit/cleanup префиксы; `main` — текущий релизный трек.
- **Контуры:** проект использует `.planning/contours/` для ограниченных задач.
- **Рабочие деревья:** `.worktrees/` присутствует, используется для параллельных фиксов.

### 2.2 Проблемы

| Проблема | Описание | Риск миграции |
|---|---|---|
| **Одна кодовая база для всех доменов** | Нет модульных границ на уровне сборки | Изменение в одном сервисе может сломать другой |
| **Legacy смешан с новым кодом** | `_legacy_main.py` лежит рядом с `services/` | Постепенный рефакторинг затруднён; нужна чёткая политика «legacy только читаем, не расширяем» |
| **Shared utils/models без versioning** | `utils/`, `models.py` изменяются всеми | Breaking change в shared kernel = регрессия во всех сервисах |
| **Нет CODEOWNERS** | не видно владельцев доменов | Микросервисы требуют явных командных границ |

### 2.3 Рекомендации по WORKSPACE

1. Ввести `CODEOWNERS` для доменных папок (`ai/`, `rag/`, `error_events/` и т.д.).
2. Запретить прямые импорты из `_legacy_main.py` в новые сервисы; завести линтер/deptrac.
3. Вынести shared kernel (`models.py`, `schemas/`, `utils/auth*`) в отдельный внутренний пакет с semver.
4. Каждый новый микросервис — отдельная директория/образ, но оставаться в mono-repo на время миграции.

---

## 3. DATA — данные, схемы, владение

### 3.1 Хранилище

- **PostgreSQL** прод, **SQLite** локально (определяется `DATABASE_URL`).
- **38 таблиц** в одной схеме.
- Сырой SQL через `psycopg` / `sqlite3` в `storage.py`.
- Нет SQLAlchemy ORM; нет миграций Alembic (схема создаётся `CREATE TABLE IF NOT EXISTS` при старте).

### 3.2 Shared tables — топ

| Таблица | # сервисов | Комментарий |
|---|---|---|
| `sessions` | 11 | ядро; требует разделения последним |
| `projects` | 9 | контейнер сессий; читается всеми |
| `orgs` | 9 | tenant; владелец — rbac |
| `users` | 5 | identity; владелец — rbac |
| `workspaces` | 5 | scope; владелец — rbac |
| `error_events` | 5 | владелец — notifications |

### 3.3 Проблемы DATA

| Проблема | Влияние |
|---|---|
| **Single schema, single storage file** | DB split — самая дорогая операция |
| **Отсутствие миграций Alembic** | Нельзя безопасно дробить схему; нужно внедрить до DB split |
| **Foreign keys между доменами** | `sessions.project_id`, `note_threads.session_id`, `project_memberships.*` — связи между будущими сервисами |
| **Pydantic-модели как shared data contract** | `Session`, `Node`, `Project` таскаются между сервисами; нужны slim DTO |

### 3.4 Рекомендации по DATA

1. Внедрить **Alembic** и зафиксировать текущую схему как baseline.
2. Ввести доменное владение таблицами; вынести cross-domain FK в eventual-consistency / soft references.
3. До DB split каждый сервис получает собственный repository-module, но все живут в одной БД.
4. Планировать **CDC / outbox** для событий, влияющих на несколько доменов.

---

## 4. ENV — окружение, конфигурация, зависимости

### 4.1 Конфигурация

- `backend/app/settings.py` + `backend/app/db/config.py`.
- `DATABASE_URL`, `REDIS_URL`, `FPC_DB_BACKEND`, `FPC_*` переменные.
- Конфигурация читается из env, часть — из `.env`.

### 4.2 Зависимости

- `requirements.txt` один на всё backend.
- Redis — обязательный (`REDIS_REQUIRED=1`).
- Celery + Postgres pool.

### 4.3 Проблемы ENV

| Проблема | Влияние |
|---|---|
| **Один requirements.txt** | Любой сервис тянет все зависимости (AI, RAG, BPMN) |
| **Глобальные context vars** | `_REQ_USER_ID`, `_REQ_ORG_ID` в `storage.py` — shared state; не переносится в отдельный сервис |
| **Нет service-specific конфигов** | Нельзя масштабировать/ограничивать ресурсы отдельного домена |
| **Redis URL — единая точка отказа** | Все сервисы зависят от одного Redis |

### 4.4 Рекомендации по ENV

1. Разделить `requirements.txt` по сервисам (`requirements-agents.txt`, `requirements-search.txt` и т.д.).
2. Заменить context vars на явный `request_context`, передаваемый в сервисы / передаваемый через gateway headers.
3. Ввести service-specific env-файлы и лимиты ресурсов.
4. Выделить отдельные Redis DB / инстансы для cache, locks, pub/sub.

---

## 5. SERVING — развёртывание, сетевой слой, масштабирование

### 5.1 Текущая topology

```
Internet → nginx gateway (Docker) → api:8000 (FastAPI mono)
                                      ↓
                                  celery-worker
                                      ↓
                                  postgres, redis
```

- Nginx gateway проксирует `/api/*`, `/health/*`, `/version` на единый `api` контейнер.
- Все остальные пути — static frontend.
- Docker Compose с healthchecks.

### 5.2 Проблемы SERVING

| Проблема | Влияние |
|---|---|
| **Один backend-контейнер** | Масштабируется только целиком; нельзя масштабировать AI/RAG отдельно |
| **Статичный nginx конфиг** | `set $api_host api;` — жёстко задан сервис; нет routing по пути к микросервисам |
| **Нет service discovery** | Новый сервис требует ручного правила nginx и пересборки gateway |
| **Нет observability per-service** | Нет Prometheus/Grafana; error_events — единственная телеметрия |
| **Единый health-check `/version`** | Не отражает состояние отдельных доменов |

### 5.3 Рекомендации по SERVING

1. **API Gateway:** сохранить nginx в краткосрочной перспективе, но перейти на path-based routing (`/api/v1/search/*` → search-сервис, `/api/v1/agents/*` → agents-сервис). В среднесрочной — рассмотреть Kong/Traefik.
2. **Service discovery:** начать с Docker Compose DNS (`service:` имя); для prod — Consul или Kubernetes DNS.
3. **Message broker:** Redis Pub/Sub оставить для cache/presence; для durable events — Kafka или RabbitMQ.
4. **Monitoring:** Prometheus + Grafana на каждый сервис; structured logging; distributed tracing.
5. **CI/CD:** matrix-build — отдельные job'ы для каждого образа; deploy только изменённых сервисов.

---

## 6. Сводка по плоскостям

| Плоскость | Зрелость к микросервисам | Главный риск |
|---|---|---|
| CODE | Низкая | Legacy + shared storage + циклические импорты |
| WORKSPACE | Средняя | Mono-repo удобен, но нет доменных границ |
| DATA | Низкая | Single schema, нет миграций, shared tables |
| ENV | Средняя | env гибкие, но один requirements и context vars |
| SERVING | Средняя | Nginx есть, но статичен; нет discovery/monitoring |

**Главный вывод:** миграция возможна, но только поэтапная. Первые шаги должны быть **инфраструктурными и рефакторинговыми**, а не сразу выносом сервисов в отдельные контейнеры.
