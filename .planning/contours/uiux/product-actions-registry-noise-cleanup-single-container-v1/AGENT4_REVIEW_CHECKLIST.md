# Agent 4 / Reviewer — единый review checklist

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- предназначение: чек-лист готов к копированию в `REVIEW_REPORT.md`. Все пункты — `- [ ]` для отметки PASS/FAIL.

> Reviewer открывает `http://clearvestnic.ru:5180/?cb=<timestamp>` со свежим контекстом, выполняет блоки A–J по порядку. Несоответствие любому из пунктов A–I → CHANGES_REQUESTED.

## A. Pre-runtime gates (из RUNTIME_PROOF_CHECKLIST.md §A)

- [ ] `WORKER_2_DONE` существует и непустой.
- [ ] `WORKER_3_DONE` существует и непустой.
- [ ] `RAG_PREFLIGHT_REVIEWER.md` присутствует.
- [ ] Reviewer выполнил собственный RAG preflight на свою роль.

## B. Runtime smoke

```bash
TS=$(date +%s)
curl -sI "http://clearvestnic.ru:5180/?cb=${TS}" | head -20
```

- [ ] HTTP 200.
- [ ] `Cache-Control: no-cache` или эквивалентное отсутствие агрессивного кеширования.
- [ ] DOM-метка версии / build-info содержит значение `frontend/src/config/appVersion.js`, инкрементированное относительно предыдущего commit.

## C. Analytics IA preservation (из ANALYTICS_PRESERVATION_RULES.md §1, §4)

- [ ] Раздел верхнего уровня **«Аналитика»** виден в навигации.
- [ ] Внутри Аналитики видны: «Реестр действий», «Реестр свойств», «Дашборды».
- [ ] Переход «Аналитика → Реестр действий с продуктом» работает.
- [ ] Кнопка «Вернуться» возвращает в Analytics Hub.
- [ ] «Реестр действий» не поднят на верхний уровень навигации.
- [ ] `git diff origin/main -- frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx frontend/src/components/AppShell.jsx frontend/src/components/TopBar.jsx frontend/src/features/explorer/WorkspaceExplorer.jsx` пуст или строго bounded.

## D. Page structure (из UX_ACCEPTANCE_CRITERIA_FROM_SPEC.md §1–§3)

- [ ] Header: title 18/700 `#111827`, subtitle 13/`#6B7280`, «Вернуться», CSV/XLSX outline 32px.
- [ ] CSV/XLSX встречаются ровно один раз каждая на странице.
- [ ] Scope tabs: active underline 2px `#7C3AED`, inactive `#9CA3AF`, без pill/dotted/cards.
- [ ] 16px gap между табами и контейнером.
- [ ] Один белый контейнер: radius 12, border `#E5E7EB`, тень `0 1px 3px rgba(0,0,0,0.06)`, padding 0.
- [ ] Внутренние секции разделены `1px solid #F3F4F6` full-width.

## E. Sections compliance (из UX_ACCEPTANCE_CRITERIA_FROM_SPEC.md §4–§11)

### E.1 Workspace scope

- [ ] Default collapsed; chevron rotates; текст `Workspace scope · N сессий, M строк`.

### E.2 Sessions workspace

- [ ] Компактный flex-список (не таблица); кнопка «Открыть сессию» с фоном `#7C3AED`; «Открыть проект» — outline.

### E.3 Metrics

- [ ] Одна текстовая строка, число 20/700 `#111827`, лейбл 11/uppercase `#9CA3AF`, gap 32; без подложек/карточек.
- [ ] Число «неполных» — `#F59E0B` (при значении > 0).

### E.4 Filters (из AI_AND_FILTER_EXPECTATIONS.md §B)

- [ ] Одна компактная строка селекторов 34px, border `#E5E7EB`, radius 6, font 13px.
- [ ] «Сбросить фильтры» — text-link `#6B7280`, без рамки/фона; underline на hover.
- [ ] Helper-text `Фильтры применяются к загруженным строкам.` 12/`#9CA3AF`.

### E.5 Warning row

- [ ] Иконка `#F59E0B`, текст `#B45309`, линк `#7C3AED`. Без жёлтой подложки/border.

### E.6 AI suggestions (из AI_AND_FILTER_EXPECTATIONS.md §A)

- [ ] Label + chips + кнопка `#7C3AED` + счётчик. Без gradient/подложки.
- [ ] Chips inactive `#F3F4F6`/`#6B7280`, active `#EDE9FE`/`#5B21B6`, radius 16, height 28.
- [ ] Кнопка `AI: предложить действия` — единственный `#7C3AED` фон в секции.
- [ ] Счётчик: `0` — `#9CA3AF`; `>0` — `#7C3AED`.

### E.7 Registry table (из TABLE_VISUAL_EXPECTATIONS.md)

- [ ] Header `#FAFAFA` 11/600 uppercase `#6B7280` letter-spacing 0.05em padding 10/24.
- [ ] Колонки 20/25/35/20; СТАТУС right-aligned.
- [ ] Hover row `#FAFAFA` transition 0.15s.
- [ ] Badge только зелёный `#ECFDF5/#10B981` или оранжевый `#FFFBEB/#F59E0B`.
- [ ] BPMN code subdued `12px/#9CA3AF`.
- [ ] Inline-tags default `#F3F4F6/#4B5563`, highlight `#EDE9FE/#5B21B6`, radius 4.
- [ ] Нет колонки checkbox.

### E.8 Row expansion

- [ ] Chevron поворачивается; max-height transition; ровно 4 read-only поля: ID · BPMN · Сессия · Дата.

## F. Forbidden patterns runtime (из FORBIDDEN_VISUAL_PATTERNS.md F1–F16)

- [ ] DevTools: нет `linear-gradient`/`radial-gradient` в скоупе реестра.
- [ ] Нет `border-style: dotted|dashed`.
- [ ] Нет `box-shadow` внутри контента (исключение — внешняя тень primary-контейнера).
- [ ] Нет цветных подложек у metric-блоков.
- [ ] Нет цветных `border-left`/`border-right` декоративных полос.
- [ ] Нет card-in-card.
- [ ] Нет жёлтой подложки/border у warning.
- [ ] Нет gradient/цветной подложки у AI-row (кроме самой кнопки `#7C3AED`).
- [ ] Нет дубликатов CSV/XLSX вне header.
- [ ] Нет stagger / marketing-style анимаций.
- [ ] Нет pill/dotted/grey-карточек у табов.
- [ ] Нет колонки checkbox в таблице.
- [ ] Нет цветов вне согласованной палитры.
- [ ] Нет фейковых/demo-данных в production-рендере.
- [ ] Нет правок Analytics Hub / обхода Аналитики.
- [ ] Нет inline-`style` с запрещёнными значениями.

Команды (Reviewer):

```bash
rg -n "linear-gradient|radial-gradient" frontend/src/components/process/analysis frontend/src/styles
rg -n "border-style:\s*(dotted|dashed)" frontend/src/components/process/analysis frontend/src/styles
rg -n "box-shadow" frontend/src/components/process/analysis frontend/src/styles | grep -v '0 1px 3px rgba(0, *0, *0, *0\.06)'
rg -n "(mock|sample|demo|fake)Data|FAKE_|DEMO_|SAMPLE_" frontend/src/components/process/analysis
rg -no "#[0-9A-Fa-f]{6}" frontend/src/components/process/analysis/registry frontend/src/styles | sort -u
```

## G. Empty / populated state (из EMPTY_AND_POPULATED_SCOPE_EXPECTATIONS.md)

### G.1 Workspace scope

- [ ] Populated: реальные числа в Metrics, реальные сессии в Sessions workspace, реальные строки таблицы.
- [ ] Empty: `0`-метрики, пустые Sessions workspace без demo, таблица — корректное empty state, warning-row скрыт.

### G.2 Проект scope

- [ ] Populated: данные ограничены проектом; фильтры применимы.
- [ ] Empty: `0`-метрики, пустая таблица, warning скрыт, AI-кнопка нейтральна/disabled.

### G.3 Сессия scope

- [ ] Populated: данные сессии; раскрытие строк показывает 4 read-only поля.
- [ ] Empty: `0`-метрики, пустая таблица.

## H. Data safety (из NO_FAKE_DATA_AND_SCOPE_SAFETY.md)

- [ ] В DevTools Network при просмотре/навигации/раскрытии/смене фильтров — нет `PUT`/`PATCH`/`DELETE`.
- [ ] В консоли браузера нет ошибок при навигации, раскрытии, переключении scope, reset фильтров.
- [ ] BPMN XML / Product Actions / backend / schema / RAG / AI-логика не изменялись по diff.
- [ ] `package.json` / `package-lock.json` без новых пакетов.
- [ ] Глобальный shell (AppShell, TopBar, WorkspaceExplorer, ProcessStage, BpmnStage, InterviewStage) и BPMN/dark-theme/legacy CSS без правок.

## I. Version row

- [ ] DOM-метка версии видна и не перекрывает контент.
- [ ] Значение версии инкрементировано (patch-bump) относительно предыдущего commit.
- [ ] `frontend/src/config/appVersion.js` содержит обновлённое значение.

## J. Final verdict

- [ ] **REVIEW_PASS** — все блоки A–I пройдены, runtime-снимки сохранены.
- [ ] **CHANGES_REQUESTED** — любой пункт A–I не выполнен; список расхождений в `REVIEW_REPORT.md`.
- [ ] **BLOCKED** — runtime недоступен или версия не обновлена.

## K. Связанные артефакты Worker 3

- `UX_ACCEPTANCE_CRITERIA_FROM_SPEC.md` — детализация D/E.
- `FORBIDDEN_VISUAL_PATTERNS.md` — детализация F.
- `EMPTY_AND_POPULATED_SCOPE_EXPECTATIONS.md` — детализация G.
- `TABLE_VISUAL_EXPECTATIONS.md` — детализация E.7/E.8.
- `AI_AND_FILTER_EXPECTATIONS.md` — детализация E.4/E.6.
- `ANALYTICS_PRESERVATION_RULES.md` — детализация C.
- `NO_FAKE_DATA_AND_SCOPE_SAFETY.md` — детализация G/H.
- `RUNTIME_PROOF_CHECKLIST.md` — основа A/B/F.
