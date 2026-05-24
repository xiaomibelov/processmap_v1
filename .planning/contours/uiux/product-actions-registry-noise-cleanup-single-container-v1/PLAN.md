# PLAN — Реестр действий с продуктом: единый контейнер и зачистка визуального шума

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- branch: `fix/lockfile-sync-test` (текущий чекаут — грязный; см. `BRANCH_SCOPE_CHECKLIST.md`)
- main branch для PR (далее, не сейчас): `main`

## 1. Источник дизайна

UX/UI-спецификация из пользовательского задания (разделы 1–18). Это единственный источник дизайн-правды. Формула:

> **Один контейнер. Один разделитель. Типографика вместо декора.**
> Без градиентов, без dotted-границ, без внутренних теней, без цветных карточек метрик. AI-фиолетовый — только для AI. Зелёный/оранжевый — только для статус-бейджей и warning-семантики.

## 2. Правило сохранения «Аналитики»

- Раздел верхнего уровня **«Аналитика» СОХРАНЯЕТСЯ**.
- «Реестр действий» — **внутренний модуль/страница внутри Аналитики**.
- Корректная IA: `Аналитика → Реестр действий | Реестр свойств | Дашборды`.
- Категорически нельзя удалять Analytics, обходить Analytics, заменять Analytics на «Реестр действий», или переподнимать «Реестр» на верхний уровень.

## 3. Текущая user-visible проблема

Страница «Реестр действий с продуктом» сейчас выглядит дёшево и зашумлённо:

- много несвязанных визуальных стилей (метрики-карточки, баннеры, AI-плашки);
- слишком много «голосов»: gradient-фон, цветные плашки, dotted, inner shadows;
- метрики, фильтры, AI, warning, sessions, таблица не воспринимаются как одна система;
- таблица не выглядит как строгий рабочий инструмент;
- глаз прыгает между блоками; нет единой сетки и единого ритма.

## 4. Полный визуальный спек (сводка из задания)

### 4.1 Палитра (target visual system)

- Фон страницы — `#F3F4F6`. Основной контейнер — `#FFFFFF`. Граница — `#E5E7EB`. Внутренние разделители — `#F3F4F6`.
- Текст: primary `#111827`, secondary `#6B7280`, tertiary `#9CA3AF`.
- Badge «Полная»: bg `#ECFDF5`, text `#10B981`. Badge «Неполная»: bg `#FFFBEB`, text `#F59E0B`.
- AI: bg `#7C3AED`, text `#FFFFFF`. Warning icon `#F59E0B`, warning text `#B45309`.
- Row hover `#FAFAFA`.

### 4.2 Глобальные запреты

Без градиентов · без внутренних теней · без цветных подложек метрик · без dotted-границ · без border-left/right цветных полос · без карточек в карточках · без фейковых данных · без stagger-анимаций · без широкого рефакторинга · без правок durable truth.

### 4.3 Структура страницы (порядок обязателен)

1. Header (заголовок + подзаголовок + CSV/XLSX + «Вернуться», border-bottom `#E5E7EB`).
2. Scope tabs (Workspace | Проект | Сессия) — active underline `#7C3AED` 2px.
3. Gap 16px.
4. **Один белый контейнер** (border-radius 12px, border `#E5E7EB`, shadow `0 1px 3px rgba(0,0,0,0.06)`, padding 0; всё ниже — внутри, разделитель `1px solid #F3F4F6`).

Внутри контейнера, в указанном порядке:
1) Workspace scope (collapsible, default collapsed); 2) Sessions workspace; 3) Metrics (одной текстовой строкой); 4) Filters (одной компактной строкой); 5) Warning row (без жёлтого баннера); 6) AI suggestions (без подложки/градиента); 7) Registry table (primary content).

### 4.4 Header

`Реестр действий с продуктом` 18/700 `#111827`. Subtitle 13/400 `#6B7280`, margin-top 4px. «Вернуться» — компактная ссылка 13/`#6B7280`, hover `#374151`. CSV/XLSX — outline 32px, border `#D1D5DB`, **только в header, без дублей**.

### 4.5 Scope tabs

13/500. Inactive `#9CA3AF`, active `#111827` + underline 2px `#7C3AED`. Без pill-стиля, без dotted, без grey-карточек.

### 4.6 Workspace scope

Collapsible, default collapsed. Свёрнутая строка: chevron + «Workspace scope · 2 сессии, 152 строки» (или реальные значения), 13/500/`#374151`. Раскрытие по клику, chevron меняет состояние.

### 4.7 Sessions workspace

Не должна выглядеть как полная таблица. Header row: слева «Сессии workspace», справа «Всего: 2, без действий: 1» (цвет `#9CA3AF`). Строки — compact flex, шрифт 12–13px. Каждая строка: checkbox 14px, project/session short ID, UUID, имя проекта, путь, кол-во действий, draft-статус, дата, кнопка «Открыть проект» outline и кнопка «Открыть сессию» с фоном `#7C3AED`.

### 4.8 Metrics

Одна текстовая строка: `2 сессий  152 строк  149 полных  3 неполных  152 после фильтров`. Flex, gap 32px, **без подложек, без карточек, без разделителей между метриками**. Число 20/700/`#111827`; «неполных» — `#F59E0B`. Лейбл 11/500 uppercase `#9CA3AF`, справа от числа с gap 4px. «После фильтров» — если равно всему, не доминирует.

### 4.9 Filters

Одна компактная строка: Группа · Товар · Тип · Этап · Категория · Роль · Полнота. Селектор: min-width 110px, height 34px, border `#E5E7EB`, radius 6px, шрифт 13px, стрелка 12px `#9CA3AF`, gap 8px. «Сбросить фильтры» — text link 13/500 `#6B7280`, underline на hover, margin-left 16px. Helper: «Фильтры применяются к загруженным строкам.» 12/`#9CA3AF`.

### 4.10 Warning row

**Не баннер, а строка**. Запрещено: жёлтая подложка, бордер, card-стиль. Иконка 14/`#F59E0B`, текст 13/`#B45309`, справа линк «Показать только неполные» 13/500/`#7C3AED`. Flex, align-items center, justify-between.

### 4.11 AI suggestions

Одна строка без градиента и подложки. Слева label «AI-предложения» 12/600 uppercase `#9CA3AF` letter-spacing 0.05em + chips «Все видимые», «Без действий», «Неполные» (inactive `#F3F4F6`/`#6B7280`, active `#EDE9FE`/`#5B21B6`, radius 16, height 28, padding 4/12, 12px). Справа кнопка `AI: предложить действия` (bg `#7C3AED`, white, radius 8, height 32, 13px) + счётчик «Выбрано для AI: 0 / 10» 13/`#9CA3AF` (при >0 — `#7C3AED`). AI-контролы остаются в primary section.

### 4.12 Registry table

Primary content. Без checkbox-колонки (если AI-выбор уже идёт через chips/scope). Header: bg `#FAFAFA`, border-bottom `#E5E7EB`, 11/600 uppercase `#6B7280` letter-spacing 0.05em, padding 10/24. Колонки: **ПРОДУКТ 20% · ДЕЙСТВИЕ 25% · ПРОЦЕСС / ШАГ 35% · СТАТУС 20% (right)**. Row padding 12/24, border-bottom `#F3F4F6`, hover `#FAFAFA` 0.15s. Product: chevron + name 14/500 `#111827` + subtitle 12/`#6B7280`. Action: title 14/500 + inline tags (`#F3F4F6`/`#4B5563`, highlight `#EDE9FE`/`#5B21B6`, radius 4, padding 1/6, 11px). Process: name 14/500 + BPMN code 12/`#9CA3AF` (subdued). Status: right-aligned badge только зелёный/оранжевый + subtitle 12/`#6B7280`. Раскрытие строки: chevron поворачивается, max-height transition, 4 колонки read-only: ID · BPMN · Сессия · Дата.

### 4.13 Ритм отступов · Анимации · Данные

- 24px горизонтальный / 12px вертикальный padding секций · разделители `1px solid #F3F4F6` на всю ширину · 16px между tabs и контейнером.
- Разрешено: row hover 0.15s, button hover 0.2s, chevron rotation, max-height row expansion. Запрещено: stagger, marketing entrance, анимированные градиенты.
- Только реальные данные; пустое состояние, если данных нет; никаких фейковых метрик/свойств.

## 5. Implementation boundaries (целевые файлы)

Реальные файлы (из инспекции репо):

- `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` — целевая страница.
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` — внутренний контейнер.
- `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` — **СОХРАНИТЬ как есть** (только Analytics-shell).
- `frontend/src/components/process/analysis/registry/ProductActionsRegistryHeader.jsx`
- `frontend/src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx`
- `frontend/src/components/process/analysis/registry/ProductActionsRegistryMetrics.jsx`
- `frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx`
- `frontend/src/components/process/analysis/registry/ProductActionsRegistryPagination.jsx`
- `frontend/src/components/process/analysis/registry/index.js`
- Связанные CSS: `frontend/src/styles/*` (только локальные правила для реестра; запрещено трогать AppShell-CSS, BPMN-стили и т. п.).
- `frontend/src/config/appVersion.js` — bump патч-версии.

Стек — **JSX + обычный CSS**. TS/Tailwind/shadcn/lucide в этих файлах не используется → **не вводить**. Спец-классы из задания (`src/components/Header.tsx`, `MainCard.tsx`) — только дизайн-референс, не путь к созданию.

## 6. Strict non-goals

- Не удалять Analytics Hub, не обходить его, не повышать «Реестр действий» на верхний уровень.
- Не редизайнить глобальный shell, header, sidebar, Analytics Hub, «Реестр свойств», дашборды.
- Не править backend, схему, BPMN XML, Product Actions durable truth, RAG runtime, AI-логику (кроме визуального размещения).
- Не ставить пакеты, не мигрировать стек, не добавлять фейковые данные, не делать merge/PR/deploy.

## 7. Decomposition-first rule

- Worker 2 и Worker 3 запускаются **параллельно**.
- Worker 3 не валидирует Worker 2 и не ждёт `WORKER_2_DONE`.
- Merge/финализация и валидация — у Agent 4 (Reviewer).
- Если контур невозможно разделить независимо — пишется `EXEC_BLOCKED.md`. На текущий момент он разделим.

## 8. Worker split

### Worker 2 / Implementation lane
Реализует ограниченный визуальный рефактор страницы согласно спеку. Реальные файлы — см. п. 5. Сохраняет Analytics Hub, поток данных, экспорты, empty state, AI-семантику. Bumps version row. Пишет отчёты на русском. Создаёт `WORKER_2_DONE`. Полный prompt: `EXECUTOR_PART_1_PROMPT.md` (=`WORKER_2_PROMPT.md`).

### Worker 3 / UX/spec/checklist lane (независимая)
Конвертирует спек в runtime acceptance criteria, forbidden patterns, и готовит Agent 4 review checklist. Не ждёт Worker 2. Создаёт `WORKER_3_DONE`. Полный prompt: `EXECUTOR_PART_2_PROMPT.md` (=`WORKER_3_PROMPT.md`).

## 9. Agent 4 gates

- Ждёт `WORKER_2_DONE` и `WORKER_3_DONE`.
- Fresh runtime proof на `http://clearvestnic.ru:5180/?cb=<timestamp>` с no-cache.
- Проверка версии/build-info.
- Analytics Hub существует и доступен.
- Открыть «Реестр действий с продуктом», проверить все пункты `RUNTIME_PROOF_CHECKLIST.md`.
- REVIEW_PASS возможен только при прохождении полного визуального чек-листа и отсутствии запрещённых паттернов.
- REVIEW_PASS невозможен при удалении Analytics, наличии metric cards, жёлтого warning-баннера, градиента в AI, дублей экспорта, фейковых данных или если проверены только source/тесты.

## 10. Branch hygiene guard

Текущий чекаут `fix/lockfile-sync-test` — грязный (много M-файлов из других контуров). Worker 2 обязан:

- либо взять чистый worktree/ветку от `origin/main` и применять только bounded registry-правки;
- либо явно задокументировать, почему текущий чекаут безопасен и какие конкретно изменения — registry-only.

Детали — в `BRANCH_SCOPE_CHECKLIST.md`. Тихо «доливать» правки в грязное дерево запрещено.

## 11. Артефакты планирования

- PLAN.md (этот файл)
- EXECUTOR_PART_1_PROMPT.md / WORKER_2_PROMPT.md
- EXECUTOR_PART_2_PROMPT.md / WORKER_3_PROMPT.md
- REVIEWER_PROMPT.md
- RAG_PREFLIGHT_PLANNER.md / RAG_PREFLIGHT_REVIEWER.md
- OBSIDIAN_CONTEXT_USED.md / GSD_CONTEXT_USED.md
- UX_SPEC_IMPLEMENTATION_MAP.md
- VISUAL_NOISE_REDUCTION_CHECKLIST.md
- COMPONENT_MAPPING_REQUIREMENTS.md
- RUNTIME_PROOF_CHECKLIST.md
- BRANCH_SCOPE_CHECKLIST.md
- STATE.json
- AGENT_RUN_ID (= `20260518T164643Z-83747`)
- READY_FOR_EXECUTION
