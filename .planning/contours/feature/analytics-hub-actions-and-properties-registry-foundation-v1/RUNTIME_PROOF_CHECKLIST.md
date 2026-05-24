# Runtime proof checklist

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`

## Agent 4 required proof

- [ ] `pwd`.
- [ ] `git remote -v` with credentials redacted in report.
- [ ] `git fetch origin`.
- [ ] `git branch --show-current`.
- [ ] `git rev-parse HEAD`.
- [ ] `git rev-parse origin/main`.
- [ ] `git status -sb`.
- [ ] `git diff --name-only`.
- [ ] `git diff --cached --name-only`.
- [ ] `curl -I http://clearvestnic.ru:5180` returns `HTTP 200` and no-cache headers.
- [ ] `curl -s http://clearvestnic.ru:8088/health` returns `ok`.
- [ ] `/build-info.json` matches this contour/run or mismatch is marked `BLOCKED`.

## Browser proof

- [ ] Open `Аналитика`.
- [ ] Verify Analytics exists as top-level surface.
- [ ] Verify Analytics is not bypassed by direct-only registry page.
- [ ] Verify entries:
  - [ ] `Реестр действий`
  - [ ] `Реестр свойств`
  - [ ] `Дашборды`
- [ ] Verify no separate top-level `Экспорт` card/module.
- [ ] Open `Реестр действий`.
- [ ] Verify `Реестр действий с продуктом` renders.
- [ ] Verify CSV/XLSX in header.
- [ ] Verify AI controls in primary area.
- [ ] Verify table is primary content.
- [ ] Verify one white content container.
- [ ] Verify no gradients, dotted borders, colored metric cards, internal shadows.
- [ ] Verify `Вернуться` returns to Analytics.
- [ ] Open `Реестр свойств`.
- [ ] Verify foundation/placeholder is honest.
- [ ] Verify no fake property rows/counts.
- [ ] Open `Дашборды`.
- [ ] Verify future/placeholder status.
- [ ] Verify global shell/header/sidebar unchanged.
- [ ] Verify no console errors.
- [ ] Verify no unsafe `PUT/PATCH/DELETE` from viewing/navigation.

## Scope proof

- [ ] No backend/schema changes.
- [ ] No BPMN XML mutation changes.
- [ ] No Product Actions durable truth mutation.
- [ ] No RAG runtime/auto-indexing implementation.
- [ ] No package install.
