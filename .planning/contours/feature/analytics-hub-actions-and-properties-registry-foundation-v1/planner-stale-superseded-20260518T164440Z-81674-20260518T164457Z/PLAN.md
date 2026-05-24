# PLAN

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`  
Роль: Agent 1 / Planner  
Статус: `READY_FOR_EXECUTION`

## Причина коррекции

Предыдущая ветка ошибочно сместила смысл верхнего уровня: `Реестр действий` не должен заменять `Аналитика`.

Правильная модель:

```text
Аналитика
  ├─ Реестр действий
  ├─ Реестр свойств
  └─ Дашборды
```

`Аналитика` должна быть восстановлена как верхнеуровневый раздел. Внутренние registry pages могут развиваться, но не имеют права удалять или обходить Analytics surface.

## Source/runtime truth перед планом

```text
pwd: /opt/processmap-test
remote: origin -> github.com/xiaomibelov/processmap_v1.git, credential-bearing URL redacted
git fetch origin: PASS
branch: fix/lockfile-sync-test
HEAD: 5b20bc2d1292f419647238eaf37dac55f9315942
origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
status: dirty tracked frontend files plus many untracked artifacts
cached diff: empty
```

Вывод: launcher checkout не является merge-ready. Product-code implementation lane должен использовать clean worktree/branch от `origin/main` или явно доказать safety текущего checkout. Нельзя молча продолжать работу в грязной ветке.

## Восстановленная IA

- Top-level surface `Аналитика` существует и не bypassed direct-only registry route.
- Внутри `Аналитика` видны entries:
  - `Реестр действий`;
  - `Реестр свойств`;
  - `Дашборды`.
- `Реестр действий` открывает текущую page `Реестр действий с продуктом`.
- `Реестр свойств` открывает first foundation page или честный placeholder.
- `Дашборды` остаётся future placeholder.
- `Вернуться` с внутренних pages возвращает в `Аналитика`.
- Global ProcessMap shell/header/sidebar не меняются.

## Решение по Export

Отдельного top-level module/card `Экспорт` в `Аналитика` сейчас быть не должно.

Экспорт остаётся там, где реально экспортируются данные:

- CSV/XLSX внутри `Реестр действий`;
- будущие controls внутри `Реестр свойств`, если source truth позже это потребует.

Agent 4 ставит `CHANGES_REQUESTED`, если отдельная карточка `Экспорт` появилась в Analytics без нового решения пользователя.

## Scope: Реестр действий

Сохранить существующую runtime-функциональность и применить clean visual direction только к inner page `Реестр действий с продуктом`.

Обязательные правила:

- один unified white content container;
- no gradients;
- no dotted borders;
- no colored metric cards;
- no internal shadows;
- light separators only;
- table is primary content;
- header содержит `Реестр действий с продуктом`;
- CSV/XLSX controls находятся в header;
- compact scope tabs/selector;
- compact text metrics;
- compact filters;
- AI row без gradient/background в primary area;
- soft warning row, not aggressive banner;
- sources/data-source section remains secondary and separated;
- empty workspace scope still shows structure;
- populated project scope shows rows and controls;
- no fake data.

## Scope: Реестр свойств

Цель этого контура: first safe foundation, не full properties system.

Разрешено:

- entry/card `Реестр свойств` внутри Analytics;
- отдельная page/surface с title `Реестр свойств`;
- description: `Сводный список свойств BPMN-элементов и процессных объектов.`;
- если real property data already accessible safely in frontend/runtime, показать minimal read-only shell/table;
- если unified source не подтверждён, показать structured placeholder:
  - что будет включено;
  - planned property groups/types;
  - no fake counts;
  - no fake rows.

Запрещено:

- invent durable backend truth;
- mutate BPMN XML;
- pretend future data exists;
- смешивать `Реестр свойств` с `Реестр действий`;
- использовать `product_actions[]` как truth для properties registry.

Предварительные категории для проверки Agent 3:

- BPMN element properties;
- overlay/property tags visible on diagram;
- product/process attributes;
- process step metadata;
- DoD/quality properties;
- lane/role/location/equipment/product-related properties.

Каждая категория должна быть классифицирована как `confirmed current source`, `hypothesis` или `future backend/API requirement`.

## Scope: Дашборды

`Дашборды` остаются placeholder/future module:

- entry виден в Analytics;
- page/surface честно маркирует future status;
- нет fake metrics;
- нет dashboard implementation.

## RAG backlog only

В этом контуре создать только backlog note для будущей работы:

- admin RAG auto-indexing;
- nightly indexing schedule;
- indexing new Project Atlas files;
- detecting unindexed docs;
- future link/file ingestion.

Implementation этого контура не включает RAG auto-indexer, scheduler, ingestion, runtime, API или UI.

## Worker split

### Agent 2 / Worker: implementation lane

Независимый implementation scope:

- восстановить/wire top-level `Аналитика`;
- добавить entries `Реестр действий`, `Реестр свойств`, `Дашборды`;
- не добавлять отдельную карточку `Экспорт`;
- связать `Реестр действий` с текущей registry page;
- добавить foundation/placeholder page `Реестр свойств`;
- сохранить/refine визуальные правила inner page `Реестр действий`;
- обеспечить `Вернуться` из внутренних pages в `Аналитика`;
- обновить version row;
- написать reports на русском;
- создать `WORKER_2_DONE`.

Если blocked: создать `EXEC_PART_1_BLOCKED.md`.

### Agent 3 / Worker: independent UX/source-truth/backlog lane

Независимый non-product-code scope:

- определить acceptance criteria для restored Analytics;
- определить boundary rules для Analytics Hub, Actions Registry inner page, Properties Registry foundation, Dashboard placeholder, Export inside registries only;
- inspect source/runtime/docs for actual existing property sources;
- классифицировать property registry data как confirmed/hypothesis/future requirement;
- создать RAG backlog note;
- подготовить Agent 4 runtime review checklist;
- написать reports на русском;
- создать `WORKER_3_DONE`.

Если blocked: создать `EXEC_PART_2_BLOCKED.md`.

## Agent 4 runtime gates

Agent 4 / Reviewer выполняет final validation only и выдаёт `REVIEW_PASS` только при runtime proof:

- fresh `:5180` runtime proof;
- version/build-info matches this contour/run or explicitly explains served source;
- `Аналитика` открывается и не bypassed;
- entries `Реестр действий`, `Реестр свойств`, `Дашборды` видны;
- отдельной top-level `Экспорт` card нет;
- `Реестр действий` открывается, сохраняет функциональность и выполняет inner-page visual rules;
- `Вернуться` возвращает в Analytics;
- `Реестр свойств` honest foundation без fake rows/counts;
- `Дашборды` clearly future;
- global shell/header/sidebar unchanged;
- no console errors;
- no unsafe `PUT/PATCH/DELETE` from viewing/navigation;
- no backend/schema/BPMN/RAG runtime changes.

No `REVIEW_PASS`, если:

- Analytics missing;
- `Реестр действий` replaces Analytics;
- `Реестр свойств` missing entirely;
- separate `Экспорт` top-level Analytics card appears;
- Product Actions Registry loses current runtime functionality;
- fake property rows/counts introduced;
- RAG auto-indexing implemented in this contour;
- backend/schema/BPMN/RAG changes appear out of scope;
- only source/tests were checked without browser proof.

## Branch hygiene guard

Текущий checkout dirty и не является безопасной merge branch.

Worker 2 обязан:

- использовать clean worktree/branch от `origin/main` и применить только bounded Analytics/Registry files; или
- документально доказать, почему текущий checkout безопасен.

Worker 3 обязан документировать source/runtime truth, но не должен блокировать свой независимый UX/source-truth/backlog пакет ожиданием implementation lane.

Нельзя молча добавлять изменения в dirty non-merge-ready branch.

## Required reports

Agent 2:

- `WORKER_2_REPORT.md`
- `SOURCE_MAP_WORKER_2.md`
- `ANALYTICS_RESTORE_IMPLEMENTATION_REPORT.md`
- `ACTIONS_REGISTRY_NAVIGATION_REPORT.md`
- `PROPERTIES_REGISTRY_FOUNDATION_REPORT.md`
- `VERSION_UPDATE_LEDGER_PROOF.md`
- `WORKER_2_VALIDATION_RESULTS.md`
- `WORKER_2_DONE`

Agent 3:

- `WORKER_3_REPORT.md`
- `ANALYTICS_RESTORE_ACCEPTANCE_CRITERIA.md`
- `REGISTRY_BOUNDARY_RULES.md`
- `PROPERTIES_SOURCE_TRUTH_REVIEW.md`
- `PROPERTIES_CONFIRMED_VS_HYPOTHESIS.md`
- `RAG_AUTO_INDEXING_BACKLOG_NOTE.md`
- `AGENT4_REVIEW_CHECKLIST.md`
- `WORKER_3_DONE`

Agent 4:

- `REVIEW_REPORT.md`
- `RUNTIME_PROOF_CHECKLIST_FILLED.md`
- `REVIEW_PASS` or `CHANGES_REQUESTED`
- `REWORK_REQUEST.md` when blocked
