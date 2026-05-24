# RUNTIME_PROOF_CHECKLIST — uiux/product-actions-registry-ia-layout-rework-v2

## Pre-execution checks (Agent 1)
- [x] GSD discipline recorded
- [x] Source/runtime truth captured
- [x] Route documented
- [x] Source map documented

## Agent 2 implementation checks
- [ ] Technical copy removed: workspace/frontend/scope
- [ ] "Сессии workspace" removed
- [ ] Header correct (title + subtitle, no export meta in header)
- [ ] Scope segmented control correct (Рабочее пространство / Проект / Сессия)
- [ ] Metrics strip correct (compact, before filters/table)
- [ ] Registry toolbar correct (unified filters + actions)
- [ ] Filters compact (horizontal, part of toolbar)
- [ ] AI button placed correctly (in registry toolbar, not session list)
- [ ] Export disabled/secondary at 0 rows
- [ ] Product actions registry is primary visual object
- [ ] Source sessions secondary (collapsible, compact)
- [ ] Empty state singular/contextual (inside table area only)
- [ ] "Проекты" hidden/not clickable on registry route
- [ ] "Вернуться" secondary/passive or hidden on registry page route
- [ ] Light/dark readable
- [ ] No horizontal scrollbar
- [ ] Console errors checked
- [ ] Network errors checked

## Boundary checks
- [ ] No backend changes
- [ ] No BPMN XML mutation
- [ ] No durable truth mutation
- [ ] No AG-UI integration
- [ ] No RAG changes

## Agent 3 review checks (Playwright)
- [ ] Agent 3 Playwright review required
- [ ] No visible "workspace" in user-facing UI
- [ ] No visible "frontend" in user-facing UI
- [ ] No visible "scope" in user-facing UI
- [ ] No "Сессии workspace"
- [ ] "Проекты" hidden/not clickable on registry route
- [ ] "Вернуться" secondary/passive
- [ ] Main object is product actions registry, not session list
- [ ] Source sessions are secondary/collapsible/compact
- [ ] Summary metrics before filters/table
- [ ] Filters are one compact toolbar
- [ ] AI button belongs to registry action toolbar
- [ ] Export disabled/secondary when 0 rows
- [ ] One contextual empty state only
- [ ] Empty state text matches data state (sessions > 0, actions = 0)
- [ ] No horizontal scrollbar
- [ ] Readable light/dark
- [ ] No console errors
- [ ] No network errors
- [ ] Ordinary project/session navigation not broken
