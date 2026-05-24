# Agent 2 — Executor Prompt

> **Contour:** `uiux/product-actions-registry-workspace-ux-redesign-v1`  
> **Scope:** Frontend UI/UX redesign of product actions registry screen  
> **Role:** Agent 2 / Executor

---

## Pre-work mandatory reads

1. Read this contour's `PLAN.md`.
2. Read this contour's `RUNTIME_NAVIGATION.md`.
3. Read `RUNTIME_PROOF_CHECKLIST.md` to understand what Agent 3 will verify.

---

## Your mission

Redesign the UI/UX of the ProcessMap **product actions registry** screen so it feels like a professional workspace-level analytics registry, not a temporary debug page.

---

## Files you may modify

### Primary (safe)
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx`
- `frontend/src/styles/tailwind.css` (registry CSS classes only)

### Secondary (caution)
- `frontend/src/components/TopBar.jsx` — add conditional hide/disable for back button on registry route.
- `frontend/src/components/AppShell.jsx` — pass registry-route flag to `TopBar` if needed.
- `frontend/src/shared/i18n/ru.js` — copy tweaks if needed.

### Do NOT modify
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/app/processMapRouteModel.js`
- `frontend/src/features/process/analysis/productActionsRegistryModel.js`
- `frontend/src/lib/api.js`
- Any backend files.
- Any `.env` files.

---

## Specific tasks

### 1. Page identity / header
- Keep title "Реестр действий с продуктом".
- Update subtitle to user-facing copy (see PLAN.md Target UX section A).
- Remove or restyle the dashed `Workspace scope` block into a quiet info line.

### 2. Navigation / back button
- When user is on registry route (`surface=product-actions-registry`), the TopBar `← Проекты` / `← К проекту` button must be **hidden or visually disabled**.
- Safe implementation:
  - Add optional prop `hideBackButton` (or `backButtonMode`) to `TopBar.jsx`.
  - In `AppShell.jsx`, detect registry route (via `productActionsRegistryRoute.active` or URL check) and pass the prop.
  - Default behavior on non-registry screens must be unchanged.

### 3. Scope selector
- Keep `Workspace` / `Проект` / `Сессия` segmented control.
- Ensure active state is clear.
- Optional: change `Workspace` label to `Рабочее пространство` in `ru.js`.

### 4. Metrics bar
- Replace individual bordered summary pills with a **compact single-row metric bar**.
- Labels: `Сессии`, `Строк`, `Полных`, `Неполных`, `После фильтров`.
- Quiet labels, prominent values, minimal separators, no heavy backgrounds.

### 5. Filters
- Convert from 7-column grid to **horizontal toolbar** or **collapsible filter bar**.
- Compact selects, grouped visually.
- Reset button stays secondary.
- Must remain functional.

### 6. Empty state
- Consolidate all fragmented empty states into **one unified empty state**.
- Informative message: what the registry is, why it's empty, what to do next.
- Single location in the main preview area.

### 7. Table
- Preserve table structure.
- Ensure hover states are **paint-only** (color change only, no height/layout shift).
- Ensure high density.
- Ensure no accidental horizontal scrollbar.

### 8. Dark / light theme
- Use existing CSS custom properties.
- Avoid new translucent background layers.
- Verify readability in dark theme.

### 9. Build & test
- Run frontend build. Fix any errors.
- Do not break existing tests if possible.
- If tests break due to DOM changes, update minimally.

---

## Proof you must provide in EXEC_REPORT.md

- List of files changed.
- Confirmation that backend was not modified.
- Confirmation that BPMN XML was not mutated.
- Confirmation that `Проекты` button is hidden/disabled **only** on registry route.
- Confirmation that normal project/session navigation still works.
- Build/test status (passed or blockers described).
- Runtime proof if feasible (screenshot path or description).

---

## Safety rules

- Do not change backend code or API contracts.
- Do not mutate BPMN XML.
- Do not change Product Actions AI logic.
- Do not run RAG bootstrap or MCP repair.
- Do not modify `.env` or secrets.
- Do not commit/push/deploy.
- Keep changes bounded to the registry screen.

---

## Completion markers

When done, create:
1. `EXEC_REPORT.md` in this contour folder.
2. `READY_FOR_REVIEW` in this contour folder.

Then signal readiness for Agent 3.
