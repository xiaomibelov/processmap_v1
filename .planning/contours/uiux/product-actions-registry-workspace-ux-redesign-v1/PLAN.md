# uiux/product-actions-registry-workspace-ux-redesign-v1

> **Role:** Agent 1 / Planner  
> **Scope:** Frontend UI/UX planning for product actions registry workspace analytics screen  
> **Contour:** `uiux/product-actions-registry-workspace-ux-redesign-v1`  
> **Date:** 2026-05-14  
> **Status:** READY_FOR_EXECUTION

---

## GSD Discipline

### GSD Availability Check

Commands executed:
- `which gsd` → not found
- `which gsd-sdk` → not found
- `find /opt/processmap-test -maxdepth 4 -iname "*gsd*"` → found `/opt/processmap-test/docs/gsd`
- `ls /root/.codex/skills/gsd-plan-phase/SKILL.md` → exists (and many other gsd-* skills)

### Result
- GSD CLI (`gsd`, `gsd-sdk`) is **not available** in PATH.
- GSD skill files exist under `/root/.codex/skills/` and can be read for reference.
- **Mode used:** `GSD_FALLBACK_MANUAL_PLANNING_ONLY`

### Confirmations
- [x] Implementation was **not** performed.
- [x] Product files were **not** modified.
- [x] Contour is **bounded** and isolated from other tasks.
- [x] Agent 2 / Agent 3 gates are **prepared** in this PLAN.md.

---

## Source / Runtime Truth

| Field | Value |
|-------|-------|
| Repo root | `/opt/processmap-test` |
| Branch | `fix/lockfile-sync-test` |
| HEAD | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| git status | `.env` modified; untracked `.planning/`, `tools/`, `bin/` etc. |
| Runtime URL | `http://clearvestnic.ru:5180` |
| API base | `http://clearvestnic.ru:8088` |
| API health | `{"ok":true,"status":"ok","redis":{"state":"healthy"}}` |
| Frontend health | HTTP/1.1 200 OK |
| Playwright availability | **BLOCKED** — Chromium not installed (`npx playwright install chrome` required). Playwright MCP unavailable for this planning session. Fallback: source-only exact reproduction + source map. |

---

## Exact Reproduction

### Route / Path
The registry screen is rendered as a **full page** (not modal overlay) when the URL contains:
```
?surface=product-actions-registry&scope=workspace
```

The route is read by `readProductActionsRegistryRoute()` in:
- `frontend/src/app/processMapRouteModel.js`

### How the user reaches the screen
1. From the project/session workspace, there is an entry point that calls `openProductActionsRegistry({ scope })`.
2. This function (in `ProcessStage.jsx`) does `window.history.pushState(..., "", nextUrl)` with `surface=product-actions-registry`.
3. `ProcessStage.jsx` then conditionally renders `<ProductActionsRegistryPage>` instead of `<WorkspaceExplorer>` or `<DocStage>` when `productActionsRegistryRoute.active === true`.

### Current visible elements
1. **TopBar** — contains `← Проекты` button (when no active session) or `← К проекту` (when active session exists). This button calls `onOpenWorkspace()`.
2. **Page header** — "Реестр действий с продуктом" + subcopy about preview/export.
3. **Export bar** — CSV/XLSX buttons + metadata.
4. **Scope tabs** — `Workspace` / `Проект` / `Сессия` (segmented buttons).
5. **Workspace scope notice** — dashed-border block saying "Workspace scope" with backend aggregation explanation. Looks like a debug/technical hint.
6. **Session summary section** — when workspace/project scope, shows session list table with checkboxes, bulk-AI controls.
7. **Summary pills** — `Сессий`, `Строк`, `Полных`, `Неполных`, `После фильтров`. Displayed as individual bordered cards.
8. **Filters** — 7 dropdown selects in a grid (`Группа`, `Товар`, `Тип`, `Этап`, `Категория`, `Роль`, `Полнота`) + reset button.
9. **Incomplete banner** — warning banner if incomplete rows exist.
10. **Main preview table** — product actions rows (product, action, process/step, status) or empty state message.
11. **Footer** — filter summary line.

### UI/UX Problem Evidence
- The entire screen feels like a **debug/temporary workspace page**, not a polished analytics registry.
- The **workspace notice** (`productActionsRegistryWorkspaceNotice`) uses `border-style: dashed`, which looks like a technical annotation.
- **Summary pills** are scattered as bordered cards with inconsistent visual weight.
- **Filters** consume a full horizontal grid row and feel cramped.
- **Empty states** are fragmented: different messages for workspace vs project vs session vs filtered vs no-context.
- **TopBar "Проекты" button** remains clickable and visually identical even when the user is already on the registry page, creating confusion.
- The page subcopy talks about "preview before export" rather than positioning this as a **workspace-level analytics registry**.
- Dark theme readability is questionable due to many layered translucent backgrounds (`hsl(var(--panel) / 0.98)`, `hsl(var(--bg-soft) / 0.42)`).

---

## Source Map

### Primary target files (safe for Agent 2 to modify)

| # | Path | Why important | Safe to modify? |
|---|------|---------------|-----------------|
| 1 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | Main registry UI — header, scope tabs, workspace notice, filters, summary pills, table, empty states, footer, bulk AI, export. 1132 lines. | **Yes** — self-contained feature component. |
| 2 | `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` | Thin page wrapper. Sets `page=true` and `showWorkspaceScope=true`. | **Yes** — trivial wrapper. |
| 3 | `frontend/src/styles/tailwind.css` | All CSS classes for registry (`productActionsRegistry*`). ~150 rules. | **Yes** — add/modify registry-specific CSS only. |

### Secondary files (modify with caution)

| # | Path | Why important | Safe to modify? |
|---|------|---------------|-----------------|
| 4 | `frontend/src/components/TopBar.jsx` | Contains `← Проекты` / `← К проекту` button. Agent 2 needs to make it hidden/inactive when on registry route. | **Caution** — shared component. Only add a prop like `backButtonHidden` or check registry route state locally. Do not refactor menu logic. |
| 5 | `frontend/src/components/AppShell.jsx` | Passes `onOpenWorkspace={workspaceBackHandler}` to `TopBar`. | **Caution** — may need to pass additional prop to `TopBar` to indicate registry route. Avoid structural changes. |
| 6 | `frontend/src/shared/i18n/ru.js` | Russian copy strings. | **Yes** — safe for copy tweaks if needed. |

### Reference files (read-only for Agent 2)

| # | Path | Why important | Safe to modify? |
|---|------|---------------|-----------------|
| 7 | `frontend/src/components/ProcessStage.jsx` | Holds `productActionsRegistryRoute` state, `openProductActionsRegistry`, `closeProductActionsRegistry`. | **No** — massive orchestrator (6879 lines). Do not touch unless a tiny prop pass-through is absolutely necessary. |
| 8 | `frontend/src/app/processMapRouteModel.js` | URL builders and route readers for registry. | **Read-only** — Agent 2 should not change routing logic. |
| 9 | `frontend/src/features/process/analysis/productActionsRegistryModel.js` | Pure logic — row building, filtering, summarizing. | **Read-only** — no logic changes needed for UI redesign. |
| 10 | `frontend/src/lib/api.js` | API contracts. | **Read-only** — backend contract boundary. |

---

## UX Problem Statement

Current registry screen suffers from:
1. **Identity crisis** — looks like a temporary debug/export preview, not a workspace analytics registry.
2. **Visual noise** — dashed workspace notice, scattered empty states, card-like summary pills.
3. **Navigation confusion** — "Проекты" button active on the very screen it would navigate away from.
4. **Filter overload** — 7 dropdowns in a grid eat horizontal space.
5. **Density issues** — too much padding and cardification for what should be a dense operational table.
6. **Dark theme heaviness** — layered translucent backgrounds create visual mud.

**Product vision:** This screen is the future **workspace-level analytics registry** for all product actions, properties, and process analytics across all diagrams. It must feel like a permanent, professional tool, not a session-local debug panel.

---

## Target UX

### A. Page identity / header
- Title: **"Реестр действий"** or **"Реестр действий с продуктом"** (keep existing title).
- Subtitle: replace "preview/export" copy with user-facing explanation:  
  *"Аналитика действий с продуктом по всем процессам и диаграммам рабочего пространства."*
- Remove the debug-feeling "Workspace scope" dashed block entirely. Replace with a quiet, compact info line if backend aggregation status is needed.

### B. Navigation / back behavior
- When `surface=product-actions-registry` is active, the TopBar **"Проекты" / "К проекту"** button must be:
  - Hidden, OR
  - Visually disabled (opacity + `pointer-events: none`), OR
  - Replaced with a passive breadcrumb (e.g., "Реестр действий" as non-clickable text).
- **Must not break** the button on normal project/session screens.
- Safe approach: pass `productActionsRegistryRoute.active` (or equivalent boolean) from `AppShell` → `TopBar` as a new prop `hideBackButton`, and conditionally render a placeholder or nothing.

### C. Scope selector
- Keep `Workspace` / `Проект` / `Сессия` as a **segmented control**.
- Active state must be clear.
- Rename `Workspace` to `Рабочее пространство` if copy change is acceptable; otherwise keep `Workspace` but make it look like a UI label, not a debug token.
- Disabled states (when no project/session context) must remain.

### D. Metrics (summary pills)
- Convert from **card-like pills** to a **compact, quiet metric bar**.
- Use a single row with minimal separators, not individual bordered boxes.
- Labels remain: `Сессии`, `Строк`, `Полных`, `Неполных`, `После фильтров`.
- No acid colors, no heavy backgrounds. Use subtle text color differentiation.
- Metric values should be prominent; labels should be small/quiet.

### E. Filters
- Convert from a **7-column grid** to a **horizontal toolbar** or **collapsible filter bar**.
- Use compact selects (min-width reduced, padding tighter).
- Group related filters visually.
- Reset button stays secondary.
- Ensure readability in both light and dark themes.
- Filters must not steal focus from the main table area.

### F. Main content — empty state
- Consolidate all fragmented empty states into **one unified empty state component**.
- When no data:
  - Show an informative illustration or icon placeholder.
  - Explain what the registry is.
  - Explain why it's empty (e.g., "В рабочем пространстве пока нет процессов с действиями с продуктом.")
  - Provide a CTA: "Открыть проект" or "Создать сессию" if context allows.
- No multiple empty messages in different sections.

### G. Table / list direction
- The main preview table (`productActionsRegistryTable`) is already table-like — **preserve and enhance**.
- Requirements:
  - High density.
  - Hover/selected **paint-only** (no row height change, no layout shift).
  - No horizontal scrollbar unless justified.
  - Completeness indicators quiet but visible (small badge, not banner).
  - Future-ready structure for additional columns (properties, tags, etc.).
- Session summary table (`productActionsRegistrySessionSummaryTable`) should follow same density rules.

### H. Dark / light theme
- All new styles must use CSS custom properties (`var(--analysis-text)`, `var(--analysis-muted)`, `var(--analysis-border-soft)`, etc.).
- Avoid adding new translucent background layers.
- Test contrast in dark theme — current layered translucency creates mud.
- Borders should be subtle (`var(--analysis-border-soft)`).

### I. Future analytics readiness
- Layout should reserve space for future tabs/sections (e.g., "Свойства", "Метрики процессов") **only as a structural placeholder**.
- Do **not** implement fake functionality.
- If adding placeholder tabs, label them clearly as future or omit them entirely.

---

## Scope

### In scope
- UI/UX redesign of `ProductActionsRegistryPanel.jsx` and `ProductActionsRegistryPage.jsx`.
- CSS updates in `tailwind.css` for registry classes.
- TopBar back-button hide/disable when on registry route (localized change in `TopBar.jsx` + minimal prop in `AppShell.jsx`).
- Copy updates in `ru.js` if needed.
- Consolidated empty state component/behavior.
- Compact metric bar redesign.
- Filter toolbar redesign.
- Removal or restyling of the dashed `Workspace scope` block.

### Out of scope (Non-goals)
- No new backend analytics APIs.
- No schema/storage changes.
- No Product Actions AI logic changes.
- No RAG changes.
- No data indexing.
- No BPMN XML mutation.
- No global app redesign.
- No Explorer/TopBar global rewrite.
- No auth/org/project selection changes.
- No durable truth mutations.
- No fake analytics data.
- No new design-system for the entire app.
- No merge with Analysis table strict-table contour.
- No merge with Product Actions AI batch orchestrator.

---

## Agent 2 Execution Plan

1. Read this PLAN.md and source map.
2. Modify `ProductActionsRegistryPanel.jsx`:
   - Update header subcopy.
   - Replace/restyle workspace scope notice (remove dashed border, make it quiet).
   - Redesign summary pills into compact metric bar.
   - Redesign filters into horizontal toolbar.
   - Consolidate empty states.
   - Ensure table density and hover behavior.
3. Modify `ProductActionsRegistryPage.jsx` if needed (likely minimal).
4. Modify `TopBar.jsx` to accept `hideBackButton` prop and conditionally hide/disable back button.
5. Modify `AppShell.jsx` to pass registry-route state to `TopBar`.
6. Update `tailwind.css` with new/modified registry styles.
7. Run build and verify no errors.
8. Write `EXEC_REPORT.md`.
9. Create `READY_FOR_REVIEW`.

---

## Agent 3 Review Plan

1. Read `PROCESSMAP_AGENT3_UI_REVIEW_SKILL.md` from Project Atlas (if available).
2. Open actual runtime via Playwright MCP.
3. Navigate to `?surface=product-actions-registry`.
4. Verify:
   - Back button hidden/disabled on registry route.
   - Normal navigation unaffected on project/session screens.
   - Dark theme readability.
   - Light theme readability.
   - Filters compactness.
   - Empty state quality.
   - Metrics alignment.
   - Page identity / header clarity.
   - Scope selector clarity.
   - No debug-looking dashed block.
   - No layout shift on hover/selected.
   - No horizontal scrollbar.
   - Console/network errors.
5. Render verdict (`REVIEW_PASS`, `CHANGES_REQUESTED`, or `REVIEW_BLOCKED`).
6. Create correct marker files.

---

## Risks

| Risk | Mitigation |
|------|------------|
| TopBar change affects other screens | Keep change conditional on a prop; default behavior unchanged. |
| CSS changes bleed into modal overlay variant | Maintain separate `.productActionsRegistryPanel` vs `.productActionsRegistryPanel--page` selectors. |
| Empty state consolidation breaks existing tests | Update tests if needed; keep `data-testid` attributes stable. |
| Dark theme contrast regressions | Use existing CSS vars; avoid hardcoded colors. |
| Playwright unavailable for Agent 3 review | Agent 3 must use runtime proof checklist and source review as fallback; if Playwright blocked, verdict is `REVIEW_BLOCKED`. |

---

## Validation

- Build passes (`npm run build` or equivalent).
- No console errors on registry screen.
- No network errors related to registry.
- Back button behavior verified on registry route AND normal screens.
- Empty state shown when no data.
- Filters functional after redesign.
- Export buttons still functional.
- Scope switching still functional.

---

## Gates

- [x] **Gate 1** — GSD discipline completed
- [x] **Gate 2** — Source/runtime truth captured
- [x] **Gate 3** — Exact reproduction captured
- [x] **Gate 4** — Source map captured
- [x] **Gate 5** — UX target state defined
- [x] **Gate 6** — Non-goals locked
- [x] **Gate 7** — Executor prompt ready
- [x] **Gate 8** — Reviewer prompt ready
- [x] **Gate 9** — READY_FOR_EXECUTION marker created

---

> **Owner:** Agent 1 / Planner  
> **Next:** Agent 2 / Executor
