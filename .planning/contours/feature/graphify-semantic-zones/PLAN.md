# PLAN — feature/graphify-semantic-zones

## Контур
- **type:** `feature`
- **name:** `graphify-semantic-zones`
- **роль:** Agent 1 (Planner)
- **создан:** 2026-08-30
- **baseline:** `origin/main` (`7f161478`)
- **ветка (после approve):** `feature/graphify-semantic-zones`

## PREMIUM/URGENT: семантический слой поверх graphify force-layout

Предыдущий контур `fix/graphify-graph-rendering` сделал граф читаемым: community-ноды получили hub-based лейблы, появилась легенда, настроен layout, клик по ноде показывает info. Осталась ключевая проблема: карта показывает **структуру**, но не **смысл**. Невозможно одним взглядом сказать, где фронтенд, где бэкенд, где хранилище, и какой путь проходит пользовательский сценарий.

## Цель
Добавить поверх агрегированного community-view семантический слой:
1. **Архитектурные слои** (frontend / backend / persistence / infra-tools / docs-planning / test / unclassified).
2. **Визуальные зоны** — цветовые пятна / convex hull вокруг нод каждого слоя + тусклая подпись зоны.
3. **Легенда карты** — панель слоёв с количеством нод и тогглом видимости.
4. **Режим трассировки сценариев** — клик по UI-ноде активирует подсветку цепочки UI → backend → persistence, остальное затухает; шаги цепочки выводятся в сайдбар.
5. **Расширенное NODE INFO** — поле `layer` и список сценариев, в которых участвует нода.

## Диагностика данных

Исходный граф `graphify-out/graph.json`:
- **19954 nodes**, **55681 edges**.
- Aggregate community view: **1072 community-ноды**, **1754 cross-community рёбер**.

Распределение нод по путям (выборка):

| Префикс | Количество | Примеры |
|---|---|---|
| `p0-work/frontend/` | 11127 | React-компоненты, pages, features, hooks |
| `p0-work/backend/app/` | 3555 | FastAPI routers, services, schemas, models |
| `p0-work/backend/tests/` | 2493 | Pytest-тесты |
| `p0-work/scripts/` | 953 | Скрипты автоматизации |
| `p0-work/tools/` | 438 | Агентские инструменты, graphify-скрипты |
| `p0-work/backend/alembic/`, `backend/scripts/`, `backend/services/` | 563 | Миграции, вспомогательные сервисы, seed-скрипты |
| `.planning/` | 67 | Заметки контуров |
| `p0-work/deploy/` | 61 | Docker, nginx, deploy-скрипты |
| `p0-work/docs/` | 7 | Документация |
| без `source_file` | 612 | imported symbols, generic types (`Any`, `patch`, `fixture`) |

Каждая community-нода в aggregate view — это множество исходных нод. Слой community определяется **голосованием по слоям входящих нод**.

## Границы

- Только tooling: изменения в `tools/graphify-render-graph.py` + новый модуль конфигурации + тесты.
- Никаких изменений product runtime (`frontend/src/`, `backend/app/` и т.д.).
- Не меняем `graphify` как внешний пакет.
- Не пересобираем `graph.json` / не запускаем полный `graphify .`.
- Сценарии трассировки — read-only анализ графа; никакой runtime-инструментации в продукте.

## План

### 1. Конфиг классификации слоёв (`tools/graphify-semantic-config.json`)

Файл с правилами, приоритетами и примерами. Формат:

```json
{
  "layers": [
    {
      "id": "frontend",
      "label": "FRONTEND",
      "color": "#4E79A7",
      "rules": [
        {"path_prefix": "p0-work/frontend/", "weight": 1.0},
        {"path_glob": "**/*.tsx", "weight": 0.9},
        {"path_glob": "**/*.jsx", "weight": 0.9},
        {"label_regex": "^(use|Page|Component|Feature|Hook|Bpmn|Canvas|Diagram)", "weight": 0.6}
      ]
    },
    {
      "id": "backend",
      "label": "BACKEND",
      "color": "#59A14F",
      "rules": [
        {"path_prefix": "p0-work/backend/app/", "weight": 1.0},
        {"path_prefix": "p0-work/backend/services/", "weight": 1.0},
        {"path_prefix": "p0-work/backend/scripts/", "weight": 0.7}
      ]
    },
    {
      "id": "persistence",
      "label": "STORAGE",
      "color": "#E15759",
      "rules": [
        {"path_prefix": "p0-work/backend/alembic/", "weight": 1.0},
        {"path_glob": "**/models*.py", "weight": 0.9},
        {"path_glob": "**/schemas*.py", "weight": 0.5},
        {"path_prefix": "p0-work/backend/app/models", "weight": 1.0},
        {"label_regex": "^(BaseModel|Session|DiagramState|Migration|Seed|sqlite|postgres)", "weight": 0.5}
      ]
    },
    {
      "id": "infra_tools",
      "label": "INFRA & TOOLS",
      "color": "#F28E2B",
      "rules": [
        {"path_prefix": "p0-work/tools/", "weight": 1.0},
        {"path_prefix": "p0-work/deploy/", "weight": 1.0},
        {"path_prefix": "p0-work/scripts/", "weight": 0.8},
        {"path_prefix": ".github/", "weight": 1.0}
      ]
    },
    {
      "id": "docs_planning",
      "label": "DOCS & PLANNING",
      "color": "#B07AA1",
      "rules": [
        {"path_prefix": ".planning/", "weight": 1.0},
        {"path_prefix": "p0-work/.planning/", "weight": 1.0},
        {"path_prefix": "p0-work/docs/", "weight": 1.0},
        {"path_prefix": "server-backup/srv/obsidian/", "weight": 0.9},
        {"path_prefix": "p0-work/server-backup/srv/obsidian/", "weight": 0.9}
      ]
    },
    {
      "id": "test",
      "label": "TESTS",
      "color": "#76B7B2",
      "rules": [
        {"path_prefix": "p0-work/backend/tests/", "weight": 1.0},
        {"path_glob": "**/*.test.*", "weight": 1.0},
        {"path_glob": "**/*.spec.*", "weight": 1.0}
      ]
    }
  ],
  "default_layer": "unclassified",
  "tie_break": "first_match",
  "log_conflicts": true
}
```

Правила:
- Каждая исходная нода получает score по каждому слою.
- Нода отдаётся слою с максимальным score; при равенстве — `tie_break` (first_match или largest_community).
- Для aggregate community-ноды: слой определяется голосованием входящих нод (weighted majority).
- Конфликты и низкоуверенные классификации логируются в отчёт.

### 2. Классификация в `tools/graphify-render-graph.py`

Добавить этап:
1. Загрузить `graphify-semantic-config.json`.
2. Для каждой исходной ноды вычислить `layer`.
3. Для каждой community: агрегировать слои членов → выбрать доминирующий слой.
4. Если community смешанная (нет явного большинства > 50%), пометить как `mixed` и логировать.
5. Добавить поле `layer` в meta-graph nodes.

Ожидаемое покрытие:
- frontend: ~11100 нод (55%)
- backend: ~4100 нод (20%)
- test: ~2500 нод (12%)
- persistence: ~300 нод (1.5%)
- infra_tools: ~1400 нод (7%)
- docs_planning: ~70 нод (0.3%)
- unclassified: ~600 нод (3%) — в основном imported symbols без source_file.

### 3. Визуальные зоны

На canvas поверх нод рисуем полупрозрачные фоновые пятна:
- Для каждого слоя вычисляем **convex hull** (или bounding ellipse) по координатам нод после stabilизации layout.
- Рисуем SVG path / polygon с fill-цветом слоя, opacity 0.08–0.12, без обводки.
- Подпись зоны (FRONTEND / BACKEND / STORAGE / …) — крупный полупрозрачный текст в центре hull, z-index ниже нод.
- Тоггл «Зоны on/off» в сайдбаре.

Альтернатива (fallback): если convex hull даёт слишком большие перекрытия — рисовать **bounding box per layer** с закруглёнными углами и низкой opacity.

### 4. Легенда карты

Новая панель **LAYERS** в сайдбаре:
- Цветной квадрат + название слоя + количество нод.
- Чекбокс видимости: скрыть/показать все ноды слоя.
- Кнопка «Зоны on/off».
- Кнопка «Скрыть unclassified».

### 5. Режим трассировки сценариев

#### 5.1 Формат сценария в конфиге

```json
{
  "scenarios": [
    {
      "id": "create-and-open-session",
      "label": "Создание и открытие сессии",
      "description": "Пользователь создаёт новую сессию процесса и открывает BPMN-редактор.",
      "seeds": {
        "frontend": [
          {"label_regex": "SessionCreatePage|ProcessPage|useProcessSession|BpmnEditor"},
          {"path_glob": "frontend/src/features/session/**"}
        ],
        "backend": [
          {"label_regex": "^create_session|POST /api/sessions|SessionCreate"},
          {"path_glob": "backend/app/routers/sessions.py"}
        ],
        "persistence": [
          {"label_regex": "Session|DiagramState|BaseModel"},
          {"path_glob": "backend/app/models/session.py"}
        ]
      },
      "max_depth": 3
    },
    {
      "id": "save-diagram",
      "label": "Сохранение диаграммы",
      "description": "Пользователь редактирует BPMN и нажимает Save.",
      "seeds": {
        "frontend": [
          {"path_glob": "frontend/src/features/process/bpmn/**"},
          {"label_regex": "saveDiagram|useBpmn|DiagramState"}
        ],
        "backend": [
          {"path_glob": "backend/app/routers/sessions.py"},
          {"label_regex": "patch_session|PATCH /api/sessions|update_diagram_state"}
        ],
        "persistence": [
          {"label_regex": "DiagramState|SessionState|diagram_state"},
          {"path_glob": "backend/app/models/diagram*.py"}
        ]
      },
      "max_depth": 3
    },
    {
      "id": "ask-ai-agent",
      "label": "Вопрос AI-агенту в чате",
      "description": "Пользователь пишет запрос в панель AI-агента; ответ формируется через backend action runner.",
      "seeds": {
        "frontend": [
          {"path_glob": "frontend/src/features/ai/**"},
          {"label_regex": "AgentChat|useAgent|AiPanel"}
        ],
        "backend": [
          {"path_glob": "backend/app/routers/agent_chat.py"},
          {"path_glob": "backend/app/agent/**"},
          {"label_regex": "AgentChatIn|run_agent_turn|ActionRunner"}
        ],
        "persistence": [
          {"label_regex": "AgentMessage|AgentRun|agent_chat"},
          {"path_glob": "backend/app/schemas/agent_chat.py"}
        ]
      },
      "max_depth": 3
    }
  ]
}
```

#### 5.2 Алгоритм трассировки

Для выбранного сценария:
1. Найти seed-ноды каждого слоя по regex/glob.
2. В исходном графе запустить **BFS/DFS от frontend seeds до backend seeds**, затем до persistence seeds, ограничив `max_depth`.
3. На meta-graph: выделить community-ноды, содержащие хотя бы одну ноду из цепочки.
4. Подсветить:
   - ноды цепочки: полная opacity, увеличенный размер;
   - рёбра цепочки: цвет слоя-источника, opacity 0.9, width 4;
   - остальные ноды/рёбра: opacity 0.08.
5. В сайдбаре вывести список шагов: `Frontend action → Backend handler → Persistence model`.

Клик по UI-ноде (frontend layer) предлагает список сценариев, в которых она участвует; выбор сценария активирует трассировку.

### 6. Расширенное NODE INFO

Добавить поля:
- `layer`: слой ноды.
- `scenarios`: массив id/label сценариев, в которых нода входит как seed или достижимая нода.
- `layer_confidence`: доля нод community, отданных этому слою.

### 7. Тесты

См. `TESTS.md`. Кратко:
- Unit-тест классификатора на fixture с известными путями.
- Проверка, что ≥90% нод получают слой.
- Проверка convex hull / bounding box генерации.
- Проверка трассировки на малом synthetic графе (UI→Backend→Storage).
- Проверка NODE INFO с `layer` и `scenarios`.

### 8. Артефакты

- `PLAN.md` — этот файл.
- `API.md` — контракты JSON config, layer mapping, trace result.
- `UI.md` — описание панелей, тогглов, цветов.
- `TESTS.md` — план тестов.
- `PR.md` — черновик PR.
- `STATE.json` — состояние контура.
- `READY_FOR_EXECUTION` — gate после approve PLAN.md.

## Acceptance Criteria

- [ ] ≥90% исходных нод классифицированы в слои; оставшиеся `unclassified` явно перечислены в отчёте.
- [ ] Каждая community-нода имеет поле `layer` с цветом слоя.
- [ ] На скриншоте карты с включёнными зонами без пояснений видно, где FRONTEND, BACKEND, STORAGE.
- [ ] Легенда LAYERS показывает слои и количество нод; чекбоксы скрывают/показывают слои.
- [ ] Реализованы и протестированы 3 сценария трассировки:
  - Создание и открытие сессии.
  - Сохранение диаграммы.
  - Вопрос AI-агенту в чате.
- [ ] Трассировка корректно подсвечивает цепочку UI → backend → persistence и затухает остальной граф.
- [ ] Сайдбар трассировки выводит список шагов цепочки.
- [ ] NODE INFO содержит `layer` и список сценариев для UI-нод.
- [ ] Все тесты проходят; product runtime не изменён.
- [ ] Скриншоты: общий вид с зонами, легенда, каждая из 3 трассировок.

## Риски

- **Смешанные communities**: одна community может содержать ноды из frontend и backend (например, shared types). Будем использовать `mixed` layer и confidence score.
- **Неточность сценариев**: seed-правила могут не покрыть реальные ноды. Планируется итеративная подгонка regex/glob на реальном графе.
- **Производительность convex hull** на 1072 нодах: O(n log n) — приемлемо, но если зоны сильно перекрываются, fallback на bounding boxes.
- **Aggregate view ограничивает детализацию**: трассировка идёт по community-нодам, а не по исходным нодам. Это осознанное ограничение для производительности.

## Git-proof (planning snapshot)

```text
workspace: /Users/mac/agents_place/kimi_PM
canonical runtime: /Users/mac/agents_place/kimi_PM/p0-work
remote: git@github.com:xiaomibelov/processmap_v1.git
branch (current checkout): uiux/bpmn-session-upload-v1
HEAD: 1fcefd766ad8d84c36f97f2e902171ed38847839
origin/main: 7f16147897dbc52464a0ee41391896d076f414f0
note: canonical runtime checkout has unrelated uncommitted changes; implementation branch feature/graphify-semantic-zones will be created from origin/main after PLAN.md approval.
```


---

## Pre-approve clarification

Этот раздел добавлен по запросу перед approve PLAN.md. Содержит проверку на реальных данных, привязку сценариев к графу и решение по пересечению зон.

### 1. Таблица классификации на реальных данных

Ниже — выборка из 24 реальных нод текущего `graphify-out/graph.json` с назначенным слоем по правилам из `tools/graphify-semantic-config.json` (после корректировки путей `.planning/`).

| # | id (сокращённо) | label | source_file | Слой | Score |
|---|---|---|---|---|---|
| 1 | `p0_work_frontend_src_features_session_savecoordinator_savecoordinator` | SaveCoordinator | `frontend/src/features/session/saveCoordinator.js` | frontend | 1.0 |
| 2 | `p0_work_frontend_src_components_process_bpmnxmleditor_bpmnxmleditor_bpmnxmleditor` | BpmnXmlEditor() | `frontend/src/components/process/bpmnXmlEditor/BpmnXmlEditor.jsx` | frontend | 1.0 |
| 3 | `p0_work_frontend_src_features_sessions_hooks_usesessions_usesessions` | useSessions() | `frontend/src/features/sessions/hooks/useSessions.js` | frontend | 1.0 |
| 4 | `p0_work_frontend_src_components_process_interview_aiquestionsblock_aiquestionsblock` | AiQuestionsBlock() | `frontend/src/components/process/interview/AiQuestionsBlock.jsx` | frontend | 1.0 |
| 5 | `p0_work_frontend_src_components_sidebar_aiquestionssection_aiquestionssection` | AIQuestionsSection() | `frontend/src/components/sidebar/AIQuestionsSection.jsx` | frontend | 1.0 |
| 6 | `p0_work_frontend_src_lib_api_apipatchsession` | apiPatchSession() | `frontend/src/lib/api.js` | frontend | 1.0 |
| 7 | `p0_work_backend_app_routers_sessions_session_bpmn_save` | session_bpmn_save() | `backend/app/routers/sessions.py` | backend | 1.0 |
| 8 | `p0_work_backend_app_services_session_service_create_session` | create_session() | `backend/app/services/session_service.py` | backend | 1.0 |
| 9 | `p0_work_backend_app_routers_explorer_create_session_in_project` | create_session_in_project() | `backend/app/routers/explorer.py` | backend | 1.0 |
| 10 | `p0_work_backend_app_routers_agent_chat` | app/routers/agent_chat.py | `backend/app/routers/agent_chat.py` | backend | 1.0 |
| 11 | `p0_work_backend_app_agent_chat_run_turn` | run_turn() | `backend/app/agent/chat.py` | backend | 1.0 |
| 12 | `p0_work_backend_app_overlay_cache_cb` | _CB | `backend/app/overlay_cache.py` | backend | 1.0 |
| 13 | `p0_work_backend_app_models_session` | Session | `backend/app/models.py` | persistence | 1.4 |
| 14 | `p0_work_backend_app_storage` | app/storage.py | `backend/app/storage.py` | persistence | 0.5 |
| 15 | `p0_work_backend_alembic_versions_015_llm_prompt_schema_assistant_upgrade` | upgrade() | `backend/alembic/versions/015_llm_prompt_schema_assistant.py` | persistence | 1.0 |
| 16 | `p0_work_backend_app_schemas_agent_chat_agentchatin` | AgentChatIn | `backend/app/schemas/agent_chat.py` | backend | 1.0 |
| 17 | `p0_work_backend_tests_test_analytics_aggregator_testanalyticsaggregator` | TestAnalyticsAggregator | `backend/tests/test_analytics_aggregator.py` | test | 1.0 |
| 18 | `p0_work_backend_tests_test_session_read_rbac_testsessionreadrbac` | TestSessionReadRbac | `backend/tests/test_session_read_rbac.py` | test | 1.0 |
| 19 | `p0_work_tools_graphify_render_graph_graphify_render_graph` | graphify-render-graph.py | `tools/graphify-render-graph.py` | infra_tools | 1.0 |
| 20 | `p0_work_scripts_dump_openapi_main` | main() | `scripts/dump_openapi.py` | infra_tools | 0.8 |
| 21 | `p0_work_deploy_nginx_conf` | nginx.conf | `deploy/nginx.conf` | infra_tools | 1.0 |
| 22 | `p0_work_docs_e9_take_screenshots_mockapi` | mockApi() | `docs/e9/take_screenshots.mjs` | docs_planning | 1.0 |
| 23 | `p0_work_planning_contours_feature_graphify_semantic_zones_plan_md` | PLAN.md | `.planning/contours/feature/graphify-semantic-zones/PLAN.md` | docs_planning | 1.0 |
| 24 | `p0_work_backend_seed_demo_workflow_main` | main() | `backend/seed_demo_workflow.py` | unclassified | 0.0 |

#### Прогноз распределения на полном графе

После корректировки правил (учтены `p0-work/.planning/` и `p0-work/backend/app/models`):

| Слой | Ноды | Доля |
|---|---|---|
| frontend | 11 143 | 55.8% |
| backend | 4 026 | 20.2% |
| test | 2 493 | 12.5% |
| infra_tools | 1 454 | 7.3% |
| unclassified | 655 | 3.3% |
| persistence | 109 | 0.5% |
| docs_planning | 74 | 0.4% |
| **Всего** | **19 954** | **100%** |

**Прогноз unclassified: 3.3%** — целевой порог ≤10% выполняется.

#### Ноды `.planning/` и Obsidian-заметок

- Всего нод docs_planning: **74 шт.** (0.4% от графа).
- Они разбросаны по рабочей директории, поэтому их **convex hull будет большим и перекрывающим**.
- Решение: слой **docs_planning по умолчанию скрыт** (аналогично Isolated в предыдущем контуре). Включить можно чекбоксом в панели LAYERS. Альтернатива — не рисовать зону для слоёв с <100 нод, а только показывать точки нод в легенде. В PLAN.md выбран вариант «скрыт по умолчанию + без зоны, только легенда».

### 2. Сценарии трассировки — привязка к графу

Важное ограничение текущего графа: **прямых рёбер между frontend- и backend-нодами нет**. Связи между слоями проходят через «unclassified» imported symbols (`BaseModel`, `Any`, `Request`, `patch`, `fixture`). Поэтому трассировка строится как **семантическая цепочка соответствий** (по именам/path), а не как путь по рёбрам.

#### Сценарий 1 — Создание и открытие сессии

| Шаг | Слой | Реальная нода | Как найдена |
|---|---|---|---|
| 1 | frontend | `useSessions()`<br>`id=p0_work_frontend_src_features_sessions_hooks_usesessions_usesessions` | seed по `path=frontend/src/features/sessions/**` |
| 2 | frontend | `useSessionShellOrchestration()`<br>`id=p0_work_frontend_src_app_usesessionshellorchestration_usesessionshellorchestration` | сосед по ребру внутри frontend |
| 3 | backend | `create_session_in_project()`<br>`id=p0_work_backend_app_routers_explorer_create_session_in_project` | semantic match по имени функции |
| 4 | backend | `create_session()`<br>`id=p0_work_backend_app_services_session_service_create_session` | достижим по ребру из `create_session_in_project` |
| 5 | persistence | `Session`<br>`id=p0_work_backend_app_models_session` | semantic match по имени модели |
| 6 | persistence | `app/storage.py`<br>`id=p0_work_backend_app_storage` | достижим по ребру из backend-роутера |

**Разрыв:** шаг 2 → 3 не соединён ребром в графе. Frontend не импортирует backend-функции напрямую. Связь устанавливается через конфиг сценария (`seeds.backend` по regex/label).

#### Сценарий 2 — Сохранение диаграммы

| Шаг | Слой | Реальная нода | Как найдена |
|---|---|---|---|
| 1 | frontend | `SaveCoordinator`<br>`id=p0_work_frontend_src_features_session_savecoordinator_savecoordinator` | seed по label/path |
| 2 | frontend | `apiPatchSession()`<br>`id=p0_work_frontend_src_lib_api_apipatchsession` | сосед по ребру внутри frontend |
| 3 | backend | `session_bpmn_save()`<br>`id=p0_work_backend_app_routers_sessions_session_bpmn_save` | semantic match по имени endpoint |
| 4 | backend | `session_bpmn_save()` в `session_service.py`<br>`id=p0_work_backend_app_services_session_service_session_bpmn_save` | достижим по ребру из routers |
| 5 | persistence | `app/storage.py`<br>`id=p0_work_backend_app_storage` | достижим по ребру из backend-сервиса |

**Разрыв:** шаг 2 → 3 — нет прямого ребра frontend→backend. Связь по имени `patch session` / `session_bpmn_save`.

#### Сценарий 3 — Вопрос AI-агенту в чате

| Шаг | Слой | Реальная нода | Как найдена |
|---|---|---|---|
| 1 | frontend | `AIQuestionsSection()`<br>`id=p0_work_frontend_src_components_sidebar_aiquestionssection_aiquestionssection` | seed по label/path |
| 2 | frontend | `AiQuestionsBlock()`<br>`id=p0_work_frontend_src_components_process_interview_aiquestionsblock_aiquestionsblock` | сосед по ребру внутри frontend |
| 3 | frontend | `createAiQuestionPanelAdapter()`<br>`id=p0_work_frontend_src_features_process_bpmn_stage_ai_aiquestionpaneladapter_createaiquestio` | сосед по ребру |
| 4 | backend | `app/routers/agent_chat.py`<br>`id=p0_work_backend_app_routers_agent_chat` | semantic match по имени модуля |
| 5 | backend | `run_turn()`<br>`id=p0_work_backend_app_agent_chat_run_turn` | достижим по ребру из роутера |
| 6 | persistence | `AgentChatIn`<br>`id=p0_work_backend_app_schemas_agent_chat_agentchatin` | достижим по ребру из `agent_chat.py` |

**Разрыв:** шаг 3 → 4 — нет прямого ребра frontend→backend. Связь по имени `agent_chat`.

### 3. Пересечение зон

#### Ожидаемое перекрытие

- Frontend (55.8% нод) образует один или несколько крупных кластеров.
- Backend (20.2%) — второй крупный кластер, частично пересекается с frontend в центре из-за shared types/schemas.
- Persistence, docs_planning, infra_tools — мелкие, разбросанные группы; их зоны могут ложиться поверх frontend/backend.

#### Порядок отрисовки

1. Фон canvas.
2. Зоны слоёв (z-index 1).
3. Рёбра (z-index 2).
4. Ноды (z-index 3).
5. Лейблы нод (z-index 4).
6. Подписи зон (z-index 1, за нодами).

#### Прозрачность и стиль зон

- Fill opacity: **0.06–0.10** (не 0.2+, чтобы не перекрывать ноды).
- Stroke: тот же цвет слоя, opacity 0.15, width 1 px.
- Если зоны сильно перекрываются — использовать **bounding box с закруглёнными углами** вместо convex hull (меньше хаотичных пиков).
- Для слоёв с <100 нод не рисовать зону вообще; показывать только цветные точки нод и запись в легенде.

#### Позиционирование подписей зон

- Подпись размещается в **центроиде bounding box** слоя, а не в центре mass-гравитации (чтобы не съезжать за край экрана).
- Если центроид попадает в плотный кластер другого слоя — смещаем подпись к ближайшему свободному углу bounding box с небольшим padding (8 px).
- Подпись рендерится с `pointer-events: none` и opacity 0.10–0.15, чтобы не мешать кликам.
- Если bounding box слоя меньше 120×80 px, подпись не рисуется (микро-зоны без надписи).

#### Fallback при сильном пересечении

Если на практике convex hull даёт нечитаемые «лягушачьи лапки» из-за выбросов:
- переключиться на **bounding box per layer**;
- или на **alpha-shape** (concave hull) с меньшим alpha;
- или оставить только **цветовое кодирование нод** + легенду, отключив зоны по умолчанию.

Выбор окончательного варианта будет сделан на этапе implementation после первых скриншотов и может быть скорректирован без изменения архитектуры.
