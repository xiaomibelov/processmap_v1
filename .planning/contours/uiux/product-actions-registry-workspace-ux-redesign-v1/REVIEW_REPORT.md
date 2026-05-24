# REVIEW_REPORT — uiux/product-actions-registry-workspace-ux-redesign-v1

## Verdict
CHANGES_REQUESTED

## Source Truth
- contour path: /opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1
- reviewed files:
  - frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
  - frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx
  - frontend/src/components/TopBar.jsx
  - frontend/src/components/AppShell.jsx
  - frontend/src/styles/tailwind.css
  - Screenshots in screenshots-reviewer/
- repo: /opt/processmap-test
- branch: fix/lockfile-sync-test
- HEAD: a9a9d9c5f468d9da63415306da6d34dcd605aa0d
- git diff: frontend/src/components/AppShell.jsx, TopBar.jsx, ProductActionsRegistryPanel.jsx, ProductActionsRegistryPage.test.mjs, ProductActionsRegistryPanel.test.mjs, frontend/src/styles/tailwind.css

## Runtime Inspection Evidence
Screenshots reviewed:
- `registry-initial.png` — header with export bar + "Вернуться", scope selector, workspace technical notice
- `registry-middle.png` — "Сессии workspace" section dominates, metrics bar below, filters grid below metrics
- `registry-bottom.png` — generic empty state "В рабочем пространстве пока нет данных"

## Checklist
| Item | Pass/Fail | Evidence | Comment |
|------|-----------|----------|---------|
| Page identity clear | Pass | Title "Реестр действий с продуктом" | |
| No debug-looking scope block | Fail | `registry-initial.png` line 2 shows "Сводка строится без загрузки полных данных всех сессий на frontend." | Technical copy remains |
| Scope selector calm | Pass | "Рабочее пространство / Проект / Сессия" | |
| Metrics compact single row | Pass | MetricItem bar present | But positioned AFTER session list |
| Filters horizontal toolbar | Partial | `display: flex` used | Still a separate section, not unified with table toolbar |
| Empty state unified | Partial | `UnifiedEmptyState` exists | Copy is generic; does not reflect "1 сессия, 0 действий" scenario |
| Table high density | Pass | Row styles present | |
| Hover paint-only | Pass | No height change | |
| Dark theme readable | Pass | Screenshots readable | |
| Light theme readable | Not inspected | — | Deferred |
| Console errors | Not inspected | — | Deferred |
| Network failures | Not inspected | — | Deferred |
| No BPMN XML mutation | Pass | No backend changes | |
| No auto-mutation | Pass | `acceptAiProductActions` explicit save | |

## Findings

### F1. Technical/debug copy remains (High)
- `ProductActionsRegistryPanel.jsx` line 758: "Сводка строится без загрузки полных данных всех сессий на frontend."
- Backend status messages (lines 283, 293, 303, 307, 318): "Workspace будет выбран текущим контекстом приложения.", "Выберите проект или откройте реестр из проекта.", "Откройте сессию или выберите проект для preview.", "Загружаю read-only реестр…", "Backend-агрегация пока недоступна."
- Section heading line 817: "Сессии workspace" — should be user-facing, not technical.
- These are developer-facing strings visible to end users.

### F2. Session list dominates over registry (High)
The `productActionsRegistrySessions` section (lines 813–938) renders a full table with columns "AI / Процесс / Project/path / Действия / Статус / Открыть". Visually this looks like the primary registry table, but it is actually a session/source selector. The real registry table (`productActionsRegistryPreview`, lines 1066–1114) appears much later in the DOM and is often below the fold.

### F3. Incorrect block order (High)
Current order:
1. Header (with export + back)
2. Scope selector
3. Workspace notice / Project picker / Session list (LARGE)
4. Bulk AI results
5. Metrics bar
6. Filters
7. Incomplete banner
8. Registry table / empty state

Required order:
1. Header (title only, minimal meta)
2. Scope selector
3. Summary metrics
4. Filter/search/table toolbar
5. Registry table
6. One contextual empty state (inside table area)

### F4. Session/source section looks like primary table (High)
The session summary table uses the same visual language as the registry table (row hover, grid layout, action buttons). Users can confuse it with the registry itself. It should be a compact, collapsible "Источники данных" section, not a full-width table.

### F5. AI button placed inside session list (High)
`runBulkAiSuggestions` button (lines 846–853) is nested inside the session list section. It should live in the registry action toolbar, adjacent to export and filter controls, and its enabled state should directly relate to selected sessions.

### F6. Empty state contradicts data scenario (Medium)
When 1 session exists but 0 product actions, the empty state says "В рабочем пространстве пока нет данных". It should say: "Найдена 1 сессия, но действий с продуктом пока нет. Откройте сессию или запустите AI-предложение действий."

### F7. Filters are a detached section (Medium)
Filters (`productActionsRegistryFilters`, lines 1028–1057) render as a standalone block below metrics. They should be part of a unified toolbar directly above the registry table, visually grouped with search/export/AI actions.

### F8. Export controls compete with header (Medium)
Export bar (lines 687–710) sits in the header right area with row counts. At 0 rows it is disabled but still visually prominent. Export should be a secondary action inside the registry toolbar, not in the page header.

### F9. "Вернуться" visible on registry route (Medium)
`onClose` button (lines 712–715) renders "Вернуться" on the registry page route. This button should be hidden or visually deprioritized (e.g., small text link, not a button) when on the dedicated registry surface.

### F10. "Проекты" back button in TopBar (Low)
The `TopBar` back button logic in `AppShell.jsx` hides the button on registry route, which is correct. However, the registry page itself still shows the "Вернуться" button (F9), creating redundancy.

## Required Rework
See `REWORK_REQUEST.md` for binding instructions.

## Boundary Confirmation
- [x] no backend changes required
- [x] no durable truth mutation
- [x] no BPMN XML mutation
- [x] no RAG bootstrap
- [x] no AG-UI integration changes
- [x] no secrets
- [x] no commit/push/PR
- [x] no deploy
