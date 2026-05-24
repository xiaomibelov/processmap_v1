# План контура: Analytics Registry Layout Density and Visual System v1

Контур: `uiux/analytics-registry-layout-density-and-visual-system-v1`  
Run ID: `20260518T085529Z-44650`  
Роль: Agent 1 / Planner  
Дата: 2026-05-18

## Source/runtime truth на момент планирования

- `pwd`: `/opt/processmap-test`
- remote: `github.com/xiaomibelov/processmap_v1.git` (credential-bearing URL не дублируется)
- `git fetch origin`: выполнен успешно
- текущая ветка launcher checkout: `fix/lockfile-sync-test`
- launcher `HEAD`: `5b20bc2d1292f419647238eaf37dac55f9315942`
- `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- `git status -sb`: dirty tree, есть tracked product-code изменения и много untracked artifacts
- `git diff --name-only`: содержит frontend изменения, включая `ProductActionsRegistryPanel.jsx`, registry tests, shell/stage files и стили
- `git diff --cached --name-only`: пусто

Вывод: planning-only шаг допустим, но реализация не должна молча добавляться в этот грязный launcher checkout. Worker 2 обязан работать из clean worktree/branch от `origin/main` с bounded frontend diff или явно доказать, почему текущий checkout безопасен именно для visual-only контура.

## Текущий пользовательский feedback

Предыдущий контур технически прошел runtime review, но пользователь отверг визуальный результат: экран работает, но не выглядит как polished product screen. Основные проблемы:

- Analytics Hub и Product Actions Registry слишком узкие внутри большого пустого рабочего пространства.
- Страница выглядит как маленькая центрированная карточка, вставленная в огромный blank canvas.
- Визуальная иерархия слабая: header, scope, metrics, filters и table читаются одинаково серыми.
- Пользователь не может быстро зацепиться за основную рабочую область.
- Таблица Product Actions Registry недостаточно доминирует.
- Карточки Analytics Hub слишком маленькие и изолированные.
- Scope selector `Workspace / Проект / Сессия` функционально присутствует, но визуально слаб.
- Метрики компактные, но не создают полезный dashboard rhythm.
- Глобальный ProcessMap shell/header/sidebar должен остаться неизменным.

## Цель

Сделать Analytics Hub и inner page Product Actions Registry похожими на нативные, отполированные рабочие страницы ProcessMap, а не на маленький embedded panel. Это bounded frontend visual/layout refinement, не новый backend/architecture contour.

## Целевая visual direction

- Лучше использовать доступную ширину workspace: увеличить effective content max-width, убрать narrow-centered ощущение, оставить комфортные side margins.
- Сделать `Аналитика` настоящей landing page: карточки крупнее, плотнее и визуально anchored; `Реестр действий` должен быть primary module, будущие модули остаются secondary.
- Registry должен читаться как последовательность: header/navigation -> scope selector -> compact metrics -> filters + AI/export actions -> warning -> main table -> sources.
- Таблица является главным объектом: более широкий контейнер, ясный header, readable rows, связанная pagination/page size зона.
- Scope selector должен выглядеть как meaningful controls с читаемым selected state, value/subtitle и не как disabled gray placeholders.
- Metrics должны поддерживать страницу: компактные, полезные, с различимыми label/value, но без dominance над таблицей.
- Filters/actions должны оставаться primary area до таблицы; AI controls не переносятся в sources; CSV/XLSX остаются compact utilities; `Вернуться` остается clear navigation.
- Sources section остается вторичной, отделенной от таблицы, без конкуренции за визуальное внимание.

## Strict non-goals

- Не редизайнить global shell/header/sidebar.
- Не менять backend, schema, durable Product Actions truth, BPMN XML, RAG runtime или AI behavior.
- Не делать full Properties Registry implementation.
- Не заниматься Diagram performance.
- Не ставить новые пакеты.
- Не добавлять fake data.
- Не делать merge/PR/deploy.

## Bounded frontend scope

Worker 2 может менять только frontend files, прямо связанные с Analytics Hub / Product Actions Registry и scoped styles. Ожидаемые зоны изменения:

- `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/process/analysis/registry/` если текущая реализация уже вынесена туда
- scoped CSS рядом с этими surface/panel styles или существующий limited frontend style file, если он уже обслуживает эти компоненты
- version row / build marker source, если в проекте есть установленный паттерн version bump для UI-контуров
- focused tests только для сохранения текущих states/contract, если изменения затрагивают classnames/structure

Запрещено трогать shell/sidebar/topbar для визуального эффекта этого контура.

## Worker split

### Agent 2 / Worker: implementation lane

Независимая реализация visual/layout refinement:

- clean branch/worktree hygiene proof до изменений;
- улучшить width, spacing, section hierarchy, cards, table container, scope selector, metrics rhythm;
- сохранить data flow, empty workspace scope, populated project scope, AI controls перед таблицей, sources после pagination/secondary section;
- обновить version row;
- написать отчеты на русском;
- создать `WORKER_2_DONE`;
- при блокировке создать `EXEC_PART_1_BLOCKED.md`.

### Agent 3 / Worker: independent UX checklist lane

Независимая спецификация runtime acceptance criteria:

- перевести screenshot feedback в измеримые runtime criteria;
- описать expected visual states для Analytics Hub, populated project registry, empty workspace registry, scope selector, metrics, filters/actions, table, sources;
- определить, что означает "not a small pasted panel" по content width, empty space, table prominence, section separation и hierarchy;
- подготовить checklist для Agent 4 visual runtime review;
- написать отчеты на русском;
- создать `WORKER_3_DONE`;
- при блокировке создать `EXEC_PART_2_BLOCKED.md`.

Agent 3 не проверяет реализацию implementation lane на parallel этапе. Зависимая интеграционная проверка принадлежит Agent 4 после обоих worker markers.

## Agent 4 gates

`REVIEW_PASS` разрешен только если Agent 4:

- дождался `WORKER_2_DONE` и `WORKER_3_DONE`;
- выполнил fresh source/runtime truth proof;
- подтвердил served runtime на `http://clearvestnic.ru:5180`;
- проверил build/version info и contour id;
- открыл Analytics Hub и Product Actions Registry в actual wide browser viewport;
- доказал, что экран больше не выглядит как narrow centered technical panel;
- подтвердил table-first prominence, clear hierarchy for scope/metrics/filters/sources;
- проверил empty workspace и populated project scopes;
- подтвердил clean console during viewing/navigation;
- подтвердил отсутствие unsafe `PUT/PATCH/DELETE` при navigation/viewing;
- подтвердил отсутствие backend/schema/BPMN/RAG changes.

## Branch hygiene guard

Worker 2 обязан начать с:

1. `pwd`
2. `git remote -v` с редактированием credential-bearing output в отчете
3. `git fetch origin`
4. `git branch --show-current`
5. `git rev-parse HEAD`
6. `git rev-parse origin/main`
7. `git status -sb`
8. `git diff --name-only`
9. `git diff --cached --name-only`

Если checkout dirty и содержит unrelated изменения, Worker 2 должен создать clean worktree/branch от `origin/main` или записать `EXEC_PART_1_BLOCKED.md`. Нельзя расширять текущий dirty tree без доказательства безопасной изоляции.

## Planning validation

- Worker 3 prompt не содержит forbidden dependency phrases.
- Только Agent 4 может ждать оба worker markers.
- Для блокировок используются `EXEC_PART_1_BLOCKED.md` и `EXEC_PART_2_BLOCKED.md`.
- Agent 1 не менял product code.
- `AGENT_RUN_ID` должен содержать ровно `20260518T085529Z-44650`.

