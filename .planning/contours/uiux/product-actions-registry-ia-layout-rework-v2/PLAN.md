# uiux/product-actions-registry-ia-layout-rework-v2

> **Role:** Agent 1 / Planner  
> **Scope:** Frontend UI/UX information architecture rework for Product Actions Registry screen  
> **Contour:** `uiux/product-actions-registry-ia-layout-rework-v2`  
> **Date:** 2026-05-14  
> **Run ID:** `20260514T194022Z-72528`  
> **Status:** READY_FOR_EXECUTION

---

## GSD Discipline

### GSD Availability Check

Commands executed:
- `command -v gsd` → `/opt/processmap-test/bin/gsd`
- `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
- `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
- `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
- `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 50+ skills found
- `find /root/.codex/agents -maxdepth 2 -type d -name 'gsd-*'` → agents found

### Result
- GSD CLI (`gsd`, `gsd-sdk`) is **available** via `/opt/processmap-test/bin/`.
- GSD skill files exist under `/root/.codex/skills/`.
- **Mode used:** `GSD_PROCESSMAP_WRAPPER_PLANNING`

### Confirmations
- [x] Implementation was **not** performed.
- [x] Product files were **not** modified.
- [x] Contour is **bounded** and isolated from other tasks.
- [x] Agent 2 / Agent 3 gates are **prepared** in this PLAN.md.

---

## Source / Runtime Truth

| Field | Value |
|-------|-------|
| Server | `clearvestnic.ru` |
| User | `root` |
| Repo root | `/opt/processmap-test` |
| Branch | `fix/lockfile-sync-test` |
| HEAD | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| git status | `.env` modified; frontend files modified from v1; untracked `.planning/`, `tools/`, `bin/`, screenshots |
| Runtime URL | `http://clearvestnic.ru:5180` |
| API base | `http://clearvestnic.ru:8088` |
| API health | `{"ok":true,"status":"ok","redis":{"state":"healthy"}}` |
| Frontend health | HTTP/1.1 200 OK |
| Playwright CLI | Version 1.60.0 available |
| Playwright Chromium | **NOT installed** (`CHROMIUM_NOT_FOUND`) |

---

## Previous Contour State

Previous contour: `uiux/product-actions-registry-workspace-ux-redesign-v1`

| Artifact | Status |
|----------|--------|
| PLAN.md | Exists |
| EXEC_REPORT.md | Exists — Agent 2 completed UI/UX redesign |
| REVIEW_REPORT.md | Exists — verdict: **CHANGES_REQUESTED** |
| REWORK_REQUEST.md | Exists — detailed binding instructions for Agent 2 |
| CHANGES_REQUESTED | Exists |

Key v1 achievements:
- Title + subtitle updated.
- `TopBar.jsx` + `AppShell.jsx` hide back button on registry route.
- Scope label renamed `Workspace` → `Рабочее пространство`.
- Metrics converted to compact `MetricItem` bar.
- Filters converted to `display: flex` horizontal toolbar.
- Empty state consolidated into `UnifiedEmptyState`.
- Tests fixed and build passes.

Key v1 review failures (driving v2 scope):
1. **Technical/debug copy remains** — "frontend", "workspace", "scope", "read-only", "Backend-агрегация" visible to users.
2. **Session list dominates** — `productActionsRegistrySessions` section renders a full table ABOVE the registry table.
3. **Incorrect block order** — session list → bulk AI → metrics → filters → registry table. Registry must be primary.
4. **AI button inside session list** — should be in registry toolbar.
5. **Empty state contradicts data** — says "нет данных" when 1 session exists but 0 actions.
6. **Filters detached** — not part of unified toolbar above table.
7. **Export controls in header** — compete with page identity.
8. **"Вернуться" still visible** on registry page route.

---

## Current Runtime UX Problem

The screen is called "Реестр действий с продуктом" but visually behaves like a session-management/debug tool.

### Visible problems
1. **Identity crisis** — The session/source table (`productActionsRegistrySessionSummaryTable`) looks like the primary content. It has headers, row hover, action buttons, and consumes the full width above the fold.
2. **Technical copy everywhere** — "frontend", "workspace", "scope", "read-only", "Backend-агрегация", "preview" appear in user-facing strings.
3. **Wrong DOM order** — Header → scope → workspace notice → session list (LARGE) → bulk AI → metrics → filters → incomplete banner → registry table/empty state.
4. **AI button misplaced** — Nested inside `productActionsRegistrySessions`, not in a registry action toolbar.
5. **Empty state mismatch** — When `visibleSessionTotal > 0 && summary.rows === 0`, generic "В рабочем пространстве пока нет данных" is shown.
6. **Export in header** — CSV/XLSX + metadata sit in the page header, visually competing with the title.
7. **"Вернуться" redundant** — `AppShell.jsx` already hides TopBar back button; the panel still renders a prominent "Вернуться" button.
8. **"Проекты" still clickable conceptually** — while TopBar hides it, the registry page itself does not feel like a dedicated surface.

---

## Exact Reproduction

### Route
```
http://clearvestnic.ru:5180?surface=product-actions-registry&scope=workspace
```

### How to reach
1. From workspace dashboard, click "Реестр действий" in sidebar.
2. Or directly open URL with `?surface=product-actions-registry&scope=workspace`.

### Current DOM order (simplified)
```
productActionsRegistryPanel
  productActionsRegistryHeader
    title + subtitle | export bar + "Вернуться"
  productActionsRegistryScope (segmented control)
  productActionsRegistryWorkspaceNotice (technical copy)
  productActionsRegistryProjectPicker (project scope session chooser)
  productActionsRegistrySessions (LARGE session table)
    productActionsRegistrySessionSummaryTable
    bulk AI controls (inside session section)
  productActionsRegistrySummary (metrics)
  productActionsRegistryFilters (detached filter grid)
  productActionsRegistryPreview (actual registry table)
    OR UnifiedEmptyState
  productActionsRegistryFooter
```

---

## Source Map

### Primary target files (safe for Agent 2 to modify)

| # | Path | Role | Safe to modify? |
|---|------|------|-----------------|
| 1 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | Main registry UI — 1154 lines. Contains header, scope, workspace notice, project picker, session list, bulk AI, metrics, filters, registry table, empty state, footer. | **Yes** — self-contained feature component. |
| 2 | `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` | Thin page wrapper. Sets `page=true` and `showWorkspaceScope=true`. | **Yes** — trivial wrapper. |
| 3 | `frontend/src/styles/tailwind.css` | All CSS classes for registry (`productActionsRegistry*`). ~80 rules. | **Yes** — add/modify registry-specific CSS only. |

### Secondary files (modify with caution)

| # | Path | Role | Safe to modify? |
|---|------|------|-----------------|
| 4 | `frontend/src/components/TopBar.jsx` | Already has `hideBackButton` prop from v1. No further changes expected unless v1 logic is insufficient. | **Caution** — verify existing prop works; do not refactor menu logic. |
| 5 | `frontend/src/components/AppShell.jsx` | Already has `isRegistryRoute()` and `registryRouteActive` state from v1. Passes `hideBackButton` to `TopBar`. | **Caution** — verify existing logic works; no structural changes. |
| 6 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` | Tests for panel. Will need updates for copy/layout changes. | **Yes** — keep bounded to registry. |
| 7 | `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs` | Tests for page wrapper. Will need updates for copy changes. | **Yes** — keep bounded to registry. |

### Reference files (read-only for Agent 2)

| # | Path | Role | Do NOT modify |
|---|------|------|---------------|
| 8 | `frontend/src/components/ProcessStage.jsx` | Orchestrator — holds `productActionsRegistryRoute` state, `openProductActionsRegistry`. 6879 lines. | **No** |
| 9 | `frontend/src/app/processMapRouteModel.js` | URL builders and route readers. | **No** |
| 10 | `frontend/src/features/process/analysis/productActionsRegistryModel.js` | Pure logic — row building, filtering, summarizing. | **No** |
| 11 | `frontend/src/lib/api.js` | API contracts. | **No** |
| 12 | `frontend/src/shared/i18n/ru.js` | Global i18n. Avoid broad changes; use local copy in component if needed. | **No** |

---

## Target Information Architecture

### A. Header
- **Left:** Title "Реестр действий с продуктом" + subtitle "Аналитика действий с продуктом по процессам и диаграммам рабочего пространства."
- **Right:** Nothing. Export and back controls removed from header.
- TopBar already hides "Проекты" / "К проекту" via `hideBackButton` (v1).
- On registry page route (`page === true`), hide or de-prioritize "Вернуться".

### B. Scope segmented control
- Three modes: "Рабочее пространство" / "Проект" / "Сессия"
- Single segmented control, clear active state.
- No user-facing "workspace" / "scope" words.

### C. Summary metrics strip
- Immediately AFTER scope selector.
- Compact single row: `Сессии` · `Строк` · `Полных` · `Неполных` · `После фильтров`
- Quiet labels, prominent values, minimal separators.
- No card chaos, no acid colors.

### D. Registry toolbar
- One compact toolbar directly above main registry table.
- **Left:** Filter selects (Группа, Товар, Тип, Этап, Категория, Роль, Полнота) + reset.
- **Right:**
  - Export CSV / XLSX (disabled when 0 rows, small/secondary).
  - AI button: "AI: предложить действия" (disabled when no selected sessions).
  - Selection label: "Выбрано для AI: N / 10".

### E. Main product actions registry table
- Primary visual object.
- Table with columns: Продукт, Действие, Процесс/шаг, Статус.
- High density, paint-only hover.
- If 0 rows: contextual empty state **inside** the table area (not a separate block).

### F. Empty state (contextual, singular)
- Only ONE empty message inside the table area.
- **If sessions > 0 && actions === 0:**
  - Title: "Действий с продуктом пока нет"
  - Message: "Найдена N сессия, но действия с продуктом ещё не заполнены. Откройте сессию или запустите AI-предложение действий."
- **If sessions === 0:**
  - Title: "В рабочем пространстве пока нет сессий с действиями с продуктом."
- **If filters active && no rows:**
  - "Нет данных под фильтры. Измените фильтры или сбросьте их."
- No separate footer "После фильтров…" in empty state.

### G. Source sessions section (secondary)
- Collapsible `<details>` / accordion block titled "Источники данных".
- Default: **collapsed** when `rows.length > 0`; **expanded** when `rows.length === 0`.
- Compact list items (not a full table with headers).
- No grid headers. No row hover effects. Small font.
- Session selection helpers ("Выбрать все видимые", "Только без действий", "Только неполные") stay inside this section.
- AI button REMOVED from this section.

### H. Navigation
- Registry route: "Проекты" hidden in TopBar (v1 done — verify).
- Registry page: "Вернуться" hidden or rendered as small text link.
- Normal project/session navigation must not break.

---

## Scope

### In scope
- Restructure DOM order in `ProductActionsRegistryPanel.jsx`.
- Remove/rephrase all technical/debug user-facing copy.
- Move metrics to immediately after scope selector.
- Create unified registry toolbar (filters + export + AI).
- Move registry table to primary position.
- Make source sessions secondary/collapsible/compact.
- Fix empty state for "sessions exist but no actions" scenario.
- Hide or de-prioritize "Вернуться" on registry page route.
- Remove export meta from header.
- CSS adjustments in `tailwind.css` for new layout.
- Update tests to match new copy/structure.

### Out of scope (Non-goals)
- No new backend analytics APIs.
- No schema/storage changes.
- No Product Actions AI logic changes.
- No RAG changes.
- No BPMN XML mutation.
- No AG-UI integration.
- No `.env` changes.
- No commit/push/PR/deploy.
- No changes to `ProcessStage.jsx` routing logic.
- No changes to `productActionsRegistryModel.js` data logic.

---

## Agent 2 Execution Plan

See `EXECUTOR_PROMPT.md` for full instructions.

Summary:
1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json.
2. Implement frontend-only UI/UX rework in `ProductActionsRegistryPanel.jsx`.
3. Adjust CSS in `tailwind.css`.
4. Update tests in `ProductActionsRegistryPanel.test.mjs` and `ProductActionsRegistryPage.test.mjs`.
5. Verify build passes (`npm run build`).
6. Run registry tests.
7. Write `EXEC_REPORT.md` and create `READY_FOR_REVIEW`.

---

## Agent 3 Review Plan

See `REVIEWER_PROMPT.md` for full instructions.

Summary:
1. Read PLAN.md, EXEC_REPORT.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md.
2. Open runtime via Playwright (`http://clearvestnic.ru:5180`).
3. Navigate to registry screen.
4. Run all checklist checks.
5. If any fail → `CHANGES_REQUESTED` + `REWORK_REQUEST.md`.
6. If all pass → `REVIEW_REPORT.md` + `REVIEW_PASS`.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Tests break due to copy changes | Update test expectations in parallel with copy changes. |
| CSS layout shifts cause horizontal scroll | Verify `overflow-x` and grid/flex widths. |
| Collapsible `<details>` styling inconsistent across browsers | Use custom CSS, not default browser `<details>` styles. |
| Moving DOM elements breaks event handlers | Preserve all `onClick`/`onChange` handlers; only move JSX, not logic. |
| Russian pluralization in empty state | Implement simple plural rules (1/2-4/5+). |

---

## Validation

- `npm run build` passes with no errors.
- All registry-related node tests pass.
- No console errors on registry screen.
- No network errors on registry screen.
- No horizontal scrollbar at 1280px+ viewport.
- Readable in both light and dark themes.

---

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — Runtime/source truth captured
- [x] Gate 3 — Current implementation state reviewed
- [x] Gate 4 — Exact UX problems documented
- [x] Gate 5 — Source map captured
- [x] Gate 6 — Target information architecture defined
- [x] Gate 7 — Non-goals locked
- [x] Gate 8 — Executor prompt ready
- [x] Gate 9 — Reviewer prompt ready
- [x] Gate 10 — READY_FOR_EXECUTION marker created
