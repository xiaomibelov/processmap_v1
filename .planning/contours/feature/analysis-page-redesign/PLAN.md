# PLAN — analysis-page-redesign

Контур: `feature/analysis-page-redesign`  
Документ: `PLAN.md` + `UI.md`  
Ветка: `docs/analysis-redesign-plan` от `origin/main`  
Base: `807d262dd8c83fb12aa86cc620f4a5ba69cefa20`  
Репозиторий: `processmap_v1_main_clone` (canonical remote `git@github.com:xiaomibelov/processmap_v1.git`)

## Цель

Редизайн вкладки **«Анализ процессов»** (workbench tab `interview`) в no-scroll дашборд, где:
- фронт только отрисовывает готовый read-model;
- все метрики времени, покрытия, throughput, распределения и исключений считает backend;
- премиум-направление: канвас-связанная страница (выделение шага ↔ элемент BPMN) заложено, но не реализуется в этом контуре.

Код не писать до апрува владельца.

---

## 0. As-built аудит

### 0.1 Структура страницы

Родительский компонент: `frontend/src/components/process/InterviewStage.jsx:813-1167`.

Сейчас страница — вертикальная лента секций (сверху вниз):

| Секция | Компонент | Строка | Содержание |
|---|---|---|---|
| A. Границы | `BoundariesBlock` | `InterviewStage.jsx:815` | start / intermediate / finish, coverage badge |
| B. Действия процесса | `TimelineTable` + `ProductActionsPanel` + `RagSearchPanel` | `InterviewStage.jsx:833-1067` | таблица шагов 46/46, панель «Шаг и продукт», RAG-агент |
| B2. Ветки BPMN | `TransitionsBlock` → `BpmnBranchesPanel` | `InterviewStage.jsx:1114` | дерево/карточки веток, условия переходов |
| C. Итоги и время | `SummaryBlock` | `InterviewStage.jsx:1123` | KPI времени, топ-ожидания, распределения |
| D. Исключения | `ExceptionsBlock` | `InterviewStage.jsx:1134` | таблица исключений с привязкой к шагам |
| AI-вопросы | `AiQuestionsBlock` | `InterviewStage.jsx:1144` | статусы AI-вопросов по шагам |
| Анализ LLM | `LlmAnalysisBlock` | `InterviewStage.jsx:1152` | кнопка запуска LLM + результат |

Конфиг вкладок: `frontend/src/features/process/processWorkbench.config.js:3` (`id: "interview"`, label «Анализ процессов»).

### 0.2 Источники данных

- **Raw interview state** (`data.boundaries`, `data.steps`, `data.exceptions`, `data.ai_questions`, `data.transitions`) — `useInterviewSessionState` (`frontend/src/components/process/interview/useInterviewSessionState.js`).
- **Graph / timeline / derived metrics** — `useInterviewDerivedState` (`frontend/src/components/process/interview/useInterviewDerivedState.js:112-1339`).
- **DoD snapshot** (время, lanes, subprocesses, coverage, quality) — `computeDodSnapshot` (`frontend/src/features/process/dod/computeDodSnapshot.js:1036-1838`).
- **Interview VM / path metrics** — `buildInterviewVM` (`frontend/src/components/process/interview/viewmodel/buildInterviewVM.js:480-554`).
- **Product actions** — уже backend-driven: `GET /api/sessions/{id}/analysis/view-model` (`backend/app/routers/product_actions_registry.py:763-849`), используется в `InterviewStage.jsx:795-811`.

### 0.3 Таблица метрик: где считается сейчас → куда переезжает

| Метрика | Где считается сейчас (фронт) | Строка | Куда переезжает (backend read-model) |
|---|---|---|---|
| **Сумма активного времени** (`activeMin`) | `computeDodSnapshot.js` → `processTotalSec` | `1347` | `analysis.derived.process_metrics.time.active_min` |
| **Сумма ожиданий** (`waitMin`) | `useInterviewDerivedState.js` → `summary.wait` | `790` | `analysis.derived.process_metrics.time.wait_min` |
| **Lead time** (`leadMin`) | `SummaryBlock.jsx` складывает `active+wait` | `24` | `analysis.derived.process_metrics.time.lead_min` |
| **Mainline время** (`mainlineMin`) | `computeDodSnapshot.js` → `mainlineTotalSec` | `1349` | `analysis.derived.process_metrics.time.mainline_min` |
| **Throughput** (`stepsPerHour`) | `useInterviewDerivedState.js` → `extendedAnalytics` | `912` | `analysis.derived.process_metrics.time.throughput_steps_per_hour` |
| **Топ-3 ожидания** (`topWaits`) | `useInterviewDerivedState.js` | `812-823` | `analysis.derived.process_metrics.top_waits` |
| **Самый долгий активный шаг** | `useInterviewDerivedState.js` → `extendedAnalytics.maxDurationStep` | `890-895` | `analysis.derived.process_metrics.extremes.max_duration_step` |
| **Самое длинное ожидание** | `useInterviewDerivedState.js` → `extendedAnalytics.maxWaitStep` | `896-901` | `analysis.derived.process_metrics.extremes.max_wait_step` |
| **Привязка к BPMN** (`bindCoveragePct`) | `computeDodSnapshot.js` → `coverage.bind_percent` | `1750-1754` | `analysis.derived.process_metrics.coverage.bind_percent` |
| **Tiers counts** (P0/P1/P2/None) | `useInterviewDerivedState.js` → `extendedAnalytics`/`dodSnapshot.counts.tiers` | `831` | `analysis.derived.process_metrics.counts.tiers` |
| **Распределение по типам** (`typeStats`) | `useInterviewDerivedState.js` → `extendedAnalytics` | `832-854` | `analysis.derived.process_metrics.distributions.by_type` |
| **Распределение по лайнам** (`laneStats`) | `useInterviewDerivedState.js` → `extendedAnalytics` | `855-866` | `analysis.derived.process_metrics.distributions.by_lane` |
| **Распределение по подпроцессам** (`subprocessStats`) | `useInterviewDerivedState.js` → `extendedAnalytics` | `867-878` | `analysis.derived.process_metrics.distributions.by_subprocess` |
| **AI-покрытие шагов** (`aiStepCoveragePct`) | `useInterviewDerivedState.js` → `extendedAnalytics` | `884-921` | `analysis.derived.process_metrics.coverage.ai` |
| **Покрытие границ** (`boundariesCoveragePct`) | `useInterviewDerivedState.js` → `extendedAnalytics` | `887-889` | `analysis.derived.process_metrics.coverage.boundaries` |
| **Исключения: количество** | `useInterviewDerivedState.js` + `ExceptionsBlock.jsx` | `886`, `14` | `analysis.derived.process_metrics.exceptions.count` |
| **Исключения: +минут** (`exceptionAddMinTotal`) | `useInterviewDerivedState.js` → `extendedAnalytics` | `886` | `analysis.derived.process_metrics.exceptions.add_min_total` |
| **Quality errors/warnings** | `computeDodSnapshot.js` → `quality` | `1384-1386` | `analysis.derived.process_metrics.quality` |
| **Path metrics** (`steps_count`, `work_time_total_sec`, …) | `useInterviewDerivedState.js`/`buildInterviewVM.js` | `796-810`, `441-453` | `analysis.derived.process_metrics.path_metrics` |
| **Product actions count by step** | уже backend: `analysis/view-model` | `product_actions_registry.py:754-760` | оставить как есть |
| **Registry rows / completeness** | уже backend: `analysis/view-model` | `product_actions_registry.py:805-843` | оставить как есть |

### 0.4 Существующий backend-driven контекст

- `feature/analytics-backend-driven-v1` уже внедрил `backend/app/routers/analytics.py`, `backend/app/analytics_read_model.py`, snapshots `analytics_session_snapshots` / `analytics_project_snapshots` / `analytics_workspace_snapshots` и refresh tasks.
- `GET /api/analytics/dashboard` (`analytics.py:407`) ориентирован на **Обзор/Analytics Hub**, а не на вкладку «Анализ процессов». Он не содержит interview-specific метрик (top waits, AI coverage, boundaries, exceptions).
- `GET /api/sessions/{id}/analysis/view-model` (`product_actions_registry.py:763`) уже возвращает `analysis.product_actions` и `analysis.derived.step_action_counts`. Его логично **расширить**, а не заводить третий endpoint.

### 0.5 Проблемы текущей реализации

1. **Метрики на фронте** — `computeDodSnapshot.js` и `useInterviewDerivedState.js` пересчитывают тысячи строк JS на каждое изменение `sessionDraft`/`data`/`nodes`/`edges`.
2. **Дублирование источников** — `SummaryBlock` получает время из `dodSnapshot`, а `useInterviewDerivedState` пересчитывает `summary` заново; `buildInterviewVM` пересчитывает path metrics отдельно.
3. **Вертикальная простыня** — все секции видны одновременно, страница прокручивается даже на 1440px.
4. **Нет единого read-model** — `analysis/view-model` знает только про product actions; остальное считается ad-hoc.

---

## 1. Целевой layout (no-scroll)

### 1.1 Общий принцип

- **Страница не прокручивается** (`height: 100vh` / `height: 100%` внутри workbench shell).
- Навигация по секциям — **табы** в шапке страницы.
- Внутри табы допускается **локальная вертикальная прокрутка** таблиц/списков, но не страницы.
- Все KPI и распределения видны сразу на табе «Обзор».

### 1.2 ASCII-макет 1440px

```text
+----------------------------------------------------------------------------------+
| ← Процесс «Название»        Анализ процессов   [Обзор][Шаги][Ветки][Исключения][AI] |
+----------------------------------------------------------------------------------+
|  KPI row (4 cards)                                                               |
|  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                 |
|  │ Lead time   │ │ Active time │ │ Wait time   │ │ Throughput  │                 |
|  │ 124 мин     │ │ 98 мин      │ │ 26 мин      │ │ 0.8 шаг/час │                 |
|  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘                 |
+----------------------------------------------------------------------------------+
|  Left column (60%)              | Right column (40%)                             |
|  ┌───────────────────────────┐  | ┌────────────────────────────┐                 |
|  │ Распределение по лайнам   │  | │ Топ-3 ожидания             │                 |
|  │ [bar list]                │  | │ • Шаг 12: ... — 18 мин     │                 |
|  └───────────────────────────┘  | │ • Шаг 7:  ... — 12 мин     │                 |
|  ┌───────────────────────────┐  | │ • Шаг 23: ... — 9 мин      │                 |
|  │ Распределение по типам    │  | └────────────────────────────┘                 |
|  │ [donut/bar]               │  | ┌────────────────────────────┐                 |
|  └───────────────────────────┘  | │ Покрытие BPMN / AI / Bound  │                 |
|  ┌───────────────────────────┐  | │ [compact meters]           │                 |
|  │ Исключения (+15 мин)      │  | └────────────────────────────┘                 |
|  │ [summary line]            │  |                                                |
|  └───────────────────────────┘  |                                                |
+----------------------------------------------------------------------------------+
```

### 1.3 ASCII-макет таба «Шаги»

```text
+----------------------------------------------------------------------------------+
| [Toolbar: фильтры, порядок, колонки, +шаг]                                       |
+------------------------------+---------------------------------------------------+
| Таблица шагов (scroll)       | Панель «Шаг и продукт» (scroll)                   |
| 46/46 rows                   | - Eyebrow / title / meta                          |
|                              | - Действия: AI-вопросы, Сгенерировать AI, Привязка|
|                              | - ProductActionsPanel (compact)                   |
|                              | - RAG-агент (collapsible)                         |
+------------------------------+---------------------------------------------------+
```

### 1.4 ASCII-макет таба «Ветки BPMN»

```text
+----------------------------------------------------------------------------------+
| [Селектор сценария: P0 Primary | P1 Mitigated | P2 Fail]  | path metrics        |
+----------------------------------------------------------------------------------+
| Дерево/карточки веток (scroll)                                                   |
+----------------------------------------------------------------------------------+
```

### 1.5 Поведение при переполнении

- 1440px: KPI в один ряд (4-6 карточек), двухколоночный обзор.
- 1024px: KPI переносится в 2 ряда по 2, обзорная сетка в 1 колонку.
- <1024px: табы переносятся в выпадающий селект (или горизонтальный скролл табов запрещён — используем overflow-wrap/многоточие).
- Любая таблица/список имеет `max-height` и `overflow-y: auto`; страница — `overflow: hidden`.
- Высоты резервируются через `min-height`/`aspect-ratio`/`skeleton` placeholders (CLS < 0.1).

---

## 2. Read-model

### 2.1 Endpoint

Расширить существующий `GET /api/sessions/{session_id}/analysis/view-model` (`backend/app/routers/product_actions_registry.py:763-849`), добавив в ответ:

```json
{
  "ok": true,
  "session_id": "...",
  "analysis": {
    "product_actions": { /* unchanged */ },
    "derived": {
      "step_action_counts": { /* unchanged */ },
      "process_metrics": { /* NEW */ }
    }
  }
}
```

### 2.2 Новый сервис

Создать `backend/app/services/process_analysis_read_model.py` с функцией:

```python
def build_session_process_analysis(session: Any) -> Dict[str, Any]:
    ...
```

Источники:
- `session.interview.steps` — duration_sec / wait_sec / lane / subprocess / type / tier / node_bind_id.
- `session.interview.boundaries` — покрытие границ.
- `session.interview.exceptions` — count, add_min.
- `session.interview.ai_questions` — coverage.
- `session.bpmn_xml` + `session.bpmn_meta` — качество BPMN, lane/element mapping.
- `session.nodes`/`session.edges` — fallback для critical path / handoffs.

Схема `process_metrics`:

```json
{
  "time": {
    "active_min": 98,
    "wait_min": 26,
    "lead_min": 124,
    "mainline_min": 110,
    "throughput_steps_per_hour": 0.8
  },
  "counts": {
    "steps_total": 46,
    "steps_bound_to_bpmn": 42,
    "tiers": { "P0": 12, "P1": 5, "P2": 2, "None": 27 }
  },
  "coverage": {
    "bind_percent": 91,
    "ai": { "total": 15, "done": 8, "open": 7, "step_coverage_percent": 33 },
    "boundaries": { "filled": 4, "total": 5, "percent": 80 }
  },
  "distributions": {
    "by_type": [{ "key": "task", "label": "Операция", "count": 30, "lead_min": 70, "share_percent": 65 }],
    "by_lane": [{ "key": "cook", "name": "Повар", "count": 12, "lead_min": 45, "share_percent": 26 }],
    "by_subprocess": [{ "key": "sp_1", "name": "Приготовление", "count": 8, "lead_min": 30, "share_percent": 16 }]
  },
  "top_waits": [
    { "step_id": "s12", "seq": "12", "title": "Охлаждение", "wait_min": 18 }
  ],
  "extremes": {
    "max_duration_step": { "seq": "4", "title": "Нарезка", "duration_min": 22 },
    "max_wait_step": { "seq": "12", "title": "Охлаждение", "wait_min": 18 }
  },
  "exceptions": { "count": 7, "add_min_total": 15 },
  "quality": { "errors_total": 0, "warnings_total": 2, "items": [] },
  "path_metrics": {
    "steps_count": 46,
    "work_time_total_sec": 5880,
    "wait_time_total_sec": 1560,
    "total_time_sec": 7440
  },
  "source_state": {
    "source": "process_analysis_read_model",
    "version": "v1",
    "computed_at": 1710000000,
    "diagram_state_version": 42
  }
}
```

### 2.3 Где взять логику подсчёта

- Для времени / lanes / subprocesses / coverage / quality — портировать релевантные части `frontend/src/features/process/dod/computeDodSnapshot.js` (строки 1036-1838) на Python.
- Для mainline/critical path — использовать существующий `backend/app/analytics.py:_critical_path_min` (`analytics.py:71-105`) как основу; расширить, если нужно учитывать wait time.
- Для path metrics — портировать `frontend/src/components/process/interview/viewmodel/buildInterviewVM.js:441-453`.
- Все вычисления должны быть **чистыми функциями** от `session`, без side effects.

### 2.4 Когда пересчитывать

- Синхронно при `GET /api/sessions/{id}/analysis/view-model` для простоты (v1), как сейчас делается с product_actions.
- В дальнейшем можно материализовать в `analytics_session_snapshots` (поля JSON `process_metrics_json`) и обновлять через Celery task при сохранении сессии — out of scope этого контура, но заложить схему с `source_state.computed_at`.

---

## 3. Компонентная карта

### 3.1 Переиспользуемое (существующее)

| Компонент | Где используется | Что меняем |
|---|---|---|
| `TimelineTable` (`frontend/src/components/process/interview/TimelineTable.jsx`) | таб «Шаги» | только density/height tweaks |
| `ProductActionsPanel` (`frontend/src/components/process/interview/ProductActionsPanel.jsx`) | панель справа | compact mode, фиксированная высота |
| `RagSearchPanel` (`frontend/src/components/process/interview/RagSearchPanel.jsx`) | панель справа | collapsible, фиксированная высота |
| `BpmnBranchesPanel` (`frontend/src/components/process/interview/transitions/BpmnBranchesPanel.jsx`) | таб «Ветки BPMN» | обёртка во вкладку, высота |
| `ExceptionsBlock` (`frontend/src/components/process/interview/ExceptionsBlock.jsx`) | таб «Исключения» | обёртка, высота |
| `AiQuestionsBlock` (`frontend/src/components/process/interview/AiQuestionsBlock.jsx`) | таб «AI» | обёртка, высота |
| `LlmAnalysisBlock` (`frontend/src/components/process/interview/LlmAnalysisBlock.jsx`) | таб «AI» | обёртка, высота |
| `AnalyticsSectionTabs` / pill tabs (`frontend/src/features/analytics/AnalyticsSectionTabs.jsx`) | навигация табами | адаптировать под interview page |
| `DashboardMetricCard` pattern (`frontend/src/features/analytics/`) | KPI на табе «Обзор» | использовать существующий шаблон карточки |

### 3.2 Новое

- `frontend/src/features/process/analysis/ProcessAnalysisPage.jsx` — корневой layout страницы с табами и fixed height.
- `frontend/src/features/process/analysis/ProcessAnalysisOverview.jsx` — сетка KPI + распределения + топ-ожидания + coverage meters.
- `frontend/src/features/process/analysis/ProcessAnalysisStepsTab.jsx` — таблица + панель справа.
- `frontend/src/features/process/analysis/ProcessAnalysisBranchesTab.jsx` — обёртка `BpmnBranchesPanel`.
- `frontend/src/features/process/analysis/ProcessAnalysisExceptionsTab.jsx` — обёртка `ExceptionsBlock`.
- `frontend/src/features/process/analysis/ProcessAnalysisAiTab.jsx` — `AiQuestionsBlock` + `LlmAnalysisBlock`.
- `frontend/src/features/process/analysis/useProcessAnalysisViewModel.js` — загрузка и кэширование `analysis/view-model`, проброс `process_metrics`.
- `frontend/src/features/process/analysis/processAnalysisModel.js` — view-model mapper: backend read-model → props для UI.
- `backend/app/services/process_analysis_read_model.py` — pure Python calculation.
- `backend/tests/test_process_analysis_read_model.py` — unit tests для read-model.
- `frontend/src/features/process/analysis/ProcessAnalysisSkeleton.jsx` — skeleton для CLS < 0.1.

### 3.3 i18n

- Ключи добавлять в `frontend/src/shared/i18n/ru.js` и `frontend/src/shared/i18n/en.js` в namespace `processAnalysis.*`.
- Не использовать хардкод строк в новых компонентах.

---

## 4. Будущее: панель «действия по шагам» (LLM)

- В табе «Шаги» панель «Шаг и продукт» (`ProductActionsPanel`) уже содержит действия с продуктом.
- Резервируем место под будущую LLM-панель «Действия по шагам»:
  - второй inner-tab или секция внутри правой колонки;
  - placeholder component `ProcessAnalysisActionsAssistantPlaceholder`;
  - data contract: `analysis.derived.process_metrics.step_action_counts` (уже есть) + future `analysis.derived.actions_assistant`.
- Следующий контур (`feature/actions-assistant-*`) будет реализовывать LLM-предложения действий, не трогая layout этого контура.

### 4.1 PREMIUM: канвас-связанная страница

- Заложить bidirectional selection contract:
  - `selectedDiagramElement` (props в `InterviewStage`) → highlight row в `TimelineTable`.
  - click row → `onBpmnElementSelect(elementId)` (уже есть в `ProcessStage.jsx`).
- Не реализовывать сейчас, но в `ProcessAnalysisStepsTab` оставить `onElementSelect` prop и `data-bpmn-ref` на строках таблицы.

---

## 5. Гейт приёмки

### 5.1 No-scroll

- Скриншоты на 1440px и 1024px без вертикальной полосы прокрутки страницы.
- Внутренние таблицы/списки могут прокручиваться; body страницы — `overflow: hidden`.

### 5.2 Backend-driven

- `backend/tests/test_process_analysis_read_model.py` покрывает все метрики из таблицы §0.3.
- Source-test на фронте: grep не находит арифметики метрик в `frontend/src/features/process/analysis/` (кроме форматтеров `sec→min`, `percent`).
- `computeDodSnapshot.js` остаётся только для DoD checks / quality items / validation, не для KPI.

### 5.3 Регрессия

- `npm run build` — PASS.
- backend tests: `pytest tests/test_analytics_backend_driven.py tests/test_process_analysis_read_model.py` — PASS.
- frontend tests:
  - `frontend/src/components/process/interview/interviewSurfaceSimplification.test.mjs`
  - `frontend/src/components/process/interview/interviewAnalysisNamespaceGuard.test.mjs`
  - `frontend/src/components/process/interview/timelineTableDensityNoLayoutShift.uiux.test.mjs`
  — PASS.

### 5.4 a11y

- Контраст текста ≥ 4.5:1 (проверка через devtools).
- Видимые focus-кольца на всех интерактивных элементах.
- Клавиатурная навигация по табам (arrow keys / Tab).
- `prefers-reduced-motion` — отключает hover/loading transitions.
- Никакого горизонтального скролла страницы.
- SVG-иконки, не эмодзи.
- Явные состояния `loading` / `empty` / `error` у каждого блока данных.
- Интерактивные элементы ≥ 24px в dense-режиме.

---

## 6. Риски и ограничения

- **Портирование computeDodSnapshot** — большой объём (~1800 строк JS). Нужно брать только метрики из §0.3, не весь DoD engine.
- **Mainline/critical path** — может расходиться между `session.nodes/edges` и `session.interview.steps`. Контракт: read-model использует interview.steps как primary source, fallback на nodes/edges.
- **CLS** — высоты блоков на табе «Обзор» резервируются через skeleton; таблицы на табе «Шаги» имеют `min-height`.
- **Scope creep** — не добавлять новые цвета/шрифты; только существующие `--pm-tobe-*` токены и Fira Code/Fira Sans.

---

## 7. Следующий шаг

Ожидание апрува владельца на этот PLAN + UI.md. После апрува: создание feature-ветки `feature/analysis-page-redesign` от актуального `origin/main` и реализация по пунктам 1-5.
