# Agent 3 — Reviewer Prompt

> **Contour:** `uiux/product-actions-registry-workspace-ux-redesign-v1`  
> **Scope:** UI/UX review of product actions registry screen  
> **Role:** Agent 3 / Reviewer

---

## Pre-review mandatory reads

1. Read `PROCESSMAP_AGENT3_UI_REVIEW_SKILL.md` from Project Atlas:
   `/srv/obsidian/project-atlas/ProcessMap/Prompts/PROCESSMAP_AGENT3_UI_REVIEW_SKILL.md`
   - If unavailable, use the checklist from this contour's `RUNTIME_PROOF_CHECKLIST.md`.
2. Read this contour's `PLAN.md`.
3. Read this contour's `EXECUTOR_PROMPT.md`.
4. Read Agent 2's `EXEC_REPORT.md`.

---

## Your mission

Independently verify the UI/UX redesign of the ProcessMap product actions registry screen through **real runtime inspection**.

---

## Runtime inspection protocol

1. Open the ProcessMap runtime via Playwright MCP:
   - URL: `http://clearvestnic.ru:5180`
2. Navigate to the registry screen:
   - Route: `?surface=product-actions-registry` (or use in-app navigation if available).
3. Interact with the UI:
   - Hover over table rows.
   - Click scope tabs.
   - Open/close filters if collapsible.
   - Scroll.
4. Check console errors and network failures.
5. Capture screenshots or document evidence.

---

## What to verify

### Navigation / TopBar
- [ ] `← Проекты` / `← К проекту` button is **hidden, disabled, or visually inactive** on registry route.
- [ ] Normal project/session screens still show the back button correctly.

### Page identity
- [ ] Title is clear: "Реестр действий с продуктом".
- [ ] Subtitle explains workspace-level analytics (not debug/preview language).
- [ ] No dashed-border debug-looking "Workspace scope" block.

### Scope selector
- [ ] `Workspace` / `Проект` / `Сессия` are clear and calm.
- [ ] Active scope is visually distinct.
- [ ] Disabled states work when no context.

### Metrics
- [ ] Summary metrics are compact and in a single row.
- [ ] No card-like bordered boxes for each metric.
- [ ] Labels quiet, values readable.

### Filters
- [ ] Filters are in a horizontal toolbar or compact bar.
- [ ] Not a huge vertical column or cramped 7-column grid.
- [ ] Reset button is secondary.
- [ ] Readable in dark and light themes.

### Empty state
- [ ] One unified empty state (not fragmented messages).
- [ ] Explains what the registry is and why it's empty.
- [ ] Provides actionable next step if applicable.

### Table
- [ ] High density.
- [ ] Hover is paint-only (no height change, no layout shift).
- [ ] No accidental horizontal scrollbar.
- [ ] Completeness indicators are quiet badges, not banners.

### Theme
- [ ] Dark theme is readable (contrast, no muddy backgrounds).
- [ ] Light theme is readable.

### Console / Network
- [ ] No console errors related to the registry.
- [ ] No failed network requests related to the registry.

### ProcessMap-specific
- [ ] No BPMN XML mutation.
- [ ] No auto-mutation of product actions.
- [ ] Accepted actions remain durable truth.

---

## Verdict

### REVIEW_PASS
- All checks above pass.
- Evidence recorded in `REVIEW_REPORT.md`.
- Create `REVIEW_PASS` marker.

### CHANGES_REQUESTED
- Any rubric item fails.
- Write specific, actionable items in `REWORK_REQUEST.md`.
- Create `CHANGES_REQUESTED` marker.
- Agent 2 will fix only what you list.

### REVIEW_BLOCKED
- Playwright MCP unavailable or runtime cannot be opened.
- Create `REVIEW_BLOCKED.md` with reason.

---

## Output files

Always create `REVIEW_REPORT.md`.

Then create exactly one of:
- `REVIEW_PASS`
- `CHANGES_REQUESTED` + `REWORK_REQUEST.md`
- `REVIEW_BLOCKED.md`

---

## Rules

- You cannot pass this UI contour from source review alone.
- Do not modify product code.
- Do not commit/push/deploy.
