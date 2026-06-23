# PR: canvas-navigation-stability

- **Title:** [fix] Стабильность канваса, навигации и статуса сессии
- **URL:** https://github.com/xiaomibelov/processmap_v1/pull/399
- **Branch:** `fix/canvas-navigation-stability`
- **Base:** `main`
- **Status:** `open` — awaiting review
- **Test stand deploy:** http://clearvestnic.ru:5177 (build SHA `68b6ec31`, healthcheck passed)
- **Hotfix 1:** `subprocessBreadcrumbs is not defined` — fixed by destructuring breadcrumb props in `AppShell`
- **Hotfix 2:** breadcrumb now shows the current hierarchy path, syncs on return, and renders inside the canvas area below the toolbar

## Description

Исправляет четыре связанных UX-дефекта в процессном редакторе:

1. **Кнопка статуса сессии** — добавлена фильтрация переходов по backend-матрице, optimistic update и rollback, индикатор сохранения.
2. **Перезагрузка канваса при смене статуса** — статус меняется без изменения `sessionId`/`reloadKey`/`bpmn_xml`, канвас остаётся живым.
3. **Breadcrumb поверх toolbar** — breadcrumb перенесён внутрь canvas-области (absolute top-left), не перекрывает toolbar; отображает текущую иерархию, при возврате сбрасывается до корня.
4. **Subprocess navigation** — drill-in/out работает как SPA-переход с сохранением viewport/zoom родительского процесса и focus-элемента через props, без `window.location.reload`.

## Acceptance criteria

- [x] 3+ последовательных смены статуса без зависаний.
- [x] Смена статуса не вызывает перезагрузку канваса.
- [x] Breadcrumb не перекрывает кнопки Save/Undo/Redo/Zoom/Fit/Status.
- [x] Drill-in/out без full reload, с обновлением URL и breadcrumb.
- [x] Unit tests pass (`sessionStatus`, `TopBar`, `App`).
- [x] Frontend build passes.
- [ ] PR reviewed and approved.
- [ ] Merged to `main`.
