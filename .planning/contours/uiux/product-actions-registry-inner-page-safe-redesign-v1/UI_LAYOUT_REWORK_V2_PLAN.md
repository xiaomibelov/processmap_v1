# UI_LAYOUT_REWORK_V2_PLAN

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Дата:** 2026-05-17  
**Run ID:** `20260517T134855Z`  
**Agent:** Agent 1 / Planner  
**Статус:** `READY_FOR_EXECUTION_WITH_CHANGES_REQUESTED`

## 1. Цель

Подготовить безопасную UI/UX-доработку внутренней страницы «Реестр действий с продуктом» по последнему runtime-скриншоту и пользовательскому фидбеку.

Цель не в новом визуальном языке, а в исправлении иерархии:

```text
Header
→ Scope block
→ Compact metrics row
→ Filters row
→ Warning banner
→ Main registry table
→ Clearly separate data sources section
```

## 2. Source/runtime truth на момент планирования

| Поле | Значение |
|---|---|
| `pwd` | `/opt/processmap-test` |
| branch | `fix/lockfile-sync-test` |
| `HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| remote | `origin` указывает на `xiaomibelov/processmap_v1.git` |
| status | рабочее дерево dirty; есть unrelated изменения и уже существующие planning/runtime артефакты |
| Agent 1 product code changes | нет |

Важно: текущий checkout не является canonical root из operating contract (`/Users/mac/PycharmProjects/processmap_canonical_main`). Для Agent 1 это допустимо только потому, что текущий шаг создаёт planning-документы и prompt’ы. Worker 2 обязан перед implementation отдельно доказать source/runtime truth и безопасную изоляцию.

## 3. Bounded scope

Разрешённый контур Worker 2:
- Product Actions Registry inner page UI/layout.
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/process/analysis/registry/*`
- точечные CSS правила реестра в `frontend/src/styles/tailwind.css`
- тесты Product Actions Registry, если изменение DOM/семантики требует обновления.

Запрещено:
- shell/header/global ProcessMap redesign;
- Analytics Hub redesign;
- backend/schema/API changes;
- Product Actions durable truth changes;
- BPMN XML mutation;
- RAG runtime/tooling changes;
- unrelated Diagram work;
- package installs;
- fake data;
- broad refactor.

## 4. Desired page hierarchy

### A. Header

- Заголовок и описание остаются первыми.
- «Вернуться» выделяется как navigation action слева или в очевидной nav-зоне.
- CSV/XLSX остаются справа как compact utility actions.
- Export meta не должен становиться главным summary страницы.

### B. Scope block

- Workspace / Проект / Сессия компактны.
- Визуально ближе к Explorer semantics: label/type marker, selected state, hierarchy cue, спокойная плотность.
- Disabled states понятны, но не шумные.

### C. Compact metrics row

Counters:
- Сессий
- Строк
- Полных
- Неполных
- После фильтров

Правила:
- меньше высота и визуальный вес;
- values без hero typography;
- «После фильтров» на равных с остальными, без oversized card;
- метрики сидят естественно под scope, а не как отдельный dashboard.

### D. Filters row

- Горизонтальный/grid toolbar.
- Не превращать фильтры в левый вертикальный stack.
- Reset action остаётся видимым.

### E. Warning banner

- Остаётся над таблицей, если есть incomplete rows.
- Не перекрывает основной focus.

### F. Main registry table

- Основной визуальный блок страницы.
- Читаемые строки, ясные status chips.
- Таблица не должна визуально сливаться с sources section.

### G. Separate «Источники данных» section

- Отдельный заголовок.
- Явный visual delimiter: отступ, section card/background, border, divider или другой безопасный паттерн.
- Sources block вторичный, но не невидимый.
- Project/workspace/session semantics понятнее.
- «Открыть проект» / «Открыть сессию» понятны как разные source actions.

## 5. 4-agent workflow

### Agent 1 / Planner

Создаёт этот planning pack, prompt’ы, чеклисты, state и marker `CHANGES_REQUESTED`.

### Agent 2 / Worker — UI implementation

Работает независимо. Не ждёт Worker 3.

Реализует layout refinement:
- compact metrics;
- clearer navigation/export split;
- Explorer-like scope semantics;
- clear registry/source section separation;
- table remains primary.

При успехе создаёт `WORKER_2_DONE`. При блокере создаёт `EXEC_PART_1_BLOCKED.md`.

### Agent 3 / Worker — UX/spec independent lane

Работает независимо. Не ждёт Worker 2 и не валидирует его implementation.

Создаёт точный UX checklist по screenshot/user feedback:
- metric weight;
- action placement;
- scope semantics;
- section separation;
- source block clarity;
- primary/secondary hierarchy.

При успехе создаёт `WORKER_3_DONE`. При блокере создаёт `EXEC_PART_2_BLOCKED.md`.

### Agent 4 / Reviewer

Ждёт оба marker’а:
- `WORKER_2_DONE`
- `WORKER_3_DONE`

Затем проверяет свежий runtime на `5180`, открывает Analytics → «Реестр действий» и выдаёт `REVIEW_PASS` только при видимом runtime improvement.

## 6. Planning validation

| Проверка | Статус |
|---|---|
| Worker 3 prompt независим от Worker 2 | PASS |
| Только Agent 4 ждёт `WORKER_2_DONE` и `WORKER_3_DONE` | PASS |
| Используются только part-specific blocked markers | PASS |
| Prompt text на английском | PASS |
| Docs/checklists/state на русском | PASS |
| Agent 1 не меняет product code | PASS |

