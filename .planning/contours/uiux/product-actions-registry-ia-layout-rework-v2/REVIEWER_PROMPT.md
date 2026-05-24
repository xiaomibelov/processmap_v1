# REVIEWER_PROMPT — uiux/product-actions-registry-ia-layout-rework-v2

> **Role:** Agent 3 / Reviewer  
> **Contour:** `uiux/product-actions-registry-ia-layout-rework-v2`  
> **Scope:** Playwright-based UI/UX review of Product Actions Registry screen

---

## Pre-flight

1. Read:
   - `PLAN.md`
   - `EXEC_REPORT.md`
   - `RUNTIME_NAVIGATION.md`
   - `RUNTIME_PROOF_CHECKLIST.md`
2. Read reviewer-owned UI skill if exists:
   - `/srv/obsidian/project-atlas/ProcessMap/Prompts/PROCESSMAP_AGENT3_UI_REVIEW_SKILL.md`
3. Install Playwright Chromium if needed:
   ```bash
   npx playwright install chromium
   ```

---

## Runtime inspection

1. Open browser via Playwright:
   - URL: `http://clearvestnic.ru:5180`
2. Navigate to registry:
   - Click "Реестр действий" in workspace explorer sidebar.
   - OR navigate directly to `?surface=product-actions-registry&scope=workspace`.
3. Take screenshots of:
   - Full page (top)
   - Header + scope + metrics area
   - Toolbar + table area
   - Bottom (sources section + footer)
   - Empty state (if reachable)
   - Light and dark themes (if toggle available)
4. Capture console messages.
5. Capture network requests (filter for errors).

---

## Critical checks

| # | Check | Pass criteria |
|---|-------|---------------|
| 1 | No "workspace" in user-facing UI | Must not appear in any visible text |
| 2 | No "frontend" in user-facing UI | Must not appear in any visible text |
| 3 | No "scope" in user-facing UI | Must not appear in any visible text |
| 4 | No "Сессии workspace" | Replaced with "Источники данных" or similar |
| 5 | No "read-only" / "Backend-агрегация" / "preview" | Replaced with user-facing copy |
| 6 | "Проекты" hidden/not clickable | TopBar back button absent on registry route |
| 7 | "Вернуться" secondary/passive | Either hidden or small text link; NOT a prominent button |
| 8 | Main object is registry table | Registry table visually dominates; session list is secondary |
| 9 | Source sessions secondary | Compact, collapsible, below registry table |
| 10 | Metrics before filters/table | Summary strip appears BEFORE toolbar and table |
| 11 | Filters compact toolbar | Filters are in one horizontal row with export/AI actions |
| 12 | AI button in toolbar | Located in registry toolbar, not inside session card |
| 13 | Export disabled at 0 rows | CSV/XLSX buttons have `disabled` state visually when 0 rows |
| 14 | One empty state only | Only ONE empty message inside table area |
| 15 | Empty state matches data | If sessions > 0 && actions = 0, message reflects that |
| 16 | No horizontal scrollbar | At 1280px+ viewport, no horizontal overflow |
| 17 | Light/dark readable | Contrast sufficient, no mud/muddiness |
| 18 | No console errors | No errors/warnings in browser console |
| 19 | No network errors | No 4xx/5xx on registry load |
| 20 | Navigation not broken | Ordinary project/session screens work normally |

---

## Review process

1. Compare runtime against `RUNTIME_PROOF_CHECKLIST.md`.
2. For each check, record:
   - Pass / Fail / Partial
   - Evidence (screenshot filename or DOM snippet)
   - Comment if needed
3. If ANY critical check fails:
   - Create `CHANGES_REQUESTED` marker file.
   - Create `REWORK_REQUEST.md` with specific items.
   - Do NOT create `REVIEW_PASS`.
4. If ALL critical checks pass:
   - Create `REVIEW_REPORT.md`.
   - Create `REVIEW_PASS` marker file.

---

## Boundary confirmation

- [ ] No backend changes observed.
- [ ] No BPMN XML mutation observed.
- [ ] No durable truth mutation observed.
- [ ] No AG-UI integration observed.
- [ ] No RAG changes observed.
- [ ] No `.env` or secrets exposed.

---

## Output

If passing:
- `REVIEW_REPORT.md`
- `REVIEW_PASS`

If failing:
- `CHANGES_REQUESTED`
- `REWORK_REQUEST.md` (binding instructions for Agent 2)
