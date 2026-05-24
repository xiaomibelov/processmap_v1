# Agent 4 runtime review checklist

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`

## Source/runtime truth

- [ ] `pwd`
- [ ] `git remote -v` with credentials redacted
- [ ] `git fetch origin`
- [ ] `git branch --show-current`
- [ ] `git rev-parse HEAD`
- [ ] `git rev-parse origin/main`
- [ ] `git status -sb`
- [ ] `git diff --name-only`
- [ ] `git diff --cached --name-only`
- [ ] `curl -I http://clearvestnic.ru:5180`
- [ ] `curl -s http://clearvestnic.ru:8088/health`
- [ ] `/build-info.json` checked

## Browser runtime

- [ ] Fresh browser context on `http://clearvestnic.ru:5180`.
- [ ] Open `Аналитика`.
- [ ] Verify it is a top-level surface, not direct-only registry.
- [ ] Verify entries:
  - [ ] `Реестр действий`
  - [ ] `Реестр свойств`
  - [ ] `Дашборды`
- [ ] Verify no top-level `Экспорт` card/module in Analytics.
- [ ] Open `Реестр действий`.
- [ ] Verify current Product Actions Registry functionality.
- [ ] Verify CSV/XLSX controls are inside registry header, not Analytics.
- [ ] Verify inner page visual rules: single white container, table-first, no gradients, no dotted borders, no colored metric cards, no internal shadows.
- [ ] Verify `Вернуться` returns to `Аналитика`.
- [ ] Open `Реестр свойств`.
- [ ] Verify page title `Реестр свойств`.
- [ ] Verify description `Сводный список свойств BPMN-элементов и процессных объектов.`
- [ ] Verify placeholder/read-only shell is honest: no fake rows/counts.
- [ ] Verify `Дашборды` remains future/placeholder with no fake metrics.
- [ ] Verify global shell/header/sidebar unchanged.
- [ ] Verify no console errors.
- [ ] Verify no unsafe `PUT/PATCH/DELETE` during viewing/navigation.

## Out-of-scope checks

- [ ] No backend/schema implementation in this contour.
- [ ] No BPMN XML mutation.
- [ ] No Product Actions durable truth mutation.
- [ ] No RAG runtime/auto-indexer implementation.
- [ ] No package install.

## Required verdict rule

`REVIEW_PASS` is forbidden if served runtime still has a top-level Analytics `Экспорт` module/card.
