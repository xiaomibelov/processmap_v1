# PLAN — fix/bpmn-drilldown-ui

## Контур
- **id**: `fix/bpmn-drilldown-ui`
- **type**: `fix` (UI/UX)
- **base**: `origin/fix/sub-process-navigation` (состояние PROD `ec2059a4` + breadcrumb-on-canvas + padding)
- **branch**: `fix/bpmn-drilldown-ui`
- **HEAD**: `7ce7c1d7`
- **workspace**: `/opt/processmap-test`
- **remote**: `git@github.com:xiaomibelov/processmap_v1.git`

## Source / runtime truth
- `pwd`: `/opt/processmap-test`
- `git branch --show-current`: `fix/bpmn-drilldown-ui`
- `git rev-parse HEAD`: `7ce7c1d7`
- `git rev-parse origin/main`: `c97099f3`
- `git status -sb`: чистый воркинг-три, untracked только сторонние контуры/хэндоффы
- `git diff --name-only`: пусто
- `git diff --cached --name-only`: пусто
- PROD стенд: `http://clearvestnic.ru:5177`, текущий served commit `e6127144`

## Проблема
В UI drill-down в BPMN-подпроцессы остались 4 дефекта, которые мешают использованию:

1. **Breadcrumb перекрывает хедер/тулбар.** Плавающая панель `SubprocessBreadcrumbs` внутри `.workspaceMain` не имеет достаточного верхнего отступа и прилипает к зоне кнопок «Сохранить сессию» / «Создать версию BPMN».
2. **Нет индикатора обсуждений на родительской диаграмме.** Если в child-сессии подпроцесса есть открытые обсуждения, на элементе `CallActivity`/`SubProcess` в родительской диаграмме не появляется badge.
3. **Нет loading state при переходе между сабпроцессами.** При клике на `.bjs-drilldown` или кнопку «Назад» в breadcrumb канвас на доли секунды пуст — пользователь не видит, что идёт загрузка.
4. **Нет loading state при открытии сессии.** При первоначальной загрузке BPMN-сессии (прямая ссылка / рефреш / открытие из списка) канвас остаётся серым/пустым, пока importXML не завершится.

## Scope
Только UI-слой (React, CSS, BPMN.io overlays). **Запрещено** трогать:
- логику сохранения BPMN XML,
- API/backend контракты (кроме чтения уже существующих aggregate),
- XML-экспорт/импорт,
- Product Actions, RAG, AG-UI,
- общую навигационную логику сессий.

## План исправлений

### 1. Breadcrumb offset (`frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css`)
- Для `.subprocessBreadcrumbsOnCanvas` зафиксировать `top: 12px; left: 12px` (или `calc(var(--header-height, 0px) + 12px)` если проект использует CSS-переменную).
- Сохранить `pointer-events: none` на обёртке и `pointer-events: auto` на внутренней панели.
- Проверить `z-index`: breadcrumb должен быть выше канваса, но ниже модалок/тултипов (`z-index: 50`).

### 2. Discussion badge на элементах родительской диаграммы
- Добавить хук `useChildSessionDiscussionAggregates(parentSessionId, sessions)`:
  - Из `sessions` фильтровать записи с `parent_session_id === parentSessionId`.
  - Для каждого child sessionId вызывать `useSessionNoteAggregates(childSessionIds)`.
  - Вернуть `Map<elementId_in_parent, aggregate>`.
- Прокинуть `childSessionDiscussionAggregates` в `BpmnStage` через `ProcessStage` из `App.jsx`.
- В `decorManager.js` (или отдельном адаптере `applySubprocessDiscussionDecor`) после `importXML`/`applyFullBpmnDecorSet` добавить overlay для элементов `bpmn:CallActivity`/`bpmn:SubProcess`:
  - Использовать `overlays.add(elementId, { position: { top: -8, right: -8 }, html: badgeNode })`.
  - Badge — компактный чат-бабл с цифрой (`open_notes_count`).
  - Клик по badge передавать в стандартный `emitElementSelection` + открытие обсуждений через существующий `onOpenElementNotes`.
- Убедиться, что badge обновляется при изменении aggregate (invalidation через `processmap:notes-aggregate-changed`).

### 3. Loading state при drill-down / возврате
- В `BpmnStage.jsx` получить `transition` из `useDiagramLoadStateMachine()` (уже импортирован, но сейчас используется только `isReady`).
- При смене `sessionId` / `view` / `nextXml` вызывать `transition("reset")`.
- Непосредственно перед `importXML` в `bpmnRenderRuntimeLifecycle.js` вызывать `transition("import_start")`.
- После успешного `importXML` + `canvas.resized()` + `ensureCanvasVisibleAndFit` вызывать `transition("import_success")`.
- При ошибке импорта — `transition("import_error", { reason })`.
- Оборачивать canvas-контейнер в `DiagramLoadBoundary` (компонент уже существует):
  - skeleton виден в состояниях `initializing` / `importing`,
  - canvas виден в `canvas-ready` / `ready` / `error` / `timeout`.
- Скрывать спиннер только после события готовности диаграммы, а не после навигационного коллбэка.

### 4. Loading state при открытии сессии
- Использовать тот же `DiagramLoadBoundary` + `useDiagramLoadStateMachine`.
- При первом монтировании `BpmnStage` для нового `sessionId` начинать с `transition("reset")`.
- Первый `importXML` переводит машину через `import_start` → `import_success`.
- Убедиться, что `canvas.resized()` вызывается после `importXML`, и только после этого скелетон скрывается.
- Добавить `data-testid="diagram-skeleton"` уже присутствует; добавить `data-testid="bpmn-stage-ready"` на canvas-обёртку для E2E.

## Acceptance criteria
- [ ] `.subprocessBreadcrumbsOnCanvas` имеет `top: 12px` и не перекрывает кнопки хедера/тулбара.
- [ ] На `CallActivity`/`SubProcess` в родительской диаграмме рисуется badge с количеством открытых обсуждений child-сессии.
- [ ] При клике на `.bjs-drilldown` виден спиннер/скелетон до появления child-диаграммы.
- [ ] При клике «Назад» в breadcrumb виден спиннер/скелетон до появления родительской диаграммы.
- [ ] При открытии сессии (cold open) виден спиннер/скелетон до завершения `importXML` и `canvas.resized()`.
- [ ] `node scripts/e2e/check_subprocess_click.mjs` остаётся зелёным.
- [ ] Новый E2E-тест проверяет видимость `diagram-skeleton` во время drill-down.
- [ ] `npm run build` проходит без ошибок.
- [ ] Нет новых PUT `/bpmn` / PATCH `/sessions` из view-режима.

## Риски
- `BpmnStage.jsx` — большой файл; изменения должны быть минимальными и локализованными вокруг `useDiagramLoadStateMachine`.
- Overlay badge требует знания child session IDs; если `sessions` prop не содержит `parent_session_id`, потребуется `view=full` или отдельный запрос.
- Loading state machine уже существует, но не подключена — риск забыть cleanup таймаутов.

## Non-goals
- Не менять API backend.
- Не менять логику сохранения/ревизий.
- Не добавлять глобальную систему уведомлений.
- Не делать broad refactor за пределами drill-down UI.

## Следующий шаг
После review плана — реализация (Agent 2). Без явного approve пользователя: **no merge / no deploy / no PR**.
