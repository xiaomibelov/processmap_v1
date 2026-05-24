# feature/process-analytics-hub-and-registry-navigation-v1

> **Роль:** Agent 1 / Planner  
> **Контур:** `feature/process-analytics-hub-and-registry-navigation-v1`  
> **Дата:** 2026-05-17  
> **Статус:** READY_FOR_EXECUTION  
> **Run ID:** 20260517T084454Z-64313  
> **Replan:** Да — исправлена ошибка зависимости Worker 3 от Worker 2.

---

## GSD Discipline

### Выполненные команды
```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*' 2>/dev/null | sort | head -50 || true
```

### Результаты
- `gsd`: `/opt/processmap-test/bin/gsd` — найден
- `gsd-sdk`: `/opt/processmap-test/bin/gsd-sdk` — найден
- `PROCESSMAP_GSD_WRAPPER_FOUND`
- `CODEX_GSD_TOOLS_FOUND`
- GSD skills: 85 директорий в `/root/.codex/skills/`
- **GSD режим:** FULL (GSD_PROCESSMAP_WRAPPER_PLANNING)

### Подтверждения
- [x] Никакая имплементация НЕ выполнялась.
- [x] Продуктовые файлы НЕ изменялись.
- [x] Контур ограничен и изолирован.

---

## RAG Preflight

### Команды
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "feature/process-analytics-hub-and-registry-navigation-v1" \
  --area "ProcessMap Analytics Hub Product Actions Registry Properties Registry dashboards navigation UX top-level analytics page 4-agent independent workers" \
  --format md \
  --top-k 12

node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "feature/process-analytics-hub-and-registry-navigation-v1" \
  --query "Analytics Hub review rules Product Actions Registry not top-level Properties Registry placeholder 4-agent workflow independent workers no false worker dependency" \
  --format md \
  --top-k 12
```

### Результаты
- Planner preflight: сохранён в `RAG_PREFLIGHT_PLANNER.md`.
- Reviewer preflight: сохранён в `RAG_PREFLIGHT_REVIEWER.md`.

### Использованные structured facts
- Runtime facts: clearvestnic.ru, 5180, 8088, /opt/processmap-test, fix/lockfile-sync-test.
- Agent rules: no product runtime changes в RAG контурах, RAG read-only, Agent 3 exact scenario.
- Contour facts: предыдущие RAG контуры имеют REVIEW_PASS.
- Decisions: Product Actions durable truth = interview.analysis.product_actions[], no BPMN XML mutation.

### Продуктовое направление пользователя
- **Критически важно:** «Реестр действий» — это НЕ топ-уровневая аналитическая поверхность.
- Нужно создать верхнеуровневый раздел «Аналитика».
- Внутри «Аналитики» пользователь видит модули: «Реестр действий», «Реестр свойств», «Дашборды», будущие источники данных.

### Принятый контекст
- `uiux/product-actions-registry-workspace-ux-redesign-v1` — registry UI уже переработан, но остаётся standalone top-level страницей.
- `uiux/product-actions-registry-ia-layout-rework-v2` — предыдущая переработка макета registry.
- Существующая модель маршрутизации (`processMapRouteModel.js`) поддерживает расширение новыми surface-параметрами.

### Игнорируемый/устаревший контекст
- Любые предложения сделать registry table полной переработкой — вне скоупа.
- Любые предложения добавить backend entities для Properties Registry — запрещены.
- Диаграмма / performance контуры — не пересекаются.

### Как RAG изменил план
- Подтвердил, что registry уже существует и функционирует — нужен только Hub-обёртка и навигация.
- Подтвердил, что route model можно расширить безопасно.
- Указал на user rejections (version marker на canvas, synthetic tests) — напоминание не допустить аналогичных ошибок.

---

## Source / Runtime Truth

| Поле | Значение |
|------|----------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `date -Is` | `2026-05-17T08:45:51+00:00` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --name-only` | 17 pre-existing frontend файлов (из других контуров) + новые файлы Analytics Hub |
| `git diff --stat` | 17 файлов, +469/-96 строк |
| `curl -I :5180` | HTTP/1.1 200 OK |
| `curl -s :8088/health` | `{"ok":true,"status":"ok",...}` |
| `build-info.json` | branch=fix/lockfile-sync-test, sha=5b20bc2, timestamp=2026-05-16T23:12:44Z, contourId=fix/diagram-interaction-mode-visual-regression-v1, dirty=true |

**Дивергенция:** HEAD опережает origin/main. Это pre-existing состояние из предыдущих контуров. Новый contour не должен усугублять дивергенцию за пределами bounded frontend-изменений.

---

## Replan Reason

Предыдущий план (Run ID: 20260517T010715Z-47422) содержал архитектурную ошибку:
- Worker 3 получил зависимую задачу: «Validate the Analytics Hub implementation from Worker 2.»
- Worker 3 был вынужден ждать WORKER_2_DONE.
- Создан глобальный EXEC_BLOCKED.md, блокирующий запуск Worker 3.
- Валидация реализации была отдана Agent 3 вместо Agent 4.

Исправленный план:
- Worker 2 и Worker 3 работают параллельно и независимо.
- Worker 3 инспектирует исходный код продукта напрямую, а не через отчёты Worker 2.
- Только Agent 4 выполняет финальную валидацию после обоих маркеров.
- Глобальный EXEC_BLOCKED.md объявлен устаревшим; используются part-specific маркеры.

---

## Product Direction

### Текущая проблема UX
- Страница «Реестр действий с продуктом» воспринималась как единственная top-level аналитическая поверхность.
- Пользователь не имел верхнеуровневого раздела «Аналитика», который объяснял бы, куда он попадает.
- «Реестр действий» — только один из модулей аналитики. Он не должен быть root-страницей.
- Нет места для будущих модулей: «Реестр свойств», «Дашборды», «Экспорт».
- Навигация запутана: кнопки «Проекты» остаются активными на registry-экране.

### Целевой Analytics Hub
- Новый top-level surface: **«Аналитика»**.
- Пользователь входит в «Аналитику» из основного workspace.
- Внутри видит:
  1. Заголовок и описание.
  2. Сводные dashboard-карточки (placeholders).
  3. Модульные карточки:
     - **«Реестр действий»** — CTA «Открыть», ведёт в существующий registry.
     - **«Реестр свойств»** — placeholder, статус «Скоро».
     - **«Дашборды»** — placeholder, статус «Скоро».
     - **«Экспорт»** — future placeholder.
- Чёткая кнопка закрытия/возврата. Пользователь не попадает в ловушку.
- Существующий Product Actions Registry остаётся доступным, но как вложенный модуль.

---

## Current UX Problem

1. **Identity crisis** — Реестр действий воспринимается как единственная аналитическая страница.
2. **Navigation confusion** — нет промежуточного Hub-уровня между workspace и registry.
3. **Missing modules** — нет места для Properties Registry, Dashboards, Export.
4. **User trap risk** — пользователь может не понять, как вернуться из registry в общий контекст.

---

## Target Analytics Hub

- **URL:** `?surface=analytics`
- **Title:** «Аналитика»
- **Description:** «Сводная аналитика по процессам, действиям, свойствам и источникам данных.»
- **Summary cards:** Действия, Свойства, Процессы, Неполные данные (placeholders, без фейковых чисел).
- **Module cards:** Реестр действий (CTA «Открыть»), Реестр свойств (Скоро), Дашборды (Скоро), Экспорт (В разработке).
- **Close/back:** кнопка «Закрыть» или «×», возврат в workspace/project/session.
- **Registry nesting:** открытие registry из Hub, закрытие возвращает в Hub (через `return_to=analytics`).

---

## 4-Agent Workflow Contract

```
Agent 1 / Planner
  ↓
Agent 2 / Worker (Work Package A)  +  Agent 3 / Worker (Work Package B)
  ↓
Agent 4 / Reviewer
```

- **Agent 2** — implementation lane. Независим.
- **Agent 3** — independent UX/data-safety lane. Независим. Не ждёт Agent 2.
- **Agent 4** — final validation. Ждёт оба маркера. Единственный, кто может валидировать реализацию Worker 2.

**Запрещено:**
- Worker 3 ждёт WORKER_2_DONE.
- Worker 3 валидирует реализацию Worker 2.
- Worker 3 создаёт глобальный EXEC_BLOCKED.md.
- Любой agent, кроме Agent 4, выдаёт REVIEW_PASS.

---

## Independent Worker Split

### Agent 2 / Worker — Work Package A (UI shell / navigation)
- Inspect current routes/navigation/registry source.
- Создать `ProcessAnalyticsHub.jsx` и `ProcessAnalyticsHub.test.mjs`.
- Добавить route helpers в `processMapRouteModel.js`.
- Провести минимальную проводку в `ProcessStage.jsx` для `analyticsHubRoute`.
- Заменить прямые registry-входы в `WorkspaceExplorer.jsx` на analytics-входы.
- Обновить `AppShell.jsx` / `TopBar.jsx` для корректного back/close.
- Добавить module cards, summary placeholders.
- Bump версии в `appVersion.js`.
- Создать WORKER_2_REPORT.md, WORKER_2_DONE.
- **Если blocked:** создать `EXEC_PART_1_BLOCKED.md`.

### Agent 3 / Worker — Work Package B (Independent UX / data-safety)
- Независимо инспектировать текущий Product Actions Registry и Analytics Hub source.
- Создать UX acceptance checklist и data-safety report.
- Проверить, что Analytics Hub не показывает фейковые dashboard-числа.
- Подготовить bounded copy/placeholder rules для «Реестра свойств», «Дашбордов», «Экспорта».
- При необходимости — bounded CSS/UX polish, non-conflicting test fixtures.
- Проверить planned selectors/routes из source map.
- Подготовить runtime validation checklist для Agent 4.
- Создать WORKER_3_REPORT.md, WORKER_3_DONE.
- **Если blocked:** создать `EXEC_PART_2_BLOCKED.md`.

### Agent 4 / Reviewer
- Дождаться WORKER_2_DONE и WORKER_3_DONE.
- Провести GSD discipline и RAG reviewer preflight.
- Прочитать оба worker-отчёта.
- Независимо инспектировать изменённые файлы.
- Собрать билд, открыть 5180.
- Проверить Analytics Hub, module cards, registry navigation, placeholder.
- Проверить версию / build-info.
- Создать REVIEW_PASS или CHANGES_REQUESTED.

---

## Marker Model

| Маркер | Назначение | Кто создаёт |
|--------|-----------|-------------|
| `READY_FOR_EXECUTION` | Планинг готов | Agent 1 |
| `WORKER_2_DONE` | Work Package A завершён | Agent 2 |
| `WORKER_3_DONE` | Work Package B завершён | Agent 3 |
| `EXEC_PART_1_BLOCKED.md` | Блокировка Worker 2 | Agent 2 |
| `EXEC_PART_2_BLOCKED.md` | Блокировка Worker 3 | Agent 3 |
| `REVIEW_PASS` | Ревью пройдено | Agent 4 |
| `CHANGES_REQUESTED` | Требуются изменения | Agent 4 |
| `REVIEW_BLOCKED.md` | Блокировка ревью | Agent 4 |

**Устаревший:** глобальный `EXEC_BLOCKED.md` — не использовать в этом workflow. Существующий `EXEC_BLOCKED.stale-before-worker2-done.20260517T083846Z.md` задокументирован как stale.

---

## Source Map Targets

### Кандидатные файлы

| # | Путь | Роль | Безопасно изменять? |
|---|------|------|---------------------|
| 1 | `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` | Тонкая обёртка registry-страницы | Да |
| 2 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | Основной registry UI | Осторожно — только props и close-логика |
| 3 | `frontend/src/app/processMapRouteModel.js` | URL builders / route readers | Да — добавить `analytics` surface |
| 4 | `frontend/src/components/ProcessStage.jsx` | Оркестратор: registry route state, рендеринг | Осторожно — минимальное добавление analytics route state |
| 5 | `frontend/src/components/AppShell.jsx` | Передаёт props в TopBar | Осторожно — прокинуть analytics route flag |
| 6 | `frontend/src/components/TopBar.jsx` | Back-кнопка, заголовок | Осторожно — скрыть/изменить back-кнопку на analytics |
| 7 | `frontend/src/features/explorer/WorkspaceExplorer.jsx` | Workspace навигатор | Да — заменить прямой registry-вход на analytics-вход |
| 8 | `frontend/src/config/appVersion.js` | Версия и changelog | Да — bump версии |
| 9 | `frontend/src/styles/tailwind.css` | CSS классы | Да — добавить analytics-hub классы |
| 10 | `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` *(новый)* | Analytics Hub компонент | Да — extraction |
| 11 | `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs` *(новый)* | Тесты Hub | Да |

### Границы декомпозиции
- **ProcessStage.jsx** — массивный orchestrator (6800+ строк). Не рефакторить. Только добавить `analyticsHubRoute` state и callbacks по аналогии с `productActionsRegistryRoute`.
- **Analytics Hub** — выделить в отдельный bounded компонент `ProcessAnalyticsHub.jsx`. Не встраивать логику Hub в ProcessStage.
- **Route model** — добавить `ANALYTICS_HUB_SURFACE` и helper-функции в `processMapRouteModel.js`. Не менять существующие registry helpers.

---

## Decomposition-First Plan

1. **Создать `ProcessAnalyticsHub.jsx`** — изолированный компонент Hub-страницы.
   - Title: «Аналитика»
   - Description
   - Summary cards (dashboard placeholders)
   - Module cards: «Реестр действий», «Реестр свойств», «Дашборды», «Экспорт»
   - Close/back button
2. **Создать route helpers** в `processMapRouteModel.js`:
   - `ANALYTICS_HUB_SURFACE = "analytics"`
   - `readAnalyticsHubRoute()`
   - `buildAnalyticsHubUrl()`
   - `buildAnalyticsHubCloseUrl()`
3. **Минимальные изменения в ProcessStage.jsx**:
   - Добавить `analyticsHubRoute` state (аналогично `productActionsRegistryRoute`).
   - Добавить `openAnalyticsHub`, `closeAnalyticsHub` callbacks.
   - Условно рендерить `<ProcessAnalyticsHub>` когда `analyticsHubRoute.active === true`.
   - Передать `onOpenAnalyticsHub` в WorkspaceExplorer.
4. **Изменения в WorkspaceExplorer.jsx**:
   - Заменить кнопку «Реестр действий» в workspace sidebar на «Аналитика».
   - Заменить кнопку «Реестр действий» в project pane на «Аналитика».
   - Callback `onOpenAnalyticsHub` вместо/рядом с `onOpenProductActionsRegistry`.
5. **Изменения в AppShell.jsx / TopBar.jsx**:
   - При active analytics surface: back-кнопка ведёт назад к workspace (или скрыта, если есть явная кнопка закрытия в Hub).
6. **Version bump**:
   - `appVersion.js`: currentVersion → `"v1.0.134"`.
   - Changelog entry: «Создан верхнеуровневый раздел Аналитика. Реестр действий теперь модуль внутри Аналитики.»

---

## UX Requirements

### Landing page Analytics Hub

**Заголовок:** «Аналитика»

**Описание:**
> «Сводная аналитика по процессам, действиям, свойствам и источникам данных.»

**Сводные dashboard-карточки (summary area):**
- «Действия»
- «Свойства»
- «Процессы»
- «Неполные данные»
- Использовать реальные данные, только если они уже доступны безопасно.
- Иначе — нейтральные placeholders без fake чисел.

**Модульные карточки:**

1. **«Реестр действий»**
   - Описание: «Действия с продуктом по процессам, товарам и этапам.»
   - CTA: «Открыть» → переход в существующий `?surface=product-actions-registry`.

2. **«Реестр свойств»**
   - Описание: «Свойства BPMN-элементов и процессных объектов.»
   - Статус: «Скоро» / «В разработке».

3. **«Дашборды»**
   - Описание: «Сводки по заполненности, качеству и источникам данных.»
   - Статус: «Скоро» / placeholder.

4. **«Экспорт»** (опционально)
   - Описание: «Выгрузки CSV/XLSX по выбранным процессам и разделам.»
   - Статус: future placeholder.

### Навигация
- Ясная кнопка закрытия/возврата («×» или «Закрыть» или «← Назад»).
- Если Analytics открыта как panel/overlay — close button видна.
- Если Analytics открыта как route — browser back / workspace navigation работает.
- Не оставлять активными неактуальные top actions («Создать сессию BPMN», «Сохранить сессию») на analytics-экране.

### Визуал
- Карточки с границами, чёткие секции.
- На landing page НЕТ разбросанных фильтров.
- На landing page НЕТ giant table.
- Responsive для desktop (1280px+).

---

## Bounded Implementation Strategy

### Phase 1 — Extraction
- Создать `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`.
- Создать `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs`.

### Phase 2 — Route model extension
- В `processMapRouteModel.js` добавить:
  - `ANALYTICS_HUB_SURFACE = "analytics"`
  - `readAnalyticsHubRoute(locationLike)`
  - `buildAnalyticsHubUrl(routeRaw, options)`
  - `buildAnalyticsHubCloseUrl(routeRaw, options)`

### Phase 3 — Orchestrator wiring (bounded)
- В `ProcessStage.jsx`:
  - Импорт `ProcessAnalyticsHub`.
  - Добавить `analyticsHubRoute` state (useState + useCallback, аналогично `productActionsRegistryRoute`).
  - Добавить `openAnalyticsHub`, `closeAnalyticsHub`.
  - Условный рендер `<ProcessAnalyticsHub>` перед registry и workspace.
  - Передать `onOpenAnalyticsHub` в WorkspaceExplorer.

### Phase 4 — Navigation entry points
- В `WorkspaceExplorer.jsx`:
  - Workspace sidebar: заменить `workspace-product-actions-registry-nav` кнопку на `workspace-analytics-hub-nav` («Аналитика»).
  - Project pane: заменить `project-product-actions-registry` кнопку на analytics-вход.

### Phase 5 — TopBar / AppShell
- `AppShell.jsx`: определить `analyticsHubRouteActive` по URL (`?surface=analytics`).
- `TopBar.jsx`: при active analytics скрыть или деактивировать back-кнопку, если Hub имеет собственный close.

### Phase 6 — Registry close-back to Analytics
- При открытии registry из Analytics Hub — `onClose` registry должен возвращать в Analytics Hub.
- Реализация: добавить query-param `return_to=analytics` при открытии registry из Hub, и учитывать его в close-функции.

### Phase 7 — Version ledger
- `frontend/src/config/appVersion.js`:
  - `currentVersion: "v1.0.134"`
  - Changelog entry с контуром и кратким описанием.

---

## Version / Update Ledger Plan

- **Текущая версия:** `v1.0.133`
- **Следующая версия:** `v1.0.134`
- **Изменения в `appVersion.js`:**
  - Добавить entry в начало `changelog`:
    ```js
    {
      version: "v1.0.134",
      changes: [
        "Создан верхнеуровневый раздел Аналитика (Analytics Hub).",
        "Реестр действий с продуктом теперь доступен как модуль внутри Аналитики.",
        "Добавлен placeholder для будущего Реестра свойств.",
      ],
    }
    ```
- **build-info.json**: генерируется скриптом `scripts/generate-build-info.mjs`, содержит `contourId`. Worker 2 должен убедиться, что `build-info.json` валиден после сборки.
- **Version marker**: должен оставаться вне BPMN canvas (в footer/badge, как сейчас).

---

## Validation Plan

1. **Build проходит:** `npm run build` без ошибок.
2. **Тесты проходят:** `node --test` для нового `ProcessAnalyticsHub.test.mjs` + существующие тесты registry.
3. **Runtime 5180:**
   - `curl -I http://clearvestnic.ru:5180` → HTTP 200.
   - Hub доступен по `?surface=analytics`.
   - Карточка «Реестр действий» ведёт в `?surface=product-actions-registry`.
   - Кнопка закрытия registry возвращает в Hub или workspace.
   - Карточка «Реестр свойств» имеет статус «Скоро».
4. **Console:** нет ошибок при открытии Hub и registry.
5. **No fake data:** dashboard summary cards не показывают выдуманные числа как реальные.
6. **No backend changes:** `git diff --name-only` не содержит `backend/app/`.
7. **Version:** `appVersion.js` содержит `v1.0.134`.

---

## Acceptance Criteria

1. [x] Существует планинг-пак Agent 1.
2. [x] Существует WORKER_2_PROMPT.md и WORKER_3_PROMPT.md.
3. [x] Существует REVIEWER_PROMPT.md.
4. [ ] Agent 2 завершён (WORKER_2_DONE). **УЖЕ ЗАВЕРШЁН.**
5. [ ] Agent 3 завершён (WORKER_3_DONE).
6. [ ] Существует top-level entry «Аналитика».
7. [ ] Существует Analytics Hub landing page.
8. [ ] «Реестр действий» — модуль/карточка внутри Analytics.
9. [ ] «Реестр свойств» placeholder/module существует.
10. [ ] Dashboard/summary area существует без fake чисел.
11. [ ] Существующий Product Actions Registry остаётся reachable.
12. [ ] Приложение больше не трактует registry как единственную top-level analytics страницу.
13. [ ] Close/back/navigation поведение чёткое.
14. [ ] Нет user trap.
15. [ ] Version row инкрементирован.
16. [ ] build-info.json валиден.
17. [ ] Marker не на canvas.
18. [ ] Нет backend/schema изменений.
19. [ ] Нет BPMN XML mutation.
20. [ ] Нет Product Actions durable truth mutation.
21. [ ] Нет RAG runtime изменений.
22. [ ] Нет console errors.
23. [ ] Build/tests проходят.
24. [ ] Runtime proof на 5180 собран.
25. [ ] Документация/отчёты на русском.
26. [ ] Agent prompts на английском.
27. [x] WORKER_3_PROMPT.md не содержит зависимости от Worker 2.
28. [x] REVIEWER_PROMPT.md содержит wait conditions для обоих маркеров.
29. [x] Используются part-specific block markers (EXEC_PART_1_BLOCKED.md, EXEC_PART_2_BLOCKED.md).
30. [x] Глобальный EXEC_BLOCKED.md не используется как активный marker.

**REVIEW_PASS запрещён, если:**
- Только registry страница существует и нет Analytics Hub.
- «Реестр свойств» отсутствует полностью.
- Пользователь не может закрыть/вернуться.
- Показаны fake dashboard данные как реальные.
- Сделаны broad unrelated UI изменения.
- Изменены Product Actions durable truth или backend/schema.
- Worker 3 не выполнил независимую работу.

---

## Non-goals

- Не перерабатывать полностью таблицу Product Actions Registry.
- Не имплементировать полноценный Properties Registry.
- Не создавать новые backend entities.
- Не менять DB schema.
- Не менять Product Actions durable truth.
- Не менять BPMN XML.
- Не менять RAG runtime.
- Не выполнять AG-UI работу.
- Не оптимизировать Diagram performance.
- Не устанавливать новые пакеты.
- Не делать commit/push/PR/deploy.
- Не делать broad router refactor.
- Не показывать fake analytics данные как реальные.

---

## Agent 2 / Worker Plan

### Задачи
1. Прочитать текущий `processMapRouteModel.js`, `ProcessStage.jsx`, `WorkspaceExplorer.jsx`, `AppShell.jsx`, `TopBar.jsx`.
2. Создать `ProcessAnalyticsHub.jsx`:
   - Title «Аналитика».
   - Description.
   - Summary/dashboard placeholders (4 карточки).
   - Module cards: «Реестр действий» (CTA «Открыть»), «Реестр свойств» («Скоро»), «Дашборды» («Скоро»), «Экспорт» (future).
   - Close button («Закрыть» или «×»).
3. Создать `ProcessAnalyticsHub.test.mjs` с базовыми assertions.
4. Расширить `processMapRouteModel.js` функциями для analytics surface.
5. В `ProcessStage.jsx` — минимально добавить analytics route state и conditional render.
6. В `WorkspaceExplorer.jsx` — заменить прямые registry-входы на analytics-входы.
7. Обновить `AppShell.jsx` / `TopBar.jsx` для корректного back/close.
8. Обеспечить registry `onClose` возврат в analytics (если пришли из analytics).
9. Bump `appVersion.js` → `v1.0.134`.
10. Добавить CSS классы для Hub в `tailwind.css` (scoped, не broad refactor).
11. Собрать build, запустить тесты.
12. Создать WORKER_2_REPORT.md, RAG_PREFLIGHT_WORKER_2.md, SOURCE_MAP_WORKER_2.md, ANALYTICS_HUB_IMPLEMENTATION_REPORT.md, NAVIGATION_WIRING_REPORT.md, VERSION_UPDATE_LEDGER_PROOF.md, WORKER_2_VALIDATION_RESULTS.md, WORKER_2_DONE.

**Важно:** Worker 2 УЖЕ ЗАВЕРШЁН в рамках предыдущего запуска. WORKER_2_DONE существует.

---

## Agent 3 / Worker Plan

### Задачи
1. Запустить Worker RAG preflight.
2. **Независимо** инспектировать текущий Product Actions Registry и Analytics Hub source:
   - `ProcessAnalyticsHub.jsx`
   - `ProcessAnalyticsHub.test.mjs`
   - `processMapRouteModel.js`
   - `ProcessStage.jsx`
   - `WorkspaceExplorer.jsx`
   - `AppShell.jsx`, `TopBar.jsx`
   - `appVersion.js`
   - `tailwind.css`
   - `ProductActionsRegistryPanel.jsx`, `ProductActionsRegistryPage.jsx`
3. Создать UX_ACCEPTANCE_CRITERIA_REPORT.md — ожидания от Analytics Hub layout, cards, navigation.
4. Создать PROPERTIES_REGISTRY_PLACEHOLDER_REPORT.md — proof что Properties Registry это чистый placeholder.
5. Создать DATA_SAFETY_REPORT.md — git diff proof, no backend/BPMN/RAG changes.
6. Создать RUNTIME_REVIEW_CHECKLIST_FOR_AGENT4.md — чеклист для финальной валидации Agent 4.
7. При необходимости — bounded CSS/UX polish или non-conflicting test fixtures (только если безопасно).
8. Собрать build, запустить тесты.
9. Создать WORKER_3_REPORT.md, RAG_PREFLIGHT_WORKER_3.md, SOURCE_MAP_WORKER_3.md, WORKER_3_DONE.

**Важно:** Worker 3 НЕ ДОЛЖЕН читать WORKER_2_REPORT.md, ждать WORKER_2_DONE или валидировать реализацию Worker 2.

---

## Agent 4 / Reviewer Plan

### Задачи
1. Дождаться WORKER_2_DONE + WORKER_3_DONE.
2. GSD discipline + RAG reviewer preflight.
3. Прочитать оба worker-отчёта.
4. Независимо инспектировать diff.
5. Собрать билд и запустить тесты.
6. Открыть `http://clearvestnic.ru:5180/app?surface=analytics`.
7. Проверить:
   - [ ] Analytics Hub landing page с title «Аналитика».
   - [ ] Module card «Реестр действий» с CTA «Открыть».
   - [ ] Module card «Реестр свойств» с статусом «Скоро».
   - [ ] Dashboard summary placeholders без fake чисел.
   - [ ] Открытие registry из Hub работает.
   - [ ] Закрытие registry возвращает в Hub или workspace.
   - [ ] Нет console errors.
   - [ ] `appVersion.js` → `v1.0.134`.
   - [ ] `build-info.json` валиден.
   - [ ] Marker не на canvas.
   - [ ] Нет backend/schema изменений.
   - [ ] Worker 3 выполнил независимую работу (нет ложной зависимости от Worker 2).
8. Создать REVIEW_REPORT.md (на русском).
9. Выдать REVIEW_PASS или CHANGES_REQUESTED.

---

## Risks

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| ProcessStage.jsx слишком большой — добавление route state может быть error-prone | Средняя | Среднее | Следовать существующему паттерну `productActionsRegistryRoute` буквально; изменения < 30 строк. |
| WorkspaceExplorer замена registry-входа ломает существующие тесты | Низкая | Среднее | Обновить тесты-ожидания; сохранить `data-testid` contract. |
| Registry close-back to analytics сложен в реализации | Средняя | Низкое | Fallback: close всегда ведёт в workspace, если analytics-return сложен. Это acceptable для v1. |
| CSS конфликты с существующими registry стилями | Низкая | Низкое | Использовать scoped class names (`processAnalyticsHub*`). |
| User ожидает больше, чем placeholder для Properties Registry | Средняя | Низкое | Ясно обозначить «Скоро» в UI и в PLAN.md. |
| Worker 3 может не понять границу «независимой работы» | Низкая | Среднее | Prompt явно запрещает чтение WORKER_2_REPORT.md и валидацию Worker 2. |

---

## Gates

- [x] GSD discipline — FULL
- [x] RAG preflight — выполнен (planner + reviewer)
- [x] Source/runtime truth — зафиксирован
- [x] Bounded scope — определён
- [x] Acceptance criteria — определены
- [x] No product code changes by Agent 1
- [x] WORKER_2_DONE — УЖЕ ЗАВЕРШЁН
- [ ] WORKER_3_DONE — ожидается
- [ ] Agent 4 REVIEW_PASS — ожидается
