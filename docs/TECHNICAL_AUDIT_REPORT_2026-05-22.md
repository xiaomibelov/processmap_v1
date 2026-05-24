# Технический аудит проекта ProcessMap

> Аудит проведён: 2026-05-22
> Среда: Ubuntu 24.04 (сервер) + macOS (локальная машина)
> Инструменты: bash, ssh, Playwright (скриншоты с сервера)

---

## ЭТАП 1: РАЗВЕДКА ПРОЕКТА

### 1.1 Стек технологий

| Слой | Технология | Версия | Назначение |
|------|-----------|--------|------------|
| **Backend** | Python | 3.11 / 3.12 | Runtime |
| | FastAPI | 0.110.0 | Web framework |
| | Uvicorn | 0.29.0 | ASGI server |
| | Pydantic | v2 | Validation |
| | psycopg | 3.2.12 | PostgreSQL driver |
| | redis-py | 5.0.4 | Cache / locks / queue |
| | PyYAML | 6.0.1 | Config parsing |
| | python-multipart | 0.0.9 | File uploads |
| **Frontend** | React | 18.3.1 | UI framework |
| | Vite | 5.4.10 | Build tool |
| | Tailwind CSS | 3.4.17 | Styling |
| | bpmn-js | 18.12.0 | BPMN diagram editor |
| | camunda-bpmn-moddle | 7.0.1 | BPMN extensions |
| | jazz-tools | 0.20.14 | Collaboration (HTTP URL) |
| **DB** | PostgreSQL | — | Primary persistent storage |
| | SQLite | — | Legacy / local fallback |
| **Cache** | Redis | — | Locks, cache, job queue |
| **Gateway** | Nginx | 1.27-alpine | Reverse proxy, static files |
| **E2E Tests** | Playwright | 1.58.2 | Browser automation |
| **Infra** | Docker Compose | — | Local / stage / prod orchestration |
| **AI** | DeepSeek API | — | Optional AI extraction / questions |
| **Docs/RAG** | Obsidian | — | Knowledge base integration |
| **Planning** | GSD (Get Shit Done) | — | AI agent pipeline |

**Не обнаружено:** ORM (SQLAlchemy не используется — raw SQL через psycopg), Alembic / миграции (schema bootstrap при старте API), Go, Rust, Node.js backend.

### 1.2 Точка входа

**Backend:**
```python
# backend/app/main.py
from .startup.app_factory import create_app
app = create_app()
```
Запуск: `uvicorn backend.app.main:app --host 0.0.0.0 --port 8000`

**Frontend:**
```jsx
// frontend/src/App.jsx
import AppShell from "./components/AppShell";
// ... главный компонент приложения
```
Сборка: `vite build` → `frontend/dist/` → nginx

### 1.3 Дерево директорий (глубина 2)

```
processmap/
├── backend/               # Python FastAPI backend
│   ├── app/               # Application code
│   │   ├── ai/            # AI integrations
│   │   ├── clipboard/     # Clipboard service
│   │   ├── db/            # DB config (psycopg)
│   │   ├── error_events/  # Telemetry
│   │   ├── exporters/     # CSV/XLSX export
│   │   ├── knowledge/     # Knowledge base
│   │   ├── legacy/        # Legacy code
│   │   ├── rag/           # RAG indexing
│   │   ├── routers/       # FastAPI routes
│   │   ├── schemas/       # Pydantic schemas
│   │   └── startup/       # App factory, middleware
│   ├── requirements.txt
│   ├── scripts/           # Utilities (sqlite→pg)
│   └── tests/
├── frontend/              # React + Vite + Tailwind
│   ├── src/
│   │   ├── app/router/    # Routing
│   │   ├── components/    # UI components
│   │   │   ├── process/   # Diagram, Interview, Analysis
│   │   │   ├── sidebar/   # Left sidebar
│   │   │   └── workspace/ # Workspace explorer
│   │   ├── features/      # Business logic modules
│   │   │   ├── ai/        # AI executor
│   │   │   ├── auth/      # Auth provider
│   │   │   ├── draft/     # Session draft
│   │   │   ├── explorer/  # Project explorer
│   │   │   ├── navigation/# Navigation hooks
│   │   │   ├── notes/     # Notes system
│   │   │   ├── process/   # BPMN processing
│   │   │   └── workspace/ # Workspace management
│   │   ├── lib/           # API client, utilities
│   │   └── generated/     # Generated code
│   ├── e2e/               # Playwright tests
│   ├── dist/              # Build output
│   └── playwright.config.mjs
├── docs/                  # Documentation
│   ├── user_guide.md      # User manual (RU)
│   ├── contract_*.md      # API contracts
│   ├── enterprise_*.md    # Enterprise docs
│   ├── interview_*.md     # Interview catalog
│   └── specs/             # Specifications
├── deploy/                # Deployment
│   ├── nginx/             # Nginx configs
│   ├── scripts/           # Bootstrap, smoke, update
│   └── ROLLBACK.md
├── .agents/               # AI agent infrastructure
│   ├── agent1-planner/
│   ├── agent2-executor/
│   ├── agent3-reviewer/
│   ├── agent4-reviewer/
│   └── run-state/         # Agent execution state
├── .planning/             # GSD planning
│   ├── contours/          # Feature contours
│   ├── graphs/            # Knowledge graph
│   └── templates/         # Agent templates
├── bin/                   # Local utilities
│   ├── gsd
│   └── gsd-sdk
├── docker-compose.yml     # Dev stack
├── docker-compose.prod.yml
├── Dockerfile             # API image
├── Dockerfile.gateway.prod # Frontend nginx image
└── README.md
```

### 1.4 Существующая документация

| Файл | Статус | Качество |
|------|--------|----------|
| `README.md` | Есть | Базовый запуск, env vars, auth routes. Короткий. |
| `AGENTS.md` | Есть | Codex/GSD operating contract для AI-разработки. Технический. |
| `docs/user_guide.md` | Есть | Руководство пользователя (RU). Хорошее, но короткое. |
| `docs/contract_*.md` | Есть | API контракты (project, session). Среднее. |
| `docs/INTERVIEW_ACTIONS_CATALOG.md` | Есть | Каталог действий интервью. Специфично. |
| `docs/enterprise_*.md` | Есть | Enterprise: SSO, CI, ops, migrations. Подробно. |
| `docs/drawio-*.md` | Есть | Draw.io layer specs, regression gates. Техническое. |
| `DOD_PROCESS_WORKBENCH.md` | Есть | Definition of Done. Полезно для команды. |
| `docs/rag/` | Есть | RAG indexing docs. |
| `docs/screenshots/` | Есть | Скриншоты UI (несколько). |

**Пробелы:** нет API Reference в формате OpenAPI/Swagger UI (только contract_*.md), нет Architecture Decision Records (ADRs), нет Deployment Guide для production, нет Troubleshooting guide.

### 1.5 Основные модули / компоненты

**Backend modules:**
- `routers/product_actions_registry.py` — Реестр действий с продуктом
- `routers/process_properties_registry.py` — Реестр свойств процессов
- `routers/explorer.py` — Workspace/project/session explorer
- `routers/admin.py` — Admin panel
- `routers/product_actions_ai.py` — AI suggestions for actions
- `routers/rag.py` — RAG search API
- `routers/templates.py` — BPMN templates
- `routers/notes.py` — Notes system

**Frontend modules:**
- `components/process/` — Diagram, Interview, Analysis, Registry
- `features/process/analysis/` — Analytics hub, registries, models
- `features/ai/` — AI question generation, execution
- `features/auth/` — JWT auth, login/logout
- `features/explorer/` — Project/workspace navigation
- `features/notes/` — Element notes, sidebar notes

---

## ЭТАП 2: АНАЛИЗ АРХИТЕКТУРЫ

### 2.1 Реестр действий (Product Actions Registry)

**Назначение:** Сводная таблица действий с продуктами из сессий процессов. Просмотр, фильтрация, экспорт перед финальной выгрузкой.

**Backend:**
- Файл: `backend/app/routers/product_actions_registry.py` (30 618 bytes)
- Endpoints:
  - `GET /api/sessions/{session_id}/analysis/view-model` — view model для сессии
  - `POST /api/analysis/product-actions/registry/query` — запрос данных реестра
  - `POST /api/analysis/product-actions/registry/export.csv` — экспорт CSV
  - `POST /api/analysis/product-actions/registry/export.xlsx` — экспорт XLSX
- Логика: агрегация действий из interview/diagram data, фильтрация по scope (workspace/project/session)

**Frontend:**
- Компоненты: `ProductActionsRegistryPage.jsx` → `ProductActionsRegistryPanel.jsx` → `registry/*`
- Подкомпоненты: `DataTable`, `FiltersRow`, `MetricsRow`, `ScopeTabs`, `WarningRow`, `AIControlsRow`, `SourceSection`, `EmptyState`, `LoadingSkeleton`
- Модель: `features/process/analysis/productActionsRegistryModel.js`
- API: `lib/api.js` — `apiQueryProductActionRegistry`, `apiExportProductActionRegistryCsv/Xlsx`

**Структура данных (фронт):**
- Scope tabs: Workspace / Project / Session
- Metrics: сессий, строк, полных, неполных
- Filters: Группа, Товар, Тип, Этап, Категория, Роль, Полнота
- Columns: Продукт, Действие, Процесс/Шаг, Статус
- Status badges: Полная / Неполная
- Export: CSV / XLSX

### 2.2 Реестр свойств (Process Properties Registry)

**Назначение:** Сводный список свойств BPMN-элементов и процессных объектов.

**Backend:**
- Файл: `backend/app/routers/process_properties_registry.py` (33 531 bytes)
- Endpoints:
  - `POST /api/analysis/properties/registry/query`
  - `POST /api/analysis/properties/registry/export.csv`
  - `POST /api/analysis/properties/registry/export.xlsx`

**Frontend:**
- Компоненты: `ProcessPropertiesRegistryPage.jsx`
- Структура: аналогична Product Actions, но для свойств элементов

### 2.3 Ключевые сущности и связи

```
Organization (ORG)
  └── Workspace
        └── Project
              └── Session
                    ├── Diagram (BPMN XML)
                    ├── Interview (Q&A по шагам)
                    ├── Nodes (элементы диаграммы)
                    ├── Actors / Lanes (роли)
                    ├── Notes (заметки к элементам)
                    └── DoD / Coverage (признаки заполненности)

Session ──► Product Actions Registry (агрегация)
Session ──► Process Properties Registry (агрегация)
```

### 2.4 API Endpoints (основные)

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | /api/auth/login | JWT login |
| POST | /api/auth/refresh | Refresh token rotation |
| POST | /api/auth/logout | Revoke refresh |
| GET | /api/auth/me | Current user |
| GET | /api/meta | Server metadata |
| GET | /api/workspaces | List workspaces |
| GET | /api/projects | List projects |
| GET | /api/sessions | List sessions |
| GET | /api/explorer | Workspace explorer |
| POST | /api/analysis/product-actions/registry/query | Actions registry |
| POST | /api/analysis/properties/registry/query | Properties registry |
| POST | /api/analysis/product-actions/suggest-bulk | AI bulk suggest |
| GET | /api/sessions/{id}/analysis/view-model | Session analytics |

### 2.5 База данных

**Тип:** PostgreSQL (primary), SQLite (legacy fallback)

**Особенности:**
- Нет ORM (SQLAlchemy) — используется raw SQL через psycopg
- Нет Alembic / миграций — schema bootstrap при старте API (`FPC_DB_STARTUP_CHECK=1`)
- Connection pooling: `psycopg_pool`
- Data transfer: `backend/scripts/sqlite_to_postgres.py` — миграция SQLite → PostgreSQL

**Redis:**
- Primary runtime performance layer
- Locks, cache, jobs queue
- `REDIS_REQUIRED=1` — Redis считается штатным, fallback mode при недоступности

### 2.6 Границы проекта

**Внутри ProcessMap:**
- Создание и редактирование BPMN-диаграмм
- Интервью с экспертами по процессам
- Контроль качества (Quality / Coverage режимы)
- Реестры действий и свойств
- Экспорт в CSV/XLSX
- AI-ассистент (вопросы, suggestions)

**Интеграции с внешними системами:**
- DeepSeek API (AI extraction / questions) — опционально
- Obsidian ( knowledge base, заметки)
- Export кода в workspace/processes/ (файловая система)
- SSO (enterprise) — планируется

---

## ЭТАП 3: ИССЛЕДОВАНИЕ UI

### 3.1 Общее описание интерфейса

Интерфейс тёмный (dark mode), единый дизайн-система на Tailwind CSS.

**Верхняя панель (TopBar):**
- Логотип PROCESSMAP
- Хлебные крошки / навигация
- ORG selector
- Админ-панель
- Профиль пользователя

**Левая панель (Sidebar):**
- Иконки: Главная, Процессы, AI, Заметки, Календарь
- Контекстно-зависимое содержимое

**Центральная область:**
- Табы: Анализ процессов | Diagram (BPMN) | XML | DOC | DOD
- Содержимое по табу

### 3.2 Ключевые экраны (со скриншотами)

#### Экран 1: Analytics Hub (Аналитика)

![Analytics Hub](screenshots/02-analytics-hub.png)

- Единая точка входа в реестры и аналитические панели
- Метрики сверху: ДЕЙСТВИЯ, СВОЙСТВА, ПРОЦЕССЫ, НЕПОЛНЫЕ ДАННЫЕ
- Карточки:
  - **Реестр действий** — "Действия с продуктом по процессам, товарам и этапам" → Открыть
  - **Реестр свойств** — "Свойства BPMN-элементов и процессных объектов" (СКОРО)
  - **Дашборды** — "Сводки по заполненности, качеству и источникам данных" (СКОРО)
  - **Экспорт** — "Выгрузки CSV/XLSX по выбранным процессам и разделам" (В РАЗРАБОТКЕ)

#### Экран 2: Product Actions Registry (Реестр действий с продуктом)

![Product Actions Registry](screenshots/08-registry-fullpage.png)

- Заголовок: "Реестр действий с продуктом"
- Подзаголовок: "Сводная таблица действий с продуктами из сессий. Просмотр и экспорт перед финальной выгрузкой."
- Экспорт: 152 строк · полных: 149 · неполных: 3 → CSV | XLSX
- Табы скоупа: Workspace | Проект | Сессия
- Метрики: 2 сессий | 152 строк | 149 полных | 3 неполных | 152 после фильтров
- Фильтры: Группа, Товар, Тип, Этап, Категория, Роль, Полнота
- Предупреждение: "Есть неполные строки — заполните их в исходной сессии перед финальной выгрузкой."
- Таблица: Продукт | Действие | Процесс/Шаг | Статус
- Статус-бейджи: Полная (зелёный), Неполная (оранжевый)
- Кнопка "Вернуться"

#### Экран 3: BPMN Diagram Editor

![Diagram Editor](screenshots/05-diagram.png)

- Вкладка "Diagram (BPMN)"
- Панель инструментов: Слои (ON/hidden), Шаблоны, Отчёт, Обсуждения
- BPMN-редактор с канвасом
- Элементы: Lane ("Бланко Декор"), задачи, события
- Кнопки: Добавить
- Toast: "Scrubber auto-collapsed"

#### Экран 4: Workspace Explorer

![Explorer](screenshots/06-explorer.png)

- Левая панель: Organization, Workspaces
- Элементы: "Реестр действий", "Аналитика"
- Центральная область: таблица разделов/сессий
- Колонки: Тип, Разделы/Сессии, Контекст, Ответственный, DoD

### 3.3 Пользовательские сценарии

**Сценарий 1: Создание нового процесса (BA)**
1. Открыть `/`, нажать "Войти"
2. Авторизоваться (admin@local / admin)
3. TopBar → "Новый проект"
4. Сессия создаётся автоматически
5. Вкладка **Diagram** — нарисовать BPMN-схему
6. Вкладка **Interview** — ответить на AI-вопросы по шагам
7. Вкладка **DOD** — проверить заполненность
8. Сохранить сессию

**Сценарий 2: Анализ через реестры (Analyst)**
1. Открыть проект
2. Перейти в **Аналитика** (Analytics Hub)
3. Нажать "Открыть" в карточке "Реестр действий"
4. Выбрать скоуп (Workspace / Проект / Сессия)
5. Применить фильтры (Группа, Товар, Тип, Этап)
6. Просмотреть статус строк (Полная / Неполная)
7. Экспортировать в CSV или XLSX

**Сценарий 3: Экспорт результатов**
1. Открыть реестр действий или свойств
2. Нажать CSV или XLSX
3. Файл скачивается с данными, отфильтрованными по текущему виду

---

## ЭТАП 4: ОТВЕТЫ НА ВОПРОСЫ МАНУАЛА

---

### БЛОК 1: Аудитория и цель

#### Факты
- Проект на русском языке (интерфейс, документация)
- Терминология: BPMN, Interview, DoD, Coverage, Registry, Actions, Properties
- Есть `docs/enterprise_*.md` — значит, предполагается enterprise-использование
- AI-интеграции (DeepSeek) — target audience включает тех, кто использует AI-ассистента
- 4 агента в pipeline (Planner → Executor → Reviewer) — команда активно использует AI для разработки

#### Рекомендации

**Целевой пользователь:**
1. **Primary:** Business Analyst (BA), процессный аналитик, методолог — человек, который собирает и формализует процессы через интервью и BPMN.
2. **Secondary:** Руководитель проекта / консультант — просматривает аналитику, реестры, экспортирует отчёты.
3. **Tertiary:** DevOps / разработчик — развёртывание, интеграция, поддержка.

**Elevator pitch:**
> ProcessMap — это платформа для сбора и формализации бизнес-процессов через структурированные интервью и BPMN-диаграммы. Она помогает аналитикам переводить разговоры с экспертами в структурированные схемы, контролировать качество данных и экспортировать результаты в реестры действий и свойств для дальнейшей автоматизации.

**Глубина документации:**
- **Для BA:** Quick Start + User Guide + пошаговые сценарии со скриншотами
- **Для разработчика:** API Reference (Swagger/OpenAPI) + Architecture Overview
- **Для администратора:** Deployment Guide + Env Vars Reference + Troubleshooting

---

### БЛОК 2: Объект документирования

#### Факты
- Название: ProcessMap (ранее Food Process Copilot — MVP)
- Тип: Web-приложение (SaaS / self-hosted)
- Основная функция: сбор процессов → формализация → аналитика → экспорт
- Версия текущая: v1.0.141 (по build-info.json)

#### Что такое ProcessMap (определение)

> **ProcessMap** — веб-платформа для процессного анализа, которая объединяет три рабочих режима в одной сессии:
> 1. **Interview** — структурированное интервью с AI-ассистентом для сбора информации о процессе.
> 2. **Diagram (BPMN)** — визуальный редактор бизнес-процессов с оверлеями качества.
> 3. **Analytics** — реестры действий и свойств с фильтрацией и экспортом.

#### Сущности / процессы

| Сущность | Описание |
|----------|----------|
| Organization (ORG) | Организация-пользователь платформы |
| Workspace | Рабочее пространство внутри организации |
| Project | Процесс / продукт |
| Session | Рабочий экземпляр с диаграммой и интервью |
| Node | Элемент BPMN-диаграммы (шаг, событие, развилка) |
| Actor / Lane | Роль в процессе |
| Interview | Q&A по шагам процесса |
| Product Action | Действие с продуктом (агрегировано из сессий) |
| Process Property | Свойство BPMN-элемента (агрегировано) |
| DoD / Coverage | Признаки заполненности данных по узлам |

#### Границы проекта

**Входит:**
- Создание и редактирование BPMN-диаграмм
- Интервью с AI-ассистентом
- Контроль качества (Quality / Coverage режимы)
- Реестры действий и свойств
- Экспорт CSV/XLSX
- Админ-панель
- Auth (JWT)

**Не входит (интеграции):**
- ERP/CRM системы (только экспорт файлов)
- BI-системы (дашборды — "СКОРО")
- External BPMN engines (Camunda, etc.) — только XML export

---

### БЛОК 3: Структура навигации мануала

#### Рекомендуемый принцип: **по ролям + по задачам**

**Уровни документации:**

| Уровень | Для кого | Примеры |
|---------|----------|---------|
| L1 — Quick Start | Новый BA | "Создайте первый процесс за 5 минут" |
| L2 — User Guide | Опытный BA | Работа с диаграммами, интервью, реестрами |
| L3 — API Reference | Разработчик | OpenAPI/Swagger, endpoints, schemas |
| L4 — Architecture | Разработчик | Структура backend/frontend, data flow |
| L5 — Deployment | DevOps | Docker Compose, env vars, backup/restore |
| L6 — Enterprise | Enterprise клиент | SSO, RBAC, migrations |

#### Рекомендуемое оглавление (TOC)

```
1. Quick Start
   1.1 Установка (Docker Compose)
   1.2 Первый вход
   1.3 Создание проекта и сессии
   1.4 Первый процесс за 5 минут

2. Руководство пользователя
   2.1 Интерфейс: обзор
   2.2 Workspace и проекты
   2.3 BPMN-диаграмма
       2.3.1 Режимы отображения (Normal/Interview/Quality/Coverage)
   2.4 Интервью
       2.4.1 AI-ассистент
   2.5 XML и DOC
   2.6 DoD и Coverage
   2.7 Аналитика (Analytics Hub)
       2.7.1 Реестр действий
       2.7.2 Реестр свойств
       2.7.3 Фильтрация и экспорт

3. API Reference
   3.1 Аутентификация
   3.2 Сессии и проекты
   3.3 Аналитика (реестры)
   3.4 AI endpoints
   3.5 RAG search

4. Архитектура
   4.1 Общая схема
   4.2 Backend (FastAPI)
   4.3 Frontend (React + Vite)
   4.4 База данных
   4.5 Redis и кэширование
   4.6 AI pipeline

5. Развёртывание
   5.1 Требования
   5.2 Docker Compose (dev)
   5.3 Production deployment
   5.4 Переменные окружения
   5.5 Миграция SQLite → PostgreSQL
   5.6 Backup и restore

6. Для разработчиков
   6.1 Структура проекта
   6.2 Запуск локально
   6.3 Тесты (Playwright)
   6.4 AI Agent Pipeline (GSD)
   6.5 Contributing guidelines

7. Enterprise
   7.1 SSO
   7.2 RBAC
   7.3 CI/CD

8. Troubleshooting
   8.1 Частые ошибки
   8.2 Логи и диагностика
   8.3 Gateway caching issues

Appendix A: Глоссарий
Appendix B: API Contracts (legacy)
Appendix C: Changelog
```

---

### БЛОК 4: Практическая часть

#### Пошаговые инструкции (обязательные)

1. **Установка и запуск**
   ```bash
   docker compose up --build
   # Frontend: http://localhost:5177
   # API: http://localhost:8000
   ```

2. **Типовой сценарий: от интервью до реестра**
   - Войти → Создать проект → Открыть Diagram → Нарисовать процесс → Перейти в Interview → Ответить на вопросы → Сохранить → Открыть Аналитика → Реестр действий → Экспорт CSV

3. **Экспорт данных**
   - Реестр действий → CSV / XLSX
   - Реестр свойств → CSV / XLSX

#### Скриншоты и схемы

| Раздел | Скриншот | Статус |
|--------|----------|--------|
| Analytics Hub | `02-analytics-hub.png` | Есть |
| Product Actions Registry | `08-registry-fullpage.png` | Есть |
| BPMN Diagram | `05-diagram.png` | Есть |
| Workspace Explorer | `06-explorer.png` | Есть |
| Interview tab | Нет | **Нужно сделать** |
| Login page | Нет | **Нужно сделать** |
| Quality mode | Нет | **Нужно сделать** |
| Coverage mode | Нет | **Нужно сделать** |

#### Edge-кейсы и подводные камни

1. **Gateway caching (CRITICAL)**
   - Frontend dist кэшируется в Docker-образе nginx. После `npm run build` нужно пересобрать и перезапустить контейнер gateway, иначе пользователи видят старый UI.
   - **Workaround:** `docker cp frontend/dist/. gateway:/usr/share/nginx/html/ && docker exec gateway nginx -s reload`

2. **Redis fallback**
   - При `REDIS_REQUIRED=1` и недоступности Redis backend работает в degraded mode. Некоторые операции (locks, queue) могут падать.

3. **SQLite → PostgreSQL миграция**
   - Скрипт: `backend/scripts/sqlite_to_postgres.py`
   - Нужно запускать внутри контейнера api
   - `--reset-target` очищает целевую БД

4. **JWT Refresh Rotation**
   - Refresh token хранится в HttpOnly cookie
   - При refresh выдаётся новая пара access+refresh
   - Logout revoke'ит refresh token в Redis

5. **BPMN режимы**
   - Режим хранится в `localStorage` (`ui.diagram.mode.v1`)
   - Quality mode показывает список проблем
   - Coverage mode показывает карту пробелов

6. **AI fallback**
   - Без `DEEPSEEK_API_KEY` работает stub extractor (ограниченная функциональность)

7. **No ORM / No migrations**
   - Schema bootstrap при старте API. Нет Alembic.
   - Изменения схемы БД требуют ручного обновления bootstrap-скриптов.

8. **RAG indexing**
   - Требуется запуск `pm-rag-agent-preflight.mjs` для обновления индекса
   - 40 038 chunks в индексе (по проверке)

---

### БЛОК 5: Формат и доступность

#### Факты
- Документация в Markdown внутри репозитория (`/docs/`)
- Есть `docs/user_guide.md` — руководство пользователя
- Нет сгенерированного сайта документации (GitHub Pages, Docusaurus, etc.)
- Версия текущая: v1.0.141
- Git history показывает активную разработку (daily commits)
- Есть `AGENTS.md` — AI operating contract

#### Рекомендации

**Формат:**
- **Рекомендуемый:** Markdown в репо + сгенерированный статический сайт (Docusaurus / VitePress / MkDocs)
- **Альтернатива:** Notion для пользователей, Markdown для разработчиков
- **API Reference:** Swagger UI (`/docs` FastAPI endpoint) — уже доступен, нужно включить в мануал

**Версионность:**
- Semantic versioning (`v1.0.141`)
- Документация должна быть привязана к git tags
- Changelog в формате Keep a Changelog

**Частота обновления:**
- Код обновляется ежедневно (агентский pipeline)
- Документация должна обновляться вместе с контуром (feature)
- Рекомендуется: PR template с чек-листом "Документация обновлена?"

---

### БЛОК 6: Интеграция с командой

#### Факты
- Команда использует AI-агентов для разработки (4 агента: Planner, Executor, Reviewer)
- Есть `AGENTS.md` — контракт для AI
- Есть `.planning/` — GSD planning с контурами
- Есть `docs/` — разрозненная документация
- Есть Obsidian интеграция (`/srv/obsidian/project-atlas/ProcessMap`)

#### Кто поддерживает документацию

| Роль | Ответственность |
|------|----------------|
| **Agent 1 (Planner)** | Обновление ARCHITECTURE.md, API contracts при планировании |
| **Agent 2 (Executor)** | Обновление User Guide, скриншотов при реализации UI |
| **Agent 4 (Reviewer)** | Проверка completeness документации перед REVIEW_PASS |
| **Human (Tech Writer)** | Итоговая редактура, структура, публикация |

#### Чек-лист проверки документации перед релизом

```markdown
## Pre-release Documentation Checklist

- [ ] User Guide обновлён (новые фичи описаны)
- [ ] Скриншоты актуальны (сделаны на текущей версии)
- [ ] API Reference содержит новые endpoints
- [ ] Env vars добавлены в README / Deployment Guide
- [ ] Edge cases описаны в Troubleshooting
- [ ] Changelog обновлён
- [ ] Swagger UI проверен (`/docs` открывается)
- [ ] Gateway caching issue verified (dist пересобран)
- [ ] E2E тесты проходят (Playwright)
```

---

## ИТОГОВОЕ ОГЛАВЛЕНИЕ (TOC) ДЛЯ БУДУЩЕГО МАНУАЛА

```
ProcessMap Technical Manual
├── 1. Quick Start
│   ├── 1.1 Установка через Docker Compose
│   ├── 1.2 Первый вход и авторизация
│   └── 1.3 Создание первого процесса (5 минут)
├── 2. Руководство пользователя
│   ├── 2.1 Обзор интерфейса
│   ├── 2.2 Workspace, проекты и сессии
│   ├── 2.3 BPMN-диаграмма
│   │   ├── 2.3.1 Режим Normal
│   │   ├── 2.3.2 Режим Interview
│   │   ├── 2.3.3 Режим Quality
│   │   └── 2.3.4 Режим Coverage
│   ├── 2.4 Интервью с AI-ассистентом
│   ├── 2.5 XML, DOC и DOD
│   └── 2.6 Аналитика и реестры
│       ├── 2.6.1 Analytics Hub
│       ├── 2.6.2 Реестр действий (Product Actions)
│       ├── 2.6.3 Реестр свойств (Process Properties)
│       └── 2.6.4 Фильтрация и экспорт
├── 3. API Reference
│   ├── 3.1 Аутентификация (JWT)
│   ├── 3.2 Проекты и сессии
│   ├── 3.3 Аналитика (реестры)
│   ├── 3.4 AI endpoints
│   └── 3.5 RAG Search
├── 4. Архитектура
│   ├── 4.1 Общая схема системы
│   ├── 4.2 Backend (FastAPI)
│   ├── 4.3 Frontend (React + Vite + Tailwind)
│   ├── 4.4 База данных (PostgreSQL)
│   ├── 4.5 Redis и производительность
│   └── 4.6 AI Pipeline (GSD Agents)
├── 5. Развёртывание
│   ├── 5.1 Требования
│   ├── 5.2 Docker Compose (development)
│   ├── 5.3 Production deployment
│   ├── 5.4 Переменные окружения
│   ├── 5.5 Миграция SQLite → PostgreSQL
│   └── 5.6 Backup и восстановление
├── 6. Для разработчиков
│   ├── 6.1 Структура проекта
│   ├── 6.2 Локальная разработка
│   ├── 6.3 Тестирование (Playwright)
│   ├── 6.4 AI Agent Pipeline
│   └── 6.5 Contributing
├── 7. Enterprise
│   ├── 7.1 SSO интеграция
│   ├── 7.2 RBAC
│   └── 7.3 CI/CD
├── 8. Troubleshooting
│   ├── 8.1 Gateway caching (изменения UI не видны)
│   ├── 8.2 Redis fallback
│   ├── 8.3 AI fallback (DeepSeek API)
│   └── 8.4 Диагностика и логи
├── Appendix A: Глоссарий
├── Appendix B: Changelog
└── Appendix C: API Contracts (legacy markdown)
```

---

## НЕОБНАРУЖЕННОЕ / ТРЕБУЕТ УТОЧНЕНИЯ

1. **Interview tab скриншот** — не удалось получить. Нужен актуальный скриншот с AI-вопросами.
2. **Quality / Coverage mode скриншоты** — не удалось получить. Нужны для User Guide.
3. **Login page скриншот** — не удалось получить.
4. **OpenAPI / Swagger UI** — предполагается доступен через FastAPI (`/docs`), но не проверен вручную.
5. **Актуальная схема БД** — нет миграций, schema bootstrap скрыт в startup code. Требует чтения `backend/app/db/` и startup scripts.
6. **AI Pipeline детали** — GSD agents, RAG indexing, Obsidian sync. Описано в `AGENTS.md`, но требует отдельного deep-dive.
7. **Enterprise features** — описаны в `docs/enterprise_*.md`, но не проверены на работающей системе.

---

## ПРИЛОЖЕНИЕ: Скриншоты

Скриншоты сохранены в `/tmp/processmap-screenshots/`:
- `02-analytics-hub.png` — Analytics Hub v1.0.134
- `03-product-actions-registry.png` — Product Actions Registry (старое)
- `05-diagram.png` — BPMN Diagram Editor
- `06-explorer.png` — Workspace Explorer
- `08-registry-fullpage.png` — Product Actions Registry (full page, 1920x1080)
- `09-hub-foundation.png` — Analytics Hub v1.0.127 (foundation)
- `10-app-post-login.png` — App после логина
