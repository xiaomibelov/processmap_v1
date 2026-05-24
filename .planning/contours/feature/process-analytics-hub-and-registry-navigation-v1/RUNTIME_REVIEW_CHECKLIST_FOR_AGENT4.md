# RUNTIME_REVIEW_CHECKLIST_FOR_AGENT4.md

> **Контур:** `feature/process-analytics-hub-and-registry-navigation-v1`  
> **Агент:** Agent 3 / Worker → подготовлено для Agent 4 / Reviewer  
> **Дата:** 2026-05-17

---

## Pre-conditions
- [x] Frontend build собран (`npm run build` прошёл без ошибок).
- [x] Сервис на `clearvestnic.ru:5180` отвечает HTTP 200.
- [x] Backend health `8088/health` returns OK.

---

## Чеклист валидации

### A. Analytics Hub Page
- [ ] `curl -I http://clearvestnic.ru:5180/app?surface=analytics` → HTTP 200.
- [ ] DOM содержит `data-testid="process-analytics-hub-page"`.
- [ ] Title «Аналитика» виден.
- [ ] Description text виден.
- [ ] Summary/dashboard cards существуют (4 placeholders).
- [ ] В summary cards НЕТ fake чисел, представленных как реальные данные.

### B. Module Cards
- [ ] «Реестр действий» карточка существует с CTA «Открыть».
- [ ] Клик «Открыть» ведёт на `?surface=product-actions-registry`.
- [ ] «Реестр свойств» карточка существует со статусом «Скоро».
- [ ] «Дашборды» карточка существует со статусом «Скоро».
- [ ] «Экспорт» карточка существует со статусом «В разработке».

### C. Product Actions Registry (Nested)
- [ ] Registry page загружается корректно.
- [ ] Registry данные отображаются (если доступны).
- [ ] Закрытие registry возвращает в Analytics Hub или workspace безопасно.

### D. Navigation Safety
- [ ] Close/back button видна на Analytics Hub.
- [ ] User trap отсутствует — пользователь всегда может вернуться к workspace.
- [ ] Browser back button работает.
- [ ] Нет активных неактуальных top actions (например, «Создать сессию BPMN» скрыт или визуально неактивен).

### E. Console & Network
- [ ] Нет console errors при открытии Hub.
- [ ] Нет console errors при открытии registry из Hub.
- [ ] Нет failed network requests, связанных с analytics.

### F. Version & Build
- [ ] `appVersion.js` содержит `v1.0.134`.
- [ ] `build-info.json` — валидный JSON с `branch`, `sha`, `timestamp`.
- [ ] Version marker НЕ на BPMN canvas.

### G. Data Safety
- [ ] `git diff --name-only` НЕ содержит `backend/app/`.
- [ ] Нет изменений `.env`.
- [ ] Нет изменений `package.json`.
- [ ] Нет мутаций BPMN XML.

### H. CSS & Responsive
- [ ] Layout читаем при 1280px+.
- [ ] Карточки имеют чёткие границы/секции.
- [ ] Нет horizontal scrollbar на Hub page.
- [ ] Тёмная тема читаема.

### I. Worker 3 Independence
- [ ] Worker 3 выполнил независимую работу (нет ложной зависимости от Worker 2).
- [ ] Существуют WORKER_3_REPORT.md и WORKER_3_DONE.

---

## Evidence, собранное Worker 3

- **Скриншот:** `analytics-hub-1280x900.png` — показывает полный Hub layout.
- **DOM snapshot:** `analytics-hub-dom-snapshot.md`.
- **Console:** 1 ошибка `401 Unauthorized` на `/api/auth/me` (не связана с Hub).
- **Build:** прошёл успешно.
- **Tests:** `ProcessAnalyticsHub.test.mjs` — 14/14 passed.
- **curl:** `http://clearvestnic.ru:5180` → HTTP 200 OK.
