# Runtime Proof Checklist — Agent 4

**Контур:** `feature/process-analytics-hub-and-registry-navigation-v1`  
**Целевая поверхность:** Analytics Hub / Product Actions Registry  
**URL:** `http://clearvestnic.ru:5180/app?surface=analytics`

---

## Health & Build

- [ ] `curl -s http://clearvestnic.ru:8088/health` → `{"ok":true,...}`
- [ ] `curl -I http://clearvestnic.ru:5180` → HTTP 200
- [ ] `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"` → валидный JSON с `branch`, `sha`, `timestamp`

## Analytics Hub Page

- [ ] Title «Аналитика» виден.
- [ ] Описание «Сводная аналитика по процессам...» видно.
- [ ] Summary cards (4 шт.) присутствуют без фейковых чисел.
- [ ] Module card «Реестр действий» с кнопкой «Открыть».
- [ ] Module card «Реестр свойств» со статусом «Скоро».
- [ ] Module card «Дашборды» присутствует.
- [ ] Module card «Экспорт» (опционально) присутствует.
- [ ] Кнопка «Закрыть» или «×» видна и функциональна.

## Registry Nesting

- [ ] Нажатие «Открыть» на «Реестр действий» ведёт на `?surface=product-actions-registry`.
- [ ] Registry загружается корректно.
- [ ] Закрытие registry возвращает в Analytics Hub или workspace.
- [ ] Приложение больше не показывает registry как единственную top-level analytics страницу.

## Navigation Safety

- [ ] Browser back работает с analytics surface.
- [ ] Нет user trap (пользователь всегда может выйти).
- [ ] TopBar на analytics surface показывает пассивную метку, а не сломанную back-кнопку.
- [ ] На обычных project/session экранах TopBar не сломан.

## Console

- [ ] Нет ошибок при открытии Analytics Hub.
- [ ] Нет ошибок при открытии registry из Hub.
- [ ] Нет ошибок при закрытии Hub/registry.

## Version & Safety

- [ ] `appVersion.js` содержит `currentVersion: "v1.0.134"`.
- [ ] `build-info.json` валиден.
- [ ] Version marker НЕ на BPMN canvas.
- [ ] `git diff --name-only` НЕ содержит `backend/app/`.
- [ ] `git diff --name-only` НЕ содержит `.env`, `package.json`, BPMN XML, RAG runtime.

## Build & Tests

- [ ] `npm run build` проходит без ошибок.
- [ ] `ProcessAnalyticsHub.test.mjs` проходит.
- [ ] `ProductActionsRegistryPanel.test.mjs` проходит.
- [ ] `ProductActionsRegistryPage.test.mjs` проходит.

## Worker 3 Independence

- [ ] `WORKER_3_REPORT.md` не содержит фраз «validated Worker 2», «waited for WORKER_2_DONE».
- [ ] `WORKER_3_REPORT.md` содержит собственный source map и independent evidence.
