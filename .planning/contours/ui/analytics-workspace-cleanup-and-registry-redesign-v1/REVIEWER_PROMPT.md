# Agent 4 / Reviewer

## Identity
- You are Agent 4 / Reviewer for ProcessMap.
- Contour: `ui/analytics-workspace-cleanup-and-registry-redesign-v1`
- Run ID: `20260522T121703Z-96444`

## Contract
- Read `PLAN.md` and `.planning/templates/processmap_registry_ui_ux_spec.md`.
- Wait for `AGENT3_MERGE_DONE` before starting.
- Verify source/runtime truth before rendering verdict.
- Do NOT approve without runtime proof.
- Verdict options: `REVIEW_PASS`, `CHANGES_REQUESTED`, `REVIEW_BLOCKED`.

---

## Pre-Review Checklist

1. Read `EXEC_REPORT_MERGED.md`.
2. Check git diff: `git diff --name-only` and `git diff --stat`.
3. Confirm build passes: `cd frontend && npm run build`.
4. Confirm tests pass.
5. Fresh runtime proof:
   ```bash
   curl -I "http://clearvestnic.ru:5180/?cb=$(date +%s)" -H "Cache-Control: no-cache"
   ```
   Must return HTTP 200.

---

## Visual Checklist (from spec)

### Page structure
- [ ] Single white container wraps ALL content.
- [ ] No nested cards inside the container.
- [ ] Page background `#F5F5F5` (or dark equivalent).

### Header
- [ ] Title "Реестр действий с продуктом" or "Реестр действий".
- [ ] Subtitle present.
- [ ] Export dropdown in header only (no duplicates).
- [ ] "Вернуться" button visible when on full page.

### Scope tabs
- [ ] Horizontal row: Workspace / Проект / Сессия.
- [ ] Active tab has underline `#7C3AED`.
- [ ] No pill-style or grey-card tabs.

### Metrics
- [ ] Single text row, no cards, no backgrounds.
- [ ] Values prominent, labels small/quiet.

### Filters
- [ ] Horizontal toolbar on desktop.
- [ ] Compact selects.
- [ ] "Сбросить фильтры" as text link.

### Warning
- [ ] Soft text row only.
- [ ] NO yellow banner, NO card, NO background.

### AI controls
- [ ] No gradient, no card background.
- [ ] Purple chips and button.

### Table
- [ ] Dense rows (48px).
- [ ] Hover `#FAFAFA`.
- [ ] Status badges: dot + text, no background.
- [ ] No horizontal scrollbar unless justified.
- [ ] Empty cells show `"—"`.

### Empty state
- [ ] Centered, icon, honest message.
- [ ] No fake rows or fake counts.

### Source section
- [ ] Inside same white container.
- [ ] Separated by light line only.
- [ ] No dotted border, no card wrapper.

### Dark theme
- [ ] No layered translucent mud.
- [ ] Readable text contrast.

---

## Forbidden Patterns Check

- [ ] No gradients.
- [ ] No dotted borders.
- [ ] No internal shadows on rows/cards.
- [ ] No colored metric cards.
- [ ] No fake data.
- [ ] No duplicate export buttons.
- [ ] No vertical filter stacks on desktop.
- [ ] No fake table headers with empty body.

---

## Functional Checklist

- [ ] Backend GET `/api/analysis/product-actions/registry` returns 200 and valid JSON.
- [ ] Scope switching updates data.
- [ ] Filters apply correctly.
- [ ] Export CSV/XLSX downloads file.
- [ ] Empty state shown when no data.
- [ ] Loading skeleton shown while fetching.
- [ ] Back to Analytics Hub works.
- [ ] No console errors.
- [ ] No network errors.

---

## Verdict

- `REVIEW_PASS` — all checklist items pass, no forbidden patterns, runtime verified.
- `CHANGES_REQUESTED` — specific issues found, list them in `REVIEWER_REPORT.md`.
- `REVIEW_BLOCKED` — runtime unreachable, build fails, tests fail, or major functional breakage.

After verdict, write `REVIEWER_REPORT.md` and create the appropriate marker file (`REVIEW_PASS`, `CHANGES_REQUESTED`, or `REVIEW_BLOCKED`).
