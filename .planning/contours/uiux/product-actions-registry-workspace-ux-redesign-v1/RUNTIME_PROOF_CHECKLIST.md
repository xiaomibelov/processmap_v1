# Runtime Proof Checklist — Agent 3

> **Contour:** `uiux/product-actions-registry-workspace-ux-redesign-v1`  
> **Target surface:** Product actions registry / workspace analytics screen  
> **URL:** `http://clearvestnic.ru:5180/app?surface=product-actions-registry`

---

## Pre-review

- [ ] Read `PROCESSMAP_AGENT3_UI_REVIEW_SKILL.md` (Project Atlas) or this contour's fallback rubric.
- [ ] Read contour `PLAN.md`.
- [ ] Read contour `EXEC_REPORT.md`.
- [ ] Read `RUNTIME_NAVIGATION.md`.

## Runtime access

- [ ] Runtime opened through Playwright MCP / browser.
- [ ] Navigated to `?surface=product-actions-registry`.
- [ ] Target surface fully loaded and visible.

## Navigation

- [ ] TopBar `← Проекты` / `← К проекту` is **hidden, disabled, or visually inactive** on registry route.
- [ ] Back button **still works** on normal project/session screens (if verified).

## Page identity

- [ ] Title is clear and professional.
- [ ] Subtitle explains workspace-level analytics.
- [ ] No dashed-border debug "Workspace scope" block.

## Scope selector

- [ ] `Workspace` / `Проект` / `Сессия` look like a calm segmented control.
- [ ] Active scope is visually distinct.
- [ ] Disabled states work when no context.

## Metrics

- [ ] Metrics are in a compact single-row bar.
- [ ] No individual card-like bordered boxes.
- [ ] Labels quiet, values readable.

## Filters

- [ ] Filters are in a horizontal toolbar or compact bar.
- [ ] Not a huge vertical column.
- [ ] Reset button is secondary.
- [ ] All 7 filter selects functional.

## Empty state

- [ ] One unified empty state message.
- [ ] No fragmented empty messages across sections.
- [ ] Message explains what the registry is and why it's empty.

## Table

- [ ] High density.
- [ ] Hover is paint-only (no height change, no layout shift).
- [ ] No accidental horizontal scrollbar.
- [ ] Completeness indicators are quiet badges.

## Theme

- [ ] Dark theme readable.
- [ ] Light theme readable.
- [ ] No muddy translucent backgrounds.

## States

- [ ] Loading state checked.
- [ ] Empty state checked.
- [ ] Error state checked (if triggered).
- [ ] Filtered-empty state checked.

## Diagnostics

- [ ] Console checked — no errors related to registry.
- [ ] Network checked — no failed registry API calls.
- [ ] Screenshot evidence captured.

## ProcessMap-specific

- [ ] No BPMN XML mutation.
- [ ] No auto-mutation of product actions.
- [ ] Accepted actions remain durable truth.
- [ ] AI suggestions clearly distinguished from accepted actions.

## Finalization

- [ ] `REVIEW_REPORT.md` written.
- [ ] Correct marker created:
  - `REVIEW_PASS` on pass
  - `CHANGES_REQUESTED` + `REWORK_REQUEST.md` on fail
  - `REVIEW_BLOCKED.md` on blocked

---

> **Rule:** If any mandatory item is unchecked without justification, verdict must be `REVIEW_BLOCKED` until the gap is closed.
