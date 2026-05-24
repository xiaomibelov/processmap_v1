# PLAN — uiux/product-actions-registry-polished-table-layout-v1

Контур: `uiux/product-actions-registry-polished-table-layout-v1`  
Run ID: `20260518T101901Z-54062`  
Роль: Agent 1 / Planner  
Статус: `READY_FOR_EXECUTION`

## Источник дизайна

Основной источник этого контура — предоставленная пользователем детальная UX/UI-спецификация для страницы `Реестр действий с продуктом`. Она задает целевую иерархию header, компактный metrics dashboard, группировку фильтров, перестройку AI-блока, мягкий warning banner, table-first структуру, единственное размещение CSV/XLSX в header и более ясный spacing/layout.

Спецификация является UX-источником, но не является source-of-truth по стеку. Исполнители обязаны свериться с фактическим ProcessMap codebase и использовать существующие React/Vite/CSS/Tailwind-паттерны. Запрещены TypeScript migration, shadcn/ui, новые dependencies и backend/schema/RAG/BPMN изменения.

## Пользовательская проблема

Страница Product Actions Registry функционально работает, но пользователь отвергает визуальное качество: текущая компоновка ощущается перегруженной, недостаточно иерархичной и недостаточно table-first. Нужен bounded UI polish без redesign глобальной оболочки ProcessMap.

## Runtime/source truth на старте планирования

- Workspace: `/opt/processmap-test`
- Branch: `fix/lockfile-sync-test`
- HEAD: `5b20bc2d1292f419647238eaf37dac55f9315942`
- `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- Рабочее дерево: dirty, много unrelated modified/untracked files.
- Вывод: planning-only допустим, product-code implementation в этом checkout запрещена без явной изоляции. Worker 2 обязан использовать clean worktree/branch от `origin/main` и применить только bounded registry UI changes либо письменно доказать, почему текущий checkout безопасен.

## GSD/RAG

- GSD найден: `/opt/processmap-test/bin/gsd`.
- `gsd usage` в этом окружении возвращает `Unknown command: usage`; `gsd` без аргументов выводит доступные команды `gsd-tools`.
- Planner RAG preflight выполнен и сохранен в `RAG_PREFLIGHT_PLANNER.md`.
- Reviewer RAG preflight выполнен и сохранен в `RAG_PREFLIGHT_REVIEWER.md`.
- RAG является read-only context layer: нельзя автоматически менять код, durable Product Actions, BPMN XML или RAG runtime по его подсказкам.

## Scope реализации

Worker 2 должен реализовать только bounded UI/UX изменения страницы Product Actions Registry:

- усилить header hierarchy: сильный title `Реестр действий с продуктом`, читаемый secondary subtitle, компактный navigation-like `Вернуться`, CSV/XLSX только в header;
- собрать metrics в компактный dashboard/card, где значения заметны, но не огромные, labels secondary uppercase, `Полных`/`Неполных` имеют тонкую semantic color treatment, `После фильтров` не дублирует total тяжело;
- сгруппировать фильтры: main filters `Группа`, `Товар`, `Тип`, `Этап`, `Категория`; secondary filters `Роль`, `Полнота`, `Сбросить`;
- сделать applied filters визуально заметными, а `Сбросить фильтры` спокойным link/text action;
- перестроить AI block: label `AI-предложения`, secondary toggle chips `Все видимые`, `Без действий`, `Неполные`, primary CTA `AI: предложить действия`, счетчик `Выбрано для AI: 0/10` рядом с CTA secondary;
- оставить AI controls в primary action area, а sources section сделать secondary;
- сделать warning о неполных строках мягким, над таблицей, не похожим на critical system error; добавить `Показать только неполные`, если это безопасно и bounded;
- сделать table главной рабочей зоной: более спокойный header, clear row separation, hover state, consistent badges `Полная`/`Неполная`, компактные tags, менее доминирующий BPMN code;
- добавить checkbox column только если текущая selection model поддерживает это безопасно;
- row expansion/detail делать только если безопасно и bounded; иначе оставить extension point/report;
- улучшить spacing между секциями, убрать ощущение одной серой непрерывной простыни и узкой вставленной панели;
- обновить version row/build marker по существующему локальному паттерну.

## Strict non-goals

- Нет redesign глобального shell/header/sidebar ProcessMap.
- Нет redesign Analytics Hub, кроме сохранения совместимости navigation.
- Нет backend changes.
- Нет schema changes.
- Нет Product Actions durable truth changes.
- Нет BPMN XML mutation.
- Нет RAG runtime changes.
- Нет AI behavior changes, кроме визуального размещения controls.
- Нет package install.
- Нет TypeScript migration.
- Нет shadcn/ui installation.
- Нет fake data или fake metrics.
- Нет broad refactor.
- Нет merge, PR, deploy.

## Decomposition-first rule

Контур разделен на две независимые параллельные lanes:

- Agent 2 / Worker — implementation lane: меняет bounded registry UI, не меняет данные и backend.
- Agent 3 / Worker — UX/spec/checklist lane: превращает UX spec в runtime acceptance checklist и reviewer package, не проверяет implementation lane и не зависит от ее артефактов.

Только Agent 4 / Reviewer имеет право ждать оба worker markers и выполнять финальную runtime validation.

## Worker split

### Agent 2 / Worker

Независимо реализует UI changes в registry-related frontend components/styles. Touch scope должен быть ограничен Product Actions Registry и ближайшими registry style assets, если это действительно необходимо. Данные, API contracts, durable truth и AI behavior сохраняются.

Обязательные отчеты: `WORKER_2_REPORT.md`, `SOURCE_MAP_WORKER_2.md`, `UX_SPEC_IMPLEMENTATION_REPORT.md`, `VISUAL_BEFORE_AFTER_REPORT.md`, `VERSION_UPDATE_LEDGER_PROOF.md`, `WORKER_2_VALIDATION_RESULTS.md`, `WORKER_2_DONE`. При блокировке: `EXEC_PART_1_BLOCKED.md`.

### Agent 3 / Worker

Независимо готовит acceptance criteria и Agent 4 review checklist из UX spec. Описывает populated/empty states, filters, AI controls, warning, table, export controls, sources section, unchanged boundaries и no-fake-data safety.

Обязательные отчеты: `WORKER_3_REPORT.md`, `UX_ACCEPTANCE_CRITERIA_FROM_SPEC.md`, `EMPTY_AND_POPULATED_SCOPE_EXPECTATIONS.md`, `AI_CONTROLS_EXPECTATIONS.md`, `TABLE_VISUAL_EXPECTATIONS.md`, `NO_FAKE_DATA_AND_SCOPE_SAFETY.md`, `AGENT4_REVIEW_CHECKLIST.md`, `WORKER_3_DONE`. При блокировке: `EXEC_PART_2_BLOCKED.md`.

## Agent 4 runtime review gates

Agent 4 выдает `REVIEW_PASS` только после fresh runtime proof на `http://clearvestnic.ru:5180`:

- подтверждено, что runtime реально отдает свежую сборку;
- version/build-info соответствует реализации;
- открыт путь Analytics -> `Реестр действий`;
- проверены header hierarchy, compact metrics dashboard, filter grouping, AI block hierarchy, warning softness, table dominance, status badges, единственное placement CSV/XLSX;
- проверены empty workspace scope и populated project scope;
- нет console errors;
- при viewing/navigation нет unsafe `PUT/PATCH/DELETE`;
- нет backend/schema/BPMN/RAG изменений;
- зафиксированы 5 planes: code, workspace, DB, env/compose, serving mode.

## Branch hygiene guard

Текущий `/opt/processmap-test` dirty и не является безопасным implementation tree. Worker 2 обязан перед любым product-code edit:

1. Зафиксировать `pwd`, remote без раскрытия secrets, `git fetch origin`, branch, HEAD, `origin/main`, `git status -sb`, unstaged/staged diff names.
2. Если checkout не является clean branch/worktree от `origin/main`, создать/использовать clean worktree/branch для этого контура.
3. Если Worker 2 считает текущий checkout безопасным, он обязан документировать доказательство в `BRANCH_HYGIENE_REPORT.md`; иначе создать `EXEC_PART_1_BLOCKED.md`.

## Готовность

Planning pack готов к автоматическому запуску Agent 2 и Agent 3. `AGENT_RUN_ID` записан отдельно и содержит текущий launcher run id.
