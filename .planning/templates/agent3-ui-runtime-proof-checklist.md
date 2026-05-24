# Agent 3 — UI Runtime Proof Checklist

> **Purpose:** quick checklist for Agent 3 to verify that all mandatory runtime review steps were completed before rendering a verdict.  
> **All items must be checked.** If an item is not applicable, write "N/A" with a one-line justification.

---

## Pre-review

- [ ] Skill read (`PROCESSMAP_AGENT3_UI_REVIEW_SKILL.md`)
- [ ] Binding read (`PROCESSMAP_AGENT3_PLAYWRIGHT_REVIEW_BINDING.md`)
- [ ] Contour `PLAN.md` read
- [ ] Contour `EXEC_REPORT.md` read
- [ ] GSD availability checked
- [ ] Source/runtime truth recorded
- [ ] Exact user scenario identified before testing

## Runtime access

- [ ] Runtime opened through Playwright MCP / browser
- [ ] Target surface reached
- [ ] Interaction checked (hover, click, selection, scroll)

## Diagnostics

- [ ] Console checked
- [ ] Network checked
- [ ] Screenshot / evidence captured or justified

## UI rubric — interaction

- [ ] Hover state checked (if relevant)
- [ ] Selected state checked (if relevant)
- [ ] Layout shift checked (if relevant)
- [ ] Buttons have visible hover / focus affordance

## UI rubric — appearance

- [ ] Light theme checked
- [ ] Dark theme checked
- [ ] Narrow viewport checked (if relevant)
- [ ] Long text checked (if relevant)

## UI rubric — states

- [ ] Empty state checked (if relevant)
- [ ] Loading state checked (if relevant)
- [ ] Error state checked (if relevant)

## ProcessMap-specific

- [ ] Product Actions rules checked (if relevant)
- [ ] RAG rules checked (if relevant)
- [ ] Analysis table rules checked (if relevant)
- [ ] No BPMN XML mutation checked (if relevant)
- [ ] Lane display compact and correct (if relevant)

- [ ] UI/UX Pro Max discipline checked
  - [ ] Design system documented in EXEC_REPORT.md
  - [ ] Contrast ≥ 4.5:1 verified
  - [ ] Focus states visible
  - [ ] Touch targets ≥ 44×44px
  - [ ] Animation timing 150–300ms
  - [ ] `prefers-reduced-motion` respected
  - [ ] No emoji icons
  - [ ] Semantic color tokens
  - [ ] Loading skeletons (not spinners)
  - [ ] `aria-label` on icon-only buttons

## Finalization

- [ ] Verdict written in `REVIEW_REPORT.md`
- [ ] Reviewer GSD discipline section present in REVIEW_REPORT.md
- [ ] REVIEW_PASS forbidden if user-visible scenario still materially fails
- [ ] Correct marker file(s) created
  - `REVIEW_PASS` for pass
  - `CHANGES_REQUESTED` + `REWORK_REQUEST.md` for fail
  - `REVIEW_BLOCKED.md` for blocked

---

> **Rule:** If any mandatory item is unchecked without justification, the verdict must be `REVIEW_BLOCKED` until the gap is closed.
