# DIAGNOSIS — аудит дублирующей логики (dup-logic-audit-v1)

Baseline: `origin/main` @ `add38c240` (2026-09-14). Все числа — EVIDENCE-DATA.md.

## Сводка измерений

| Метрика | Backend | Frontend |
|---|---|---|
| Объём (без тестов) | 82 583 LOC app + 8 675 LOC services | 233 201 LOC |
| Файлов в анализе | 639 .py | 1 047 .js/.jsx/.ts/.tsx |
| Точные клоны (jscpd) | **535 групп / 7 095 строк (7.56%)** | **222 группы / 2 506 строк (2.41%)** |
| Структурные клоны функций (AST hash) | 77 групп / 174 функции | 563 группы / 1 472 функции |
| Same-name кластеры (≥2 файла) | 361 | 565 |
| Функций в графе | 3 425 | 19 167 |

Модульный граф: 1 389 узлов / 3 055 рёбер; frontend↔backend рёбер — 0 (ожидаемо,
подтверждает диагностику из graphify-semantic-zones); backend→persistence — 52.

---

## P0 — Форк «монолит ↔ agent-svc / notifications-svc» с живым дрейфом

Код LLM/agent-домена существует в двух копиях: `backend/app/ai/*`, `backend/app/agent/*`
(монолит) и `backend/services/agent/*` (выделенный сервис). Обе копии в одном репозитории,
обе подняты в `docker-compose.yml`. Копии **разошлись**:

| Модуль | Монолит | Сервис | Общих клон-строк |
|---|---|---|---|
| `gateway.py` | 363 строки (`app/ai/`) | 559 строк (`services/agent/gateway/`) | 320 |
| `chat.py` | **287 строк** (`app/agent/`) | **1 629 строк** (`services/agent/memory/`) | 128 |
| `memory_store.py` | 337 | 396 | 191 |
| `llm_http_client.py` | 98 | 195 | 131 |
| `llm_store.py` | — | — | 110 |
| `error_event_helpers.py` / `error_event_dto.py` / `error_event_repo.py` | `app/shared/dto/`, `app/repositories/` | `services/notifications/...` | 206 + 147 + 101 |

Факты live-пути:
- `LLM_VIA_AGENT_SVC` по умолчанию `0` (docker-compose.yml) → **боевой трафик обслуживает
  монолитная копия** `app/agent/chat.py:run_turn` (импорт в `routers/agent_chat.py:9`).
- services/agent и services/notifications — отдельные компоненты связности в графе
  импортов: общего кода через импорты нет, «шаринг» = копипаста.
- Коммит `add38c24` (#976, HEAD main) прямо фиксирует дрейф: «services/agent twin
  обновлён, монолитный отстал» — тест пришлось чинить из-за рассинхрона копий.

**Риск:** каждый фикс LLM-цепочки нужен в двух местах; уже подтверждённый класс
дефектов (twin drift). `chat.py` разошёлся в 5.7 раза по объёму.

## P1 — Мёртвый дублированный роутер `routers/sessions_new.py`

- 202 строки, 40 обработчиков; **100% имён — подмножество `routers/sessions.py`** (40/40).
- Чистый делегирующий shim на `services/session_service` (`return _svc.*`).
- **Нигде не подключён**: в `routers/__init__.py` монтируется только `sessions_router`
  из `sessions.py`; вне файла ссылок нет.
- Мёртвый код, дублирующий контракт всего session-домена.

## P1 — Копипаста coerce/text-утилит вместо shared-модулей

Canonical-модули уже существуют (`app/shared/coerce.py`, `app/shared/text_utils.py`,
PR-5 «lifted verbatim»), но модули продолжают заводить локальные копии:

Backend (при наличии shared!):
`_now_ts` ×13 файлов (5 вариантов), `_as_dict` ×12 (4 вар.), `_text` ×9 (3 вар.),
`_as_text` ×7 (**1 вариант — байтовые копии**), `_as_list` ×7, `_json_field` ×7,
`_row_to_dict` ×6 (6 разных!), `_new_id` ×6, `_json_loads` ×6, `_local_name` ×6.

Frontend (shared-модуля нет вообще):
**`toText` ×222 файла (5 семантических вариантов!)**, `asObject` ×150 (3 вар.),
`asArray` ×130 (5 вар.), `asText` ×46 (7 вар.), `normalizeTier` ×19 (2 вар.),
`fnv1aHex` ×15 (14 байт-идентичных + 1 дрейф), `toNumber` ×15, `toInt` ×10 (7 вар.),
`copyText` ×9 (4 вар.), `normalizeLoose` ×10.

**Дрейф семантики доказан**: 5 вариантов `toText` расходятся в поведении
(`trim` vs `trim+toLowerCase` vs `?? ""` vs «без trim» vs type-switch).
Одинаковое имя — разное поведение = класс дефектов «тихой» несогласованности.

## P1 — Параллельные слои session-домена

Пять модулей определяют один и тот же набор операций (add_node / patch_node /
delete_node / add_edge / list_project_sessions — по 5 определений каждой):
`routers/sessions.py` → `services/session_service.py` (1 815 строк) →
`sessions_core.py` + `sessions_graph.py` (+ мёртвый `sessions_new.py`).
Активная цепочка — первая тройка; границы ответственности размыты, функции
транзитом проксируются через 2–3 слоя.

## P2 — Парные реализации роутеров/сервисов

- `routers/process_properties_registry.py` ↔ `routers/product_actions_registry.py`:
  **448 клон-строк / 13 клонов** — параллельные registry-конвейеры
  (scopes, CSV/XLSX-экспорт, org-guards).
- `orgs.py` ↔ `services/org_service.py`: 174 клон-строки — роутер дублирует сервис.
- `routers/analytics.py`: 214 клон-строк self-dup внутри одного файла.
- `ai/deepseek_questions.py`: 84 строки self-dup.

## P2 — Storage-репозитории: повтор CRUD-паттерна на сущность

Внутрифайловые клоны (один и тот же метод-шаблон на каждую сущность):
`domains/storage/compat/repository.py` — 1 213 клон-строк (37 клонов),
`org_auth` — 630, `ai` — 514, `notes` — 361, `audit_telemetry` — 87.
Плюс `_row_to_dict` ×6 разных реализаций, `_json_field` ×7.
Кандидат на базовый Repository/mixin либо генерацию.

## P2 — Frontend: крупные self-клоны и парные компоненты

| Файл(ы) | Клон-строки | Что |
|---|---|---|
| `features/technologist/workspace/Workspace.jsx` | 233 (1 блок) | JSX-панель вставлена дважды (строки 991–1223 ↔ 1248–1480) |
| `features/explorer/WorkspaceExplorer.jsx` | 197 (16) | повторы внутри файла |
| `components/ProcessStage.jsx` | 144 (13) | повторы внутри файла |
| `sidebar/ElementSettingsControls.jsx` ↔ `sidebar/SelectedNodeSection.jsx` | 139 (10) | два сайдбар-компонента-клона |
| `components/process/BpmnStage.jsx` | 122 (13) | повторы |
| `App.jsx` | 118 (10) | повторы |
| `features/analytics/AnalyticsPage.jsx` | 118 (9) + 78 ↔ `AnalyticsPropertiesPanel.jsx` | повторы + парный дубль |
| `technologist/graph/GraphCanvas.jsx` ↔ `OverlayGraphCanvas.jsx` | 75 (7) | два canvas-компонента-клона |
| `interview/TimelineTable.jsx` | 62 (4) | повторы |

## P3 — God-хабы (усилители дублирования)

Топ по degree в графе импортов: `ProcessStage.jsx` (135), `storage.py` (in-degree 82),
`_legacy_main.py` (6 131 строка, 147 defs, degree 82), `lib/api.js` (in 73),
`App.jsx` (68). Хабы аккумулируют копипасту: локальные утилиты определяются прямо в них
(`App.jsx` несёт свою копию `fnv1aHex`).

## Что НЕ подтвердилось

- Cross-layer дубли frontend↔backend по именам: только `walk` (PY ×6 / JS ×10) —
  совпадение имени, не логики. Системного дублирования бизнес-логики между слоями
  статически не видно (рёбер между слоями в графе нет).
- `_legacy_main.py` не переопределяет session-обработчики — фасад-реэкспорт
  (overlap с `sessions_core.py` = ∅).
