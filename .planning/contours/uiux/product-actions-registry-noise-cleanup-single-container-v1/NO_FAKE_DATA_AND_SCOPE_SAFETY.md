# No-fake-data и scope-safety критерии

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- источник: PLAN.md §4.13, §6; UX_SPEC_IMPLEMENTATION_MAP.md §C.13–C.16; RAG decisions (read-only / Product Actions durable truth).

## 1. No fake data — критерии

### 1.1 Источники данных

- [ ] Все строки таблицы реестра рендерятся из реальных хуков загрузки (state, выборка из существующих API), **не** из hardcoded JS-массивов в JSX.
- [ ] Метрики (`сессии / строки / полные / неполные / после фильтров`) считаются по реальной выборке; **не** константы.
- [ ] Sessions workspace показывает реальные сессии workspace; нет «sample-session», «demo-session», «example-project».
- [ ] AI-предложения, если отображаются, сгенерированы существующим AI-flow, **не** замоканы.

### 1.2 Запрещённые маркеры в коде

- [ ] В скоупе `frontend/src/components/process/analysis/registry/` и `ProductActionsRegistryPage.jsx`/`Panel.jsx` нет идентификаторов: `mockData`, `sampleData`, `demoData`, `fakeData`, `placeholderRows`, `FAKE_*`, `DEMO_*`, `SAMPLE_*`, `__MOCK__`.
- [ ] Нет inline-литералов вида `const rows = [{ name: 'Демо-действие', ...}, ...]` в production-рендере.

Команда:

```bash
rg -n "(mock|sample|demo|fixture|placeholder|fake)Data|FAKE_|DEMO_|SAMPLE_|__MOCK__" \
  frontend/src/components/process/analysis
rg -n "name:\s*['\"](Демо|Sample|Test|Example|Lorem)" \
  frontend/src/components/process/analysis
```

### 1.3 Empty state без подмены

- [ ] При отсутствии данных страница показывает empty-state (текст / нейтральное сообщение), а **не** placeholder-строки таблицы.
- [ ] Метрики при пустом состоянии показывают `0`, а не «1 234»/«—» как заглушку.
- [ ] AI-кнопка при пустом состоянии не подставляет AI-предложения автоматически.

### 1.4 Loading state без подмены

- [ ] Допустим skeleton/индикатор «Загрузка…»; запрещено показывать предзаполненные «фантомные» строки с примерами текста.
- [ ] Skeleton не содержит реалистичные имена продуктов/действий.

## 2. Scope-safety — критерии

### 2.1 Read-only при просмотре

- [ ] Открытие страницы и навигация по табам / раскрытие строк / переключение фильтров **не** вызывают `PUT`/`PATCH`/`DELETE` в DevTools Network.
- [ ] Поведение по сети при просмотре — только `GET` (включая возможные `HEAD`/`OPTIONS` от инфраструктуры).
- [ ] Клик по «Открыть проект» / «Открыть сессию» — навигация (router push), без серверных мутаций до явного действия пользователя в открытой сущности.

Проверка (DevTools Network):

```text
Filter: method:PUT OR method:PATCH OR method:DELETE
В ходе сценария «открыть страницу → переключить scope → раскрыть строку → сменить фильтр → reset → клик AI chip» должно быть 0 совпадений.
```

### 2.2 Не трогаем backend / schema / BPMN / RAG / Product Actions truth

- [ ] В рамках контура **не** изменяются:
  - `backend/**` (любые серверные модули, схема БД, миграции).
  - BPMN XML (`*.bpmn`) и связанные durable-файлы.
  - `interview.analysis.product_actions[]` структура (источник истины Product Actions).
  - RAG runtime: `tools/rag/**` (за исключением запуска read-only preflight).
  - AI-логика принятия решений (только визуальное размещение AI-row в реестре).

Команда (пробег diff):

```bash
git diff origin/main --name-only \
  | rg -v "^frontend/src/components/process/analysis(/registry)?/" \
  | rg -v "^frontend/src/styles/" \
  | rg -v "^frontend/src/config/appVersion\.js$" \
  | rg -v "^\\.planning/contours/uiux/product-actions-registry-noise-cleanup-single-container-v1/"
# Любая выводимая строка — повод для CHANGES_REQUESTED по scope.
```

### 2.3 Глобальный shell — не трогаем

- [ ] `frontend/src/components/AppShell.jsx`, `TopBar.jsx`, `WorkspaceExplorer.jsx`, `ProcessStage.jsx`, `BpmnStage.jsx`, `InterviewStage.jsx` — без правок (или только bounded строки роутинга, если необходимо для Analytics→Registry, и тогда зафиксированы отдельно в `BRANCH_SCOPE_CHECKLIST.md`).
- [ ] Глобальные CSS (BPMN/dark-theme/legacy) — без правок.

Команда:

```bash
git diff origin/main -- \
  frontend/src/components/AppShell.jsx \
  frontend/src/components/TopBar.jsx \
  frontend/src/features/explorer/WorkspaceExplorer.jsx \
  frontend/src/components/ProcessStage.jsx \
  frontend/src/components/process/BpmnStage.jsx \
  frontend/src/components/process/InterviewStage.jsx \
  frontend/src/styles/legacy/legacy_bpmn.css \
  frontend/src/styles/app/02 \
  frontend/src/styles/app/05 \
  frontend/src/styles/app/06-final-structure.css
# Любые правки сверх минимально необходимого — CHANGES_REQUESTED.
```

### 2.4 Никаких новых зависимостей

- [ ] `package.json` / `package-lock.json` не получают новых пакетов.
- [ ] Не вводятся TS / Tailwind / shadcn / lucide-новинки в registry-файлы.

Команда:

```bash
git diff origin/main -- frontend/package.json frontend/package-lock.json
```

### 2.5 Без merge / PR / deploy в рамках контура

- [ ] В рамках контура не выполняются `git push`, `gh pr create`, `git merge`, `npm publish`, deploy-команды.
- [ ] Финализация — у Agent 4 (Reviewer), и далее по явному запросу пользователя.

## 3. Связанные документы

- `FORBIDDEN_VISUAL_PATTERNS.md` F14 (фейковые данные), F15 (обход Analytics).
- `ANALYTICS_PRESERVATION_RULES.md` §3 (DO-NOT-TOUCH файлы).
- `UX_ACCEPTANCE_CRITERIA_FROM_SPEC.md` §12 (empty state), §14 (data safety).
- `RUNTIME_PROOF_CHECKLIST.md` блоки G и H.
