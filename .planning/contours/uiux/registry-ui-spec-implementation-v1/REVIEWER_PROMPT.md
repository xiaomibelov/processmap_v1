# REVIEWER PROMPT — Product Actions Registry UI Spec Implementation

**Agent:** Agent 4  
**Contour:** `uiux/registry-ui-spec-implementation-v1`  
**Run ID:** `20260522T072413Z-agent1-plan`  
**Scope:** Independent review of both frontend and backend against UI_SPEC.md

---

## 1. Source of Truth

The ONLY authoritative spec is `.planning/contours/uiux/registry-ui-spec-implementation-v1/UI_SPEC.md`.

Read it in full before reviewing. Pay special attention to:
- §1 Design Tokens (colors, typography, spacing, shadows)
- §2 Global Page Structure (single container rule)
- §3 Реестр действий (all subsections)
- §7 Backend View-Model Contract
- §8 Forbidden Anti-Patterns

---

## 2. Review Checklist

### Frontend Review

| # | Check | Verdict |
|---|---|---|
| 1 | Only ONE white container per page, radius 12px, padding 24px | |
| 2 | No nested card chaos, no gradients, no internal shadows on rows | |
| 3 | Title is exactly "Реестр действий", subtitle correct | |
| 4 | Export dropdown exists in header ONLY, options CSV/XLSX | |
| 5 | Scope tabs: [Все действия] [По продуктам] [По сессиям], backend-driven | |
| 6 | Metrics row: no cards, no backgrounds, clean text only | |
| 7 | Заполненность colored green ≥80%, orange <80% | |
| 8 | Filters horizontal row, backend-driven `filter_options`, no hardcoding | |
| 9 | Warning row: soft text, orange icon, NOT a banner/card | |
| 10 | AI controls row: purple icon, ghost button, above table | |
| 11 | Table columns: Действие | Продукт | Сессия | Источник | Статус | Дата | |
| 12 | Status badges: colored dot + text, NO background fills | |
| 13 | Row height 48px, hover #FAFAFA, no shadow on hover | |
| 14 | Source section: list with indicators, NO cards, NO dotted border | |
| 15 | Empty state: centered, icon, honest message, no fake data | |
| 16 | Loading skeleton: gray bars, not spinners, not full-page overlay | |
| 17 | Build passes: `npm run build` exits 0 | |
| 18 | Frontend tests pass: `npm test` exits 0 | |

### Backend Review

| # | Check | Verdict |
|---|---|---|
| 19 | `GET /api/analysis/product-actions/registry` exists and returns 200 | |
| 20 | Response wraps data in `view_model` key | |
| 21 | `view_model` contains all required fields per UI_SPEC.md §7.1 | |
| 22 | `metrics` computed honestly from data, not hardcoded | |
| 23 | `filter_options` derived from actual data, not hardcoded | |
| 24 | `empty_state` populated when `items` is empty | |
| 25 | `warnings` populated when incomplete data detected | |
| 26 | Existing POST endpoints still work (backward compatibility) | |
| 27 | Backend tests pass: `pytest tests/test_product_actions_registry_api.py -v` | |

### Runtime Review

| # | Check | Verdict |
|---|---|---|
| 28 | `curl -I http://clearvestnic.ru:5180` returns HTTP 200 | |
| 29 | Registry page renders with new layout in browser | |
| 30 | GET endpoint returns correct JSON when hit directly | |
| 31 | Screenshot evidence provided by Agent 3 | |

---

## 3. Review Process

1. Read `EXEC_REPORT.md` from Agent 3.
2. Check out the branch `uiux/registry-ui-spec-implementation-v1`.
3. Run `git diff --stat` to see files changed.
4. Run `git diff` on key files (RegistryLayout, DataTable, product_actions_registry.py).
5. Run build and tests yourself.
6. Verify runtime on `:5180`.
7. For each checklist item, mark PASS, FAIL, or N/A.
8. If any item FAILs, file detailed feedback in `REVIEW_FEEDBACK.md` with:
   - Item number and description
   - Expected behavior
   - Actual behavior
   - Suggested fix
   - File/line reference

---

## 4. Verdict Rules

- **PASS**: All 31 checklist items pass.
- **CHANGES_REQUESTED**: Any item fails. Provide specific, actionable feedback.
- **BLOCKED**: Runtime not serving, build broken, or tests fail. Stop and report immediately.

---

## 5. Deliverables

1. `REVIEW.md` — checklist with verdicts.
2. `REVIEW_FEEDBACK.md` — only if CHANGES_REQUESTED.
3. Mirror report to Obsidian via `./tools/pm-agent-mirror-report.sh`.

---

*End of REVIEWER_PROMPT.md*
