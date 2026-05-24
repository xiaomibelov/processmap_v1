# Agent 2 / Worker Prompt

Contour: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`  
Role: Agent 2 / Worker — implementation lane

## Mission

Implement the first safe foundation for `Реестр свойств` inside ProcessMap Analytics.

The user must be able to open:

```text
Аналитика -> Реестр свойств
```

and see either real source-proven properties or an honest foundation empty state.

## Language contract

- Keep this prompt execution in English if you need to reason.
- Write all reports and Project Atlas notes in Russian.
- Do not write product copy in English unless existing UI requires it.

## Preflight

Before code changes, capture source truth:

```bash
pwd
git remote -v
git fetch origin
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git diff --name-only
git diff --cached --name-only
```

Redact credentials in reports.

Branch hygiene is mandatory. The launcher checkout is dirty. You must either:

- use a clean worktree/branch from `origin/main` and apply only bounded Analytics/Properties Registry changes; or
- explicitly document why the current checkout is safe.

Do not silently add product changes to a dirty non-merge-ready tree.

## Scope

Implementation lane only:

- inspect current Analytics routing/navigation;
- inspect existing sources for property-like data;
- preserve top-level `Аналитика`;
- preserve `Реестр действий`;
- preserve `Дашборды` as placeholder/future;
- add or wire `Реестр свойств` as a module inside Analytics;
- clicking `Реестр свойств` opens the new properties registry page;
- `Вернуться` returns to Analytics;
- build the properties registry page shell;
- if a confirmed page-safe data source exists, render a read-only table using real data only;
- if no safe data source exists, render the honest foundation empty state;
- update version row;
- do not change backend/schema;
- do not mutate BPMN XML;
- do not mutate Product Actions durable truth;
- do not implement RAG runtime;
- do not install packages.

## Required Analytics model

```text
Аналитика
  ├─ Реестр действий
  ├─ Реестр свойств
  └─ Дашборды
```

Do not remove Analytics. Do not replace Analytics with any registry.

## Properties page structure

Header:

- title: `Реестр свойств`;
- subtitle: `Сводный список свойств BPMN-элементов и процессных объектов.`;
- `Вернуться`;
- CSV/XLSX only if safely reusable without backend changes.

Scope selector:

- `Workspace / Проект / Сессия`;
- same semantics as other registries;
- no fake active state.

Metrics row:

- `Источников`;
- `Элементов`;
- `Свойств`;
- `Типов свойств`;
- `После фильтров`.

Use real values only. If unavailable, show `—`.

Filters only if real data supports them:

- `Тип объекта`;
- `Тип свойства`;
- `Группа свойства`;
- `Источник`;
- `Процесс / сессия`;
- `Полнота / наличие значения`.

Main table candidate columns:

- `Объект`;
- `Свойство`;
- `Значение`;
- `Источник / процесс`;
- `Тип / группа`;
- `Статус`.

Empty/foundation message:

```text
Свойства ещё не собраны в реестр. Нужно подключить подтверждённые источники свойств BPMN/оверлеев.
```

## Source decision

Classify every investigated property source as:

1. confirmed current source;
2. available but not suitable for this contour;
3. hypothesis/future;
4. requires backend/API work later.

Do not show rows or counts from a source unless the source is confirmed and documented.

Candidate source areas:

- BPMN element properties;
- Camunda/BPMN extension attributes already parsed;
- `bpmn_meta_json / nodes_json / edges_json` if exposed safely to frontend;
- diagram property overlays;
- DoD / quality / role / lane / equipment / product-related properties if already present;
- process step metadata;
- existing property panel models;
- existing overlay/decor managers;
- existing analysis/interview/session state.

## UI direction

- one main white container;
- light separators;
- no gradients;
- no dotted borders;
- no nested cards;
- no colored metric cards;
- typography over decoration;
- table as primary object;
- preserve global shell/header/sidebar.

## Reports to write in Russian

Write all under:

```text
/opt/processmap-test/.planning/contours/feature/process-properties-registry-foundation-v1/
```

Required:

- `WORKER_2_REPORT.md`
- `SOURCE_MAP_WORKER_2.md`
- `PROPERTIES_SOURCE_IMPLEMENTATION_DECISION.md`
- `PROPERTIES_REGISTRY_IMPLEMENTATION_REPORT.md`
- `ANALYTICS_NAVIGATION_REPORT.md`
- `VERSION_UPDATE_LEDGER_PROOF.md`
- `WORKER_2_VALIDATION_RESULTS.md`
- `WORKER_2_DONE`

If blocked, write:

- `EXEC_PART_1_BLOCKED.md`

Do not create `WORKER_2_DONE` if blocked.

## Validation

Run focused tests/build that match the touched files when feasible. Record commands and results in Russian.

Required checks in reports:

- Analytics still exists.
- `Реестр действий` remains available.
- `Реестр свойств` opens.
- `Дашборды` remains placeholder/future.
- no fake property data.
- no unsafe writes from navigation/viewing.
- no backend/schema/BPMN/RAG runtime changes.
