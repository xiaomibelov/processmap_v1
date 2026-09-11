# ProcessMap — Phase 1: Аудит монолита (microservices migration contour)

**Контур:** `/opt/processmap-test` на `root@clearvestnic.ru`  
**Ветка:** `main`  
**HEAD:** `41abd486 chore(e2e): make bpmn-v2-properties verification script fully functional`  
**Дата аудита:** 2026-06-30  
**Цель:** понять текущую архитектуру FastAPI-монолита, картировать доменные сервисы, измерить их связанность и подготовить данные для приоритизации выноса в микросервисы.

---

## 1. Executive summary

- Всего проанализировано **133 Python-модуля** в `backend/app/`.
- Монолит состоит из одного FastAPI-приложения (`backend/app/main.py`), которое импортирует почти все доменные роутеры через `shared/core`.
- База данных — **PostgreSQL** (в dev — SQLite) с централизованным слоем сырого SQL в `backend/app/storage.py` и репозиториями в `backend/app/repositories/`.
- Наиболее связанные домены: **`sessions`**, **`process-core`**, **`rbac`**. Они образуют ядро продукта.
- Наиболее изолированные домены: **`notifications`** (`error_events`), **`search`** (`rag`), **`agents`** (`ai`). Их проще всего выносить первыми.
- Главный архитектурный риск — **`_legacy_main.py`**, `backend/app/storage.py` и циклические импорты между legacy-слоем и новыми сервисами. Любая миграция должна начинаться с декомпозиции legacy-ядра, а не с простого «вырезания» модуля.

---

## 2. Scope & methodology

### 2.1 Что входит в аудит

- `backend/app/` — все `.py`-файлы.
- `docker-compose*.yml`, `Dockerfile`, `Dockerfile.gateway.prod`, `deploy/nginx/`.
- Схема БД в `backend/app/storage.py`.

### 2.2 Что НЕ входит

- Frontend-код.
- История git, CI/CD пайплайны вне docker-compose.
- Логика рантайма / e2e-поведение.

### 2.3 Методика

1. **AST-анализ импортов** — построен граф `модуль → импортируемые внутренние модули`.
2. **Поиск циклических импортов** — алгоритм Тарьяна SCC.
3. **Сканирование таблиц** — извлечены все `CREATE TABLE …` из `storage.py`; поиск ссылок на таблицы в остальных модулях (статический, может давать ложные срабатывания на переменных/полях).
4. **Сканирование схем** — найдены все Pydantic `BaseModel`-классы и их использование.
5. **Сопоставление с концептуальными сервисами** — файлы размечены вручную по доменам из задания.

Скрипт аудита и сырые JSON-результаты:

- `.planning/contours/audit/microservices-migration/scripts/audit_monolith_v2.py`
- `.planning/contours/audit/microservices-migration/reports/audit_raw_v2.json`

---

## 3. Сопоставление файлов и сервисов

| Сервис | Основные файлы / папки | Кол-во модулей |
|---|---|---|
| **agents** | `ai/`, `routers/product_actions_ai.py` | 7 |
| **analytics** | `analytics.py`, `analytics_cache.py`, `analytics_read_model.py`, `metrics.py`, `routers/analytics.py`, `routers/project_analytics.py`, `services/analytics_authz.py`, `save_services/analytics_aggregator/`, `schemas/analytics.py` | 11 |
| **assets** | `exporters/yaml_export.py`, `routers/templates.py`, `services/publish_git_mirror.py` | 3 |
| **canvas-engine** | `clipboard/`, `exporters/bpmn.py`, `exporters/mermaid.py`, `routers/clipboard.py`, `camunda_meta_utils.py`, `services/bpmn_navigation.py`, `overlay_cache.py` | 14 |
| **discussions** | `routers/notes.py` | 1 |
| **notifications** | `error_events/`, `routers/error_events.py`, `alert_rules.py` | 6 |
| **process-core** | `routers/projects.py`, `routers/process_properties_registry.py`, `routers/auto_pass.py`, `routers/explorer.py`, `routers/product_actions_registry.py`, `routers/reference_resolver.py`, `routers/reports.py`, `services/project_service.py`, `save_services/property_save/`, `repositories/project_repo.py`, `validators/`, `normalizer.py`, `auto_pass_engine.py`, `auto_pass_jobs.py`, `auto_pass_telemetry.py`, `rtiers.py`, `glossary.py`, `resources.py` | 23 |
| **rbac** | `auth.py`, `routers/auth.py`, `services/auth_service.py`, `services/org_service.py`, `services/org_invites.py`, `services/org_workspace.py`, `utils/auth_helpers.py`, `utils/authz.py`, `routers/org*.py`, `repositories/org_repo.py` | 14 |
| **search** | `rag/`, `routers/rag.py`, `knowledge/` | 6 |
| **sessions** | `routers/sessions.py`, `routers/sessions_new.py`, `services/session_service.py`, `session_status.py`, `utils/session_helpers.py`, `repositories/session_repo.py`, `cache/session_cache.py`, `save_services/status_service/` | 10 |
| **shared/core** | `main.py`, `startup/`, `settings.py`, `db/`, `celery_app.py`, `tasks.py`, `routers/_shared.py`, `routers/admin.py`, `routers/system.py`, `routers/version.py`, `routers/feature_flags.py`, `routers/reference_resolver.py` (shared), `services/runtime_meta.py` | 18 |
| **shared/models** | `models.py`, `schemas/`, `error_events/schema.py` | 3 |
| **shared/redis** | `redis_client.py`, `redis_cache.py`, `redis_lock.py` | 3 |
| **shared/storage** | `storage.py`, `repositories/` | 5 |
| **shared/utils** | `utils/` (кроме auth_helpers/authz/session_helpers) | 3 |
| **shared/legacy** | `_legacy_main.py`, `legacy/`, `utils/legacy_normalization.py` | 5 |
| **unmapped** | `__init__.py` файлы | 5 |

---

## 4. Матрица зависимостей сервис × сервис

### 4.1 Import-зависимости (количество модульных связей)

| from \ to | agents | analytics | assets | canvas-engine | discussions | notifications | process-core | rbac | search | sessions |
|---|---|---|---|---|---|---|---|---|---|---|
| **agents** | — | — | — | — | — | — | — | 1 | — | — |
| **analytics** | — | — | — | — | — | — | 2 | 1 | — | — |
| **assets** | — | — | — | 1 | — | — | — | 2 | — | — |
| **canvas-engine** | — | 1 | — | — | — | — | — | — | — | — |
| **discussions** | — | — | — | — | — | — | — | 2 | — | — |
| **notifications** | — | — | — | — | — | — | — | — | — | — |
| **process-core** | — | — | — | — | — | 2 | — | 9 | — | 2 |
| **rbac** | — | — | — | — | — | — | 1 | — | — | — |
| **search** | — | — | — | — | — | — | — | 1 | — | — |
| **sessions** | — | 1 | 1 | 2 | — | — | 1 | 2 | — | — |

**Интерпретация:**

- **`notifications`** не импортирует другие доменные сервисы напрямую.
- **`search`** импортирует только `rbac` (авторизация) и `shared/storage`.
- **`agents`** импортирует только `rbac` (проверка прав).
- **`process-core`** — центр тяжести: 9 связей с `rbac`, 2 с `sessions`, 2 с `notifications`.
- **`sessions`** зависит от `process-core`, `rbac`, `canvas-engine`, `analytics`, `assets`.

### 4.2 Shared DB tables (таблицы, используемые обоими сервисами)

| from \ to | agents | analytics | assets | canvas-engine | discussions | notifications | process-core | rbac | search | sessions |
|---|---|---|---|---|---|---|---|---|---|---|
| **agents** | — | equipment, sessions | sessions | equipment | sessions | — | equipment, sessions | sessions | — | equipment, sessions |
| **analytics** | equipment, sessions | — | projects, sessions, workspaces | equipment | projects, sessions | — | equipment, projects, sessions, workspaces | projects, sessions | — | equipment, projects, sessions |
| **assets** | sessions | projects, sessions, workspaces | — | — | projects, sessions | — | orgs, projects, sessions, workspaces | orgs, projects, sessions, templates | — | orgs, projects, sessions |
| **canvas-engine** | equipment | equipment | — | — | — | — | equipment | — | — | equipment |
| **discussions** | sessions | projects, sessions | projects, sessions | — | — | — | projects, sessions | projects, sessions, users | — | projects, sessions |
| **notifications** | — | — | — | — | — | — | error_events | — | — | — |
| **process-core** | equipment, sessions | equipment, projects, sessions, workspaces | orgs, projects, sessions, workspaces | equipment | projects, sessions | error_events | — | orgs, projects, sessions | — | equipment, orgs, projects, sessions |
| **rbac** | sessions | projects, sessions | orgs, projects, sessions, templates | — | projects, sessions, users | — | orgs, projects, sessions | — | — | orgs, projects, sessions |
| **search** | — | — | — | — | — | — | — | — | — | — |
| **sessions** | equipment, sessions | equipment, projects, sessions | orgs, projects, sessions | equipment | projects, sessions | — | equipment, orgs, projects, sessions | orgs, projects, sessions | — | — |

> **Примечание:** это статический поиск строки имени таблицы в коде. `equipment` может встречаться как переменная/поле, поэтому связь через `equipment` между `agents`, `analytics`, `canvas-engine`, `process-core`, `sessions` требует ручной верификации. Безусловно общие таблицы: `sessions`, `projects`, `orgs`, `users`, `workspaces`.

### 4.3 Shared Pydantic schemas / models

| from \ to | agents | analytics | assets | canvas-engine | discussions | notifications | process-core | rbac | search | sessions |
|---|---|---|---|---|---|---|---|---|---|---|
| **agents** | — | 2 | 1 | 3 | — | — | 4 | 1 | 1 | 3 |
| **analytics** | 2 | — | 1 | 2 | — | — | 2 | 1 | 1 | 2 |
| **assets** | 1 | 1 | — | 1 | — | — | 1 | 1 | 1 | 1 |
| **canvas-engine** | 3 | 2 | 1 | — | — | — | 3 | 1 | 1 | 3 |
| **discussions** | — | — | — | — | — | — | — | — | — | — |
| **notifications** | — | — | — | — | — | — | — | — | — | — |
| **process-core** | 4 | 2 | 1 | 3 | — | — | — | 4 | 1 | 4 |
| **rbac** | 1 | 1 | 1 | 1 | — | — | 4 | — | 1 | 2 |
| **search** | 1 | 1 | 1 | 1 | — | — | 1 | 1 | — | 1 |
| **sessions** | 3 | 2 | 1 | 3 | — | — | 4 | 2 | 1 | — |

Наиболее «трансграничные» модели (используются в 2+ доменных сервисах):

| Модель | Определена | Используется в сервисах | Комментарий |
|---|---|---|---|
| `Session` | `models.py` | agents, analytics, assets, canvas-engine, process-core, rbac, search, sessions | **ядро доменной модели**; разделение session-сервиса без неё невозможно |
| `Node` | `models.py` | agents, analytics, canvas-engine, process-core, sessions | часть `Session`, но часто передаётся отдельно |
| `Edge` | `models.py` | agents, canvas-engine, process-core, sessions | часть `Session` |
| `Question` | `models.py` | agents, process-core | AI-вопросы к шагам процесса |
| `Project` | `models.py` | process-core, rbac | проект как контейнер сессий |
| `CreateProjectIn` / `UpdateProjectIn` | `models.py` | process-core, rbac | input-схемы проекта |
| `CreateSessionIn` | `schemas/legacy_api.py` | rbac, sessions | унаследованная схема |
| `SessionMetaPatchIn` | `schemas/legacy_api.py` | process-core, sessions | унаследованная схема |

---

## 5. Shared database tables — детальный разбор

Всего в `storage.py` определено **38 таблиц**. Ниже — группировка по вероятному владельцу после разделения.

| Таблица(ы) | Вероятный владелец | Кто ещё использует (по статике) | Риск разделения |
|---|---|---|---|
| `sessions`, `bpmn_versions`, `session_state_versions`, `session_presence` | **sessions** | process-core, canvas-engine, analytics, discussions, agents, rbac | Высокий — ядро продукта |
| `projects`, `project_memberships` | **process-core** / **rbac** | analytics, assets, discussions, rbac, sessions | Высокий — многие сервисы читают |
| `orgs`, `org_memberships`, `org_invites`, `users`, `workspaces` | **rbac** | process-core, sessions, assets, analytics, discussions | Высокий — авторизация пронизывает всё |
| `note_threads`, `note_comments`, `note_comment_mentions`, `note_thread_attention_acknowledgements`, `note_thread_reads` | **discussions** | sessions, projects, users | Средний — дискуссии привязаны к сессиям |
| `templates`, `template_folders` | **assets** | rbac | Низкий |
| `rag_chunks`, `rag_documents`, `rag_sources`, `rag_eval_cases`, `rag_feedback`, `rag_settings` | **search** | shared/core | Низкий |
| `analytics_metrics`, `analytics_project_snapshots`, `analytics_session_snapshots`, `analytics_workspace_snapshots` | **analytics** | shared/core | Низкий |
| `ai_execution_log`, `ai_prompt_versions` | **agents** | shared/core | Низкий |
| `error_events` | **notifications** | process-core, shared/core | Низкий |
| `audit_log` | **rbac** | shared/core | Низкий |
| `feature_flags` | **shared/core** | shared/core | — |
| `storage_meta` | **shared/core** | — | — |
| `ingredients`, `equipment`, `containers`, `process_property_metadata`, `org_property_dictionary_*` | **process-core** / **resources** | shared/core | Средний — справочники |
| `admin_entity_permissions` | **rbac** | shared/core | Низкий |

---

## 6. Circular imports

Найдено **32 сильно связанных компонента** (SCC) длиной > 1. Ключевые циклы:

| Цикл | Участники | Влияние |
|---|---|---|
| 1 | `_legacy_main` ↔ `services.project_service` | Legacy держит бизнес-логику проектов |
| 2 | `_legacy_main` ↔ `services.org_service` ↔ `routers.org` | Legacy держит орг.логику |
| 3 | `_legacy_main` ↔ `services.session_service` ↔ `routers.sessions` | Legacy держит сессии |
| 4 | `_legacy_main` ↔ `services.session_service` ↔ `overlay_cache` ↔ `tasks` ↔ `celery_app` | Фоновые задачи + кэш состояния сессий |
| 5 | `celery_app` ↔ `tasks` ↔ `save_services.analytics_aggregator.tasks` | Celery-цепочка |

**Вывод:** `_legacy_main.py` — главный «цемент» монолита. Любой сервис, который его импортирует, нельзя выносить без предварительного выноса/разрыва соответствующих функций из `_legacy_main.py`.

---

## 7. Event / async / Redis usage

| Механизм | Где используется | Домены |
|---|---|---|
| **Redis** (`redis_client`, `redis_cache`, `redis_lock`) | 9+ файлов | sessions, canvas-engine (overlay_cache/clipboard), analytics_cache, shared/core |
| **Celery** (`celery_app`, `tasks.py`, `auto_pass_jobs`) | фоновые задачи автопрохода, аналитики, статусов | process-core, analytics, sessions |
| **BackgroundTask** FastAPI | `routers/sessions.py`, `routers/auto_pass.py` и др. | sessions, process-core |
| **Redis publish/subscribe** | `cache/session_cache.py`, `overlay_cache.py` | sessions, canvas-engine |
| **WebSocket / real-time** | session presence, overlay cache | sessions, canvas-engine |

**Вывод:** real-time синхронизация сессий и canvas-оверлеев — самый сложный аспект разделения. Эти два домена нужно отделять позже и с отдельным messaging-слоем.

---

## 8. Infrastructure

### 8.1 Текущий deploy

- **docker-compose.yml** (dev): `api`, `celery-worker`, `frontend`, `redis`, `postgres`, `kanboard`.
- **docker-compose.prod.yml** / **stage.yml**: переопределяют volumes, порты, external edge-сеть.
- **Dockerfile**: один контейнер для всего backend (Python 3.11 slim + uvicorn).
- **Dockerfile.gateway.prod**: nginx + собранный frontend; проксирует `/api/`, `/health/`, `/version` на `api:8000`.
- **nginx**: `deploy/nginx/default.prod.internal.conf`, `default.prod.tls.conf`.

### 8.2 Можно ли добавить отдельные контейнеры?

| Компонент | Готовность | Что нужно |
|---|---|---|
| Отдельные backend-сервисы | **Да, технически** | Новые `Dockerfile`/образы, `docker-compose` сервисы, env-переменные |
| API Gateway | **Частично** | Уже есть nginx-gateway, но он статичный. Для микросервисов нужен динамический routing/health-check |
| Service discovery | **Нет** | Сейчас hardcoded `api:8000` в nginx. Нужен Consul / Traefik / Docker DNS |
| Message broker | **Частично** | Redis уже используется как cache/lock, но не как durable event broker. Для event-driven — Kafka/RabbitMQ |
| Monitoring | **Нет** | Prometheus + Grafana не развёрнуты |
| CI/CD per-service | **Нет** | Сейчас билдится весь образ. Нужен matrix-build по сервисам |

---

## 9. Key findings & blockers

### Blocker #1: `_legacy_main.py`
- ~10.8k строк, содержит остатки бизнес-логики сессий, организаций, проектов.
- 4 из 5 доменных сервисов имеют циклические импорты с `_legacy_main`.
- **Требование:** до выноса любого сервиса нужен план рефакторинга `_legacy_main` → `services/` + `repositories/`.

### Blocker #2: `storage.py`
- Единый файл с ~38 таблицами и сырым SQL.
- Все доменные сервисы читают/пишут через него.
- **Требование:** разделить `storage.py` на per-service repositories / DB modules. При этом сохранить единую Postgres-схему до момента DB split.

### Blocker #3: `Session` Pydantic-модель
- Используется в 8 из 10 сервисов.
- **Требование:** выделить slim shared DTO (Pydantic) и внутренние доменные модели per-service. Тяжёлая `Session` модель не должна быть shared kernel.

### Blocker #4: Real-time (session presence + canvas overlay cache)
- Redis publish/subscribe, overlay cache, session cache.
- **Требование:** отдельный messaging-слой с чёткими event contracts.

### Blocker #5: Циклические импорты Celery
- `celery_app` ↔ `tasks` ↔ `save_services.analytics_aggregator.tasks`.
- **Требование:** реорганизовать Celery-задачи по доменам, избавиться от shared `tasks.py`.

---

## 10. Метрики (сводка)

| Метрика | Значение |
|---|---|
| Всего `.py` файлов | 133 |
| Концептуальных сервисов | 10 |
| Cross-cutting shared-модулей | 6 (`shared/core`, `shared/models`, `shared/storage`, `shared/redis`, `shared/utils`, `shared/legacy`) |
| Циклических импортов (SCC) | 32 |
| Таблиц в БД | 38 |
| Shared таблиц (≥2 сервиса) | ≥10 (`sessions`, `projects`, `orgs`, `users`, `workspaces`, `equipment`, `error_events`, `templates`, `rag_*`, `analytics_*`) |
| Shared Pydantic-моделей | ≥8 (`Session`, `Node`, `Edge`, `Question`, `Project`, `CreateProjectIn`, `UpdateProjectIn`, `CreateSessionIn`, `SessionMetaPatchIn`) |

---

## 11. Рекомендации к Phase 2

1. **Первый кандидат на вынос:** `notifications` (`error_events`) — изолирован, не критичен, имеет собственную таблицу.
2. **Второй:** `search` (`rag`) — собственные таблицы, минимальные связи с `rbac`.
3. **Третий:** `agents` (`ai`) — собственные таблицы, но зависит от `rbac` и `process-core` (Session/Node).
4. **Не выносить на ранних этапах:** `sessions`, `process-core`, `rbac`, `canvas-engine` — они образуют ядро и требуют предварительного разделения legacy + storage + shared models.

Детальное обоснование порядка будет в `PRIORITY.md` (Phase 2).
