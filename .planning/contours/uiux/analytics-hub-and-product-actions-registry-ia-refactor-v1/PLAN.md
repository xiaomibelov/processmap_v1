# План: Analytics Hub + Product Actions Registry IA refactor

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`  
Роль: Agent 1 / Planner  
Статус: `READY_FOR_EXECUTION`

## Источник master plan

Основание: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`.

Master plan прошел `REVIEW_PASS` и утвердил:
- `Аналитика` как верхнеуровневую поверхность;
- `Реестр действий` как модуль внутри Analytics;
- будущий `Реестр свойств`;
- направления `Дашборды` и `Экспорт`;
- AI/RAG только как read-only support layer;
- постепенный frontend/backend split, без server split в этом контуре.

Фаза из roadmap: Phase 1 - bounded Product Actions Registry IA/UI refactor.

## Runtime/source truth на старте планирования

- `pwd`: `/opt/processmap-test`
- branch: `fix/lockfile-sync-test`
- `HEAD`: `5b20bc2d1292f419647238eaf37dac55f9315942`
- `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- `git fetch origin`: выполнен успешно.
- `git diff --cached --name-only`: пусто.
- working tree: dirty, есть modified product-code и много untracked artifacts.
- GSD: `/opt/processmap-test/bin/gsd` найден; `gsd usage` не поддерживается (`Unknown command: usage`); `gsd` без аргументов печатает usage для `gsd-tools`.
- RAG preflight: сохранен в `RAG_PREFLIGHT_PLANNER.md` и `RAG_PREFLIGHT_REVIEWER.md`.

Вывод: Planner не пишет product code. Worker implementation lane должен использовать clean worktree/branch от `origin/main` или явно доказать безопасность текущего checkout. Dirty tree нельзя молча использовать как merge-ready основу.

## Текущая UX-проблема

Страница `Product Actions Registry` функциональна, но пользователь плохо считывает структуру:
- страница выглядит как один длинный серый лист;
- `Workspace / Проект / Сессия` не имеют ясной визуальной роли;
- метрики слишком широкие и тяжелые;
- filters/actions/AI блок расположен неловко;
- `Источники данных` сливаются с главным реестром;
- таблица доминирует как плоский список, но не объясняет строку;
- пустой workspace scope не должен превращаться в пустую страницу без структуры.

## Целевая IA

### Analytics Hub

- Сохранить верхнеуровневую страницу `Аналитика`.
- Сохранить карточки: `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
- Сделать `Реестр действий` главным понятным входом в redesigned registry.
- `Реестр свойств` оставить placeholder/card, без полной реализации.
- Не менять global shell/header/sidebar.

### Product Actions Registry

Структура страницы:
1. Навигация: понятный `Вернуться` к Analytics Hub.
2. Заголовок: короткий title и назначение страницы.
3. Scope: три визуально distinct блока `Workspace`, `Проект`, `Сессия`.
4. Compact metrics: легкая строка/chips, не широкие heavy cards.
5. Primary action/filter area: filters, CSV/XLSX utility actions, AI controls.
6. Main registry surface: table как главный контент.
7. Optional row detail: chevron/row expansion, если текущие данные позволяют без durable changes.
8. Secondary sources section: `Источники данных` отдельно от таблицы и визуально вторично.

Пустой workspace scope обязан показывать ту же структуру: title, scope, metrics, filters/actions, AI controls, table shell/headers или deliberate empty table shell, empty state, pagination shell если это соответствует текущему компоненту.

## Non-goals

- Не менять backend.
- Не менять schema.
- Не мутировать BPMN XML.
- Не менять durable truth `Product Actions`.
- Не менять RAG runtime.
- Не добавлять AI auto-write.
- Не реализовывать полноценный `Реестр свойств`.
- Не делать Diagram performance work.
- Не менять global shell/header/sidebar.
- Не устанавливать packages.
- Не создавать fake data или fake metrics.
- Не открывать PR, не merge, не deploy.

## Decomposition-first plan

1. До product-code edits Worker 2 фиксирует branch/scope safety.
2. Worker 2 находит минимальные frontend файлы Analytics Hub / Product Actions Registry.
3. Если `ProductActionsRegistryPanel` или связанные файлы крупные, сначала выделяет небольшие subcomponents внутри registry scope.
4. Реализует IA через существующие data flow и props, без новых API.
5. Сохраняет empty/populated states с одинаковой структурой.
6. Делает row expansion только если можно использовать существующие row fields; иначе документирует extension point.
7. Обновляет version/build-info row по локальному паттерну проекта.
8. Пишет русский отчет и marker.

## Worker split

### Agent 2 / Worker - implementation lane

Независимый scope:
- frontend-only bounded IA/UI refactor;
- Analytics Hub entry into Product Actions Registry;
- Product Actions Registry page hierarchy;
- compact scope/metrics/filter/action placement;
- AI controls in primary action/filter area;
- table-first main content;
- sources as secondary section;
- empty scope structure visible;
- expandable row/detail pattern if feasible;
- version row update;
- Russian reports;
- marker `WORKER_2_DONE`.

Blocked marker: `EXEC_PART_1_BLOCKED.md`.

### Agent 3 / Worker - independent UX/spec/runtime checklist lane

Независимый scope:
- превратить master plan и feedback в точный UX acceptance checklist;
- описать expected runtime states;
- зафиксировать no-fake-data rules;
- зафиксировать branch/scope safety checklist;
- подготовить Agent 4 runtime review checklist;
- Russian reports;
- marker `WORKER_3_DONE`.

Agent 3 не выполняет implementation validation и не зависит от implementation lane output.

Blocked marker: `EXEC_PART_2_BLOCKED.md`.

## Agent 4 gates

Agent 4 ставит `REVIEW_PASS` только если:
- есть `WORKER_2_DONE` и `WORKER_3_DONE`;
- свежий runtime `http://clearvestnic.ru:5180` реально отдает новую сборку;
- version/build-info соответствует source HEAD/contour;
- Analytics Hub открывается и ведет в `Реестр действий`;
- Product Actions Registry имеет новую читаемую IA;
- empty workspace scope показывает структуру, а не пустой провал;
- populated project scope работает без fake data;
- AI controls находятся до таблицы/in primary area;
- sources clearly secondary;
- metrics compact;
- row/detail behavior проверен, если реализован;
- console/network clean;
- navigation/viewing не вызывает unsafe PUT/PATCH/DELETE;
- backend/schema/BPMN/RAG не менялись;
- branch/scope report присутствует.

## Runtime validation plan

- Проверить source/runtime truth перед review.
- Проверить `curl -I http://clearvestnic.ru:5180` с HTTP 200 и no-cache headers.
- Открыть fresh browser context с cache-busting query.
- Проверить Analytics Hub cards: `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
- Проверить direct Product Actions Registry route.
- Проверить empty workspace scope.
- Проверить populated project scope на существующих данных.
- Проверить primary filters/actions/AI area до таблицы.
- Проверить exports как compact utilities.
- Проверить secondary `Источники данных`.
- Проверить console errors и unsafe mutation requests.
- Сохранить screenshots/runtime evidence в contour reports.

## Branch hygiene guard

Текущий checkout dirty и не является безопасной merge-ready базой для product implementation. Worker 2 обязан:
- начать с clean branch/worktree от `origin/main`, или
- приложить доказательство, почему текущий checkout безопасен для bounded edits.

Если есть unrelated changes в touched files и их нельзя безопасно изолировать, Worker 2 должен создать `EXEC_PART_1_BLOCKED.md`, а не смешивать контуры.

Worker 3 тоже фиксирует branch/scope checklist, но не пишет product code.

## Required outputs

- `PLAN.md`
- `WORKER_2_PROMPT.md`
- `WORKER_3_PROMPT.md`
- `EXECUTOR_PART_1_PROMPT.md`
- `EXECUTOR_PART_2_PROMPT.md`
- `REVIEWER_PROMPT.md`
- `RAG_PREFLIGHT_PLANNER.md`
- `RAG_PREFLIGHT_REVIEWER.md`
- `UX_ACCEPTANCE_CHECKLIST.md`
- `RUNTIME_PROOF_CHECKLIST.md`
- `BRANCH_SCOPE_CHECKLIST.md`
- `STATE.json`
- `AGENT_RUN_ID`
- `READY_FOR_EXECUTION`
