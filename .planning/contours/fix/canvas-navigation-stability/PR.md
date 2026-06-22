# PR: canvas-navigation-stability

- **Title:** [fix] Стабильность канваса, навигации и статуса сессии
- **URL:** https://github.com/xiaomibelov/processmap_v1/pull/399
- **Branch:** `fix/canvas-navigation-stability`
- **Base:** `main`
- **Status:** `open` — awaiting review
- **Test stand deploy:** http://clearvestnic.ru:5177 (build SHA `23f0e00a`, healthcheck passed)
- **Hotfix:** `subprocessBreadcrumbs is not defined` — fixed by destructuring breadcrumb props in `AppShell`

## Description

Исправляет четыре связанных UX-дефекта в процессном редакторе:

1. **Кнопка статуса сессии** — добавлена фильтрация переходов по backend-матрице, optimistic update и rollback, индикатор сохранения.
2. **Перезагрузка канваса при смене статуса** — статус меняется без изменения `sessionId`/`reloadKey`/`bpmn_xml`, канвас остаётся живым.
3. **Breadcrumb поверх toolbar** — breadcrumb перенесён под заголовок процесса в normal flow с responsive wrap и корректным z-index.
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
