# PLAN

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`  
Роль: Agent 1 / Planner  
Статус: `READY_FOR_EXECUTION`

## Цель продукта

Создать первый безопасный foundation для `Реестр свойств` внутри `ProcessMap Analytics`.

Пользователь должен открыть:

```text
Аналитика -> Реестр свойств
```

и увидеть clear first version страницы реестра свойств. Страница показывает real extracted properties только при подтверждённом current frontend/runtime source. Если безопасный extraction не готов, страница показывает честный structured empty/foundation state без fake registry.

## Analytics preservation rule

Критическое правило:

```text
Аналитика
  ├─ Реестр действий
  ├─ Реестр свойств
  └─ Дашборды
```

`Аналитика` остаётся top-level section. Запрещено заменять `Аналитика` на `Реестр действий` или `Реестр свойств`.

## Source/runtime truth before plan

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

Вывод: launcher checkout dirty и не является merge-ready implementation tree. Worker 2 обязан использовать clean worktree/branch от `origin/main` или документально доказать safety текущего checkout. Нельзя молча добавлять изменения в dirty non-merge-ready tree.

## Source-truth-first approach

До отображения real rows Worker 2 обязан доказать source:

- конкретный frontend/runtime source;
- как source доступен на page без backend/schema changes;
- какие поля являются real current data;
- какие metrics считаются из real rows;
- какие filters реально мапятся на data;
- почему чтение не мутирует BPMN XML, Product Actions или backend durable truth.

Если любое звено не доказано, используется foundation empty mode.

## Confirmed-vs-hypothesis policy

Каждый candidate source классифицируется:

1. `confirmed current source`;
2. `available but not suitable for this contour`;
3. `hypothesis/future`;
4. `requires backend/API work later`.

Preliminary source evidence from planner inspection:

| Candidate | Current evidence | Planner classification |
| --- | --- | --- |
| Camunda/Zeebe extension properties in businessObject | `extractCamundaZeebePropertyEntriesFromBusinessObject`, `listSearchablePropertiesOnInstance` | confirmed current source for in-session diagram runtime only; Worker 2 must prove route/page access before rendering rows |
| `bpmn_meta.camunda_extensions_by_element_id` | `normalizeBpmnMeta`, `getCamundaExtensionsMap`, `resolveSourceCamundaExtensionState` | confirmed current frontend model, but page-safe aggregation must be proven |
| Property overlay preview | `buildPropertiesOverlayPreview`, `applyPropertiesOverlayDecor` | available but not automatically suitable as registry truth; overlay is visual/runtime preview |
| Robot meta / process object properties | `robot_meta_by_element_id`, `pm:RobotMeta` paths | available but not suitable unless mapped read-only and documented |
| DoD / quality / process step metadata | interview/viewmodel and DoD models exist | hypothesis/future for registry unless source shape is proven |
| `bpmn_meta_json / nodes_json / edges_json` | not proven exposed to this frontend page during planner pass | requires Worker 2/3 investigation |
| Product Actions data | existing registry source | not suitable for properties registry truth in this contour |

## Page structure

`Реестр свойств` page:

1. Header:
   - title: `Реестр свойств`;
   - subtitle: `Сводный список свойств BPMN-элементов и процессных объектов.`;
   - `Вернуться`;
   - CSV/XLSX only if existing export support is safely reused without backend changes.
2. Scope selector:
   - `Workspace / Проект / Сессия`;
   - same semantics as other registries;
   - no fake active state.
3. Metrics row:
   - `Источников`;
   - `Элементов`;
   - `Свойств`;
   - `Типов свойств`;
   - `После фильтров`.
   - If unavailable: show `—` and honest foundation note.
4. Filters only when data supports them:
   - `Тип объекта`;
   - `Тип свойства`;
   - `Группа свойства`;
   - `Источник`;
   - `Процесс / сессия`;
   - `Полнота / наличие значения`.
5. Main table candidate columns:
   - `Объект`;
   - `Свойство`;
   - `Значение`;
   - `Источник / процесс`;
   - `Тип / группа`;
   - `Статус`.
6. Empty/foundation state:
   - message: `Свойства ещё не собраны в реестр. Нужно подключить подтверждённые источники свойств BPMN/оверлеев.`
   - planned property groups may appear only as planned text, not as data.
7. Source truth note:
   - page must explicitly say whether rows are loaded from confirmed current sources or foundation mode is active.

## Visual direction

- one main white container;
- light separators;
- no gradients;
- no dotted borders;
- no nested cards;
- no colored metric cards;
- typography over decoration;
- table is primary object;
- keep global shell/header/sidebar unchanged.

## Strict non-goals

- no backend schema migration;
- no new durable truth;
- no BPMN XML writes;
- no Product Actions durable truth mutation;
- no RAG runtime implementation;
- no AI auto-write;
- no full dashboards;
- no global shell/header/sidebar redesign;
- no package install;
- no fake data;
- no broad refactor;
- no merge/PR/deploy.

## Worker split

### Agent 2 / Worker — implementation lane

Independent scope:

- inspect current Analytics routing/navigation;
- inspect existing sources for property-like data;
- wire `Реестр свойств` module inside Analytics;
- build properties registry page shell;
- if confirmed source exists and is page-safe, implement read-only table from real data only;
- otherwise implement honest foundation/empty state;
- preserve `Реестр действий`;
- preserve top-level `Аналитика`;
- preserve global shell;
- update version row;
- write reports in Russian;
- create `WORKER_2_DONE`.

Blocked marker: `EXEC_PART_1_BLOCKED.md`.

### Agent 3 / Worker — independent source-truth / UX checklist lane

Independent scope:

- independently inspect code/docs for property sources;
- build confirmed-vs-hypothesis matrix;
- define minimum acceptable UX for real-data mode and foundation mode;
- define no-fake rules;
- define future backend/API requirements if current data is insufficient;
- prepare Agent 4 runtime review checklist;
- write reports in Russian;
- create `WORKER_3_DONE`.

Blocked marker: `EXEC_PART_2_BLOCKED.md`.

## Agent 4 gates

Agent 4 / Reviewer performs final validation only.

`REVIEW_PASS` only if browser/runtime proof confirms:

- fresh runtime on `http://clearvestnic.ru:5180`;
- version/build-info matches this contour/run or served source is explicitly explained;
- `Аналитика` exists;
- module entries visible:
  - `Реестр действий`;
  - `Реестр свойств`;
  - `Дашборды`;
- `Реестр свойств` opens;
- page title/subtitle/scope/metrics/filter/table-or-empty-state are present;
- real data appears only if source-proven and documented;
- no fake rows/counts;
- `Вернуться` returns to Analytics;
- `Реестр действий` still works;
- global shell unchanged;
- console clean;
- no unsafe `PUT/PATCH/DELETE` from viewing/navigation;
- no backend/schema/BPMN/RAG changes out of scope.

No `REVIEW_PASS` if:

- Analytics is missing;
- `Реестр свойств` is missing from Analytics;
- fake property rows or fake counts are shown;
- property source is not documented;
- BPMN XML is mutated;
- Product Actions durable truth is changed;
- backend/schema changes appear without explicit scope;
- only source/tests were checked without browser proof.

## Branch hygiene guard

Worker 2 must either:

- use a clean worktree/branch from `origin/main` and apply only bounded Analytics/Properties Registry changes; or
- explicitly document why the current checkout is safe.

Worker 3 may write only planning/report artifacts and must keep product code untouched.

## Required artifacts

- `WORKER_2_PROMPT.md`
- `WORKER_3_PROMPT.md`
- `EXECUTOR_PART_1_PROMPT.md`
- `EXECUTOR_PART_2_PROMPT.md`
- `REVIEWER_PROMPT.md`
- `RAG_PREFLIGHT_PLANNER.md`
- `RAG_PREFLIGHT_REVIEWER.md`
- `OBSIDIAN_CONTEXT_USED.md`
- `GSD_CONTEXT_USED.md`
- `PROPERTIES_SOURCE_TRUTH_CHECKLIST.md`
- `PROPERTIES_REGISTRY_UX_REQUIREMENTS.md`
- `NO_FAKE_PROPERTIES_RULES.md`
- `RUNTIME_PROOF_CHECKLIST.md`
- `BRANCH_SCOPE_CHECKLIST.md`
- `STATE.json`
- `AGENT_RUN_ID`
- `READY_FOR_EXECUTION`
