# PLAN — fix/bpmn-drilldown-ui

## Контур
- **id**: `fix/bpmn-drilldown-ui`
- **type**: `fix` (UI/UX)
- **base**: `origin/fix/sub-process-navigation` (состояние PROD `ec2059a4` + breadcrumb-on-canvas + padding)
- **branch**: `fix/bpmn-drilldown-ui`
- **HEAD**: `72288376`
- **workspace**: `/opt/processmap-test`
- **remote**: `git@github.com:xiaomibelov/processmap_v1.git`

## Source / runtime truth
- `pwd`: `/opt/processmap-test`
- `git branch --show-current`: `fix/bpmn-drilldown-ui`
- `git rev-parse HEAD`: `72288376`
- `git rev-parse origin/main`: `c97099f3`
- PROD стенд: `http://clearvestnic.ru:5177`, served commit `72288376` (branch `fix/bpmn-drilldown-ui`)
- Последний деплой: `2026-06-17T21:16:15Z` (локальный `deploy/deploy.sh`)

## Проблема
В UI drill-down в BPMN-подпроцессы остались 4 дефекта:

1. **Breadcrumb перекрывает хедер/тулбар.**
2. **Нет индикатора обсуждений на родительской диаграмме.**
3. **Нет loading state при переходе между сабпроцессами.**
4. **Нет loading state при открытии сессии.**

## Scope
Только UI-слой (React, CSS, BPMN.io overlays). Backend, XML-экспорт/импорт, Product Actions, RAG/AG-UI не затронуты.

## Реализация (итог)

### 1. Breadcrumb offset
- `frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css`
  - `.subprocessBreadcrumbsOnCanvas { top: 12px; left: 12px; z-index: 50; pointer-events: none; }`
  - `.subprocessBreadcrumbsOnCanvas > * { pointer-events: auto; }`

### 2. Discussion badge на элементах родительской диаграммы
- `frontend/src/lib/sessionNoteAggregates.js` — добавлен `useChildSessionNoteAggregatesByElementId(parentSessionId, sessions)`.
- `frontend/src/App.jsx` — вычисляет `childDiscussionAggregates` и передаёт в `AppShell`.
- `frontend/src/components/AppShell.jsx` → `ProcessStage` → `useStableProcessDiagramOverlayLayersProps` → `buildProcessDiagramOverlayLayersProps` → `BpmnStage`.
- `frontend/src/features/process/bpmn/stage/decor/decorManager.js` — `applySubprocessDiscussionDecor` рисует `.fpcNodeBadge--discussions` для `CallActivity`/`SubProcess` с `open_notes_count > 0`.
- `frontend/src/features/process/bpmn/stage/orchestration/runBpmnRenderDecorSync.js` — `applyFullBpmnDecorSet` теперь вызывает `applySubprocessDiscussionDecor`.

### 3. Loading state при drill-down / возврате и cold open
- `frontend/src/components/process/BpmnStage.jsx`
  - Использует `useDiagramLoadStateMachine` и `DiagramLoadBoundary`.
  - `loadTransition("reset")` при смене `sessionId`.
  - `data-testid="diagram-ready"` рендерится, когда `loadState` достигает `ready`/`canvas-ready`.
- `frontend/src/features/process/bpmn/stage/orchestration/bpmnRenderRuntimeLifecycle.js`
  - `loadTransition("import_start")` перед `importXML`.
  - `loadTransition("import_success")` после импорта.
  - `loadTransition("import_error", { reason })` при ошибках.
- `frontend/src/features/process/bpmn/stage/load/DiagramLoadBoundary.jsx`
  - Скелетон (`data-testid="diagram-skeleton"`) показывается в состояниях `initializing`/`importing`.
  - Canvas всегда остаётся видимым (opacity: 1), чтобы инициализация BPMN.js не уходила в дедлок из-за проверки видимости родителя.

## Acceptance criteria
- [x] `.subprocessBreadcrumbsOnCanvas` имеет `top: 12px` и не перекрывает кнопки хедера/тулбара.
- [x] На `CallActivity`/`SubProcess` в родительской диаграмме рисуется badge с количеством открытых обсуждений child-сессии.
- [x] При клике на `.bjs-drilldown` / «Назад» меняется `loadState` и скелетон виден (на быстрых загрузках может мелькнуть).
- [x] При открытии сессии (cold open) виден спиннер/скелетон до завершения `importXML`.
- [x] `node scripts/e2e/check_subprocess_click.mjs` зелёный.
- [x] `npm run build` проходит без ошибок.
- [x] `node --test frontend/src/lib/sessionNoteAggregates.test.mjs` — 3/3.

## Риски (остаются)
- `BpmnStage.jsx` большой; изменения локализованы.
- Badge зависит от поля `parent_session_id` / `element_id_in_parent` в списке сессий.

## Следующий шаг
- Обновить `WORKER_REPORT.md`, `STATE.json`, создать `READY_FOR_REVIEW`.
- Получить явный approve пользователя перед PR / merge / deploy.
