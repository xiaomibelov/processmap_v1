# Agent 3 / Reviewer Prompt

## Contour
- **ID**: `fix/diagram-non-edit-put-bpmn-guard-v1`
- **Scope**: Frontend bounded guard preventing `PUT /bpmn` or `PATCH /sessions` from non-edit Diagram interactions.
- **Run ID**: `20260515T094031Z-11870`

## What You Must Do

1. **Read planning artifacts**:
   - `PLAN.md`
   - `EXEC_REPORT.md`
   - `MUTATION_BEFORE_AFTER.md`
   - `IMPLEMENTATION_NOTES.md`
   - `RUNTIME_PROOF_CHECKLIST.md`

2. **Playwright/browser review** against runtime `http://clearvestnic.ru:5180`.

3. **Verify acceptance criteria**:
   - [ ] Diagram idle: 0 `PUT /bpmn`, 0 `PATCH /sessions` over 30s.
   - [ ] Pan/zoom: 0 `PUT /bpmn`, 0 `PATCH /sessions`.
   - [ ] Hover/selection/overlay visibility: 0 `PUT /bpmn`, 0 `PATCH /sessions`.
   - [ ] Property sidebar open/focus/blur without value change: 0 durable mutation requests.
   - [ ] Analysis ↔ Diagram tab switch: 0 `PUT /bpmn`, 0 `PATCH /sessions`.
   - [ ] XML ↔ Diagram tab switch: 0 `PUT /bpmn`, 0 `PATCH /sessions`.
   - [ ] Explicit save/edit path preserved (if safe to verify).
   - [ ] Versions head-check dedupe not regressed.
   - [ ] Overlay viewport-culling not regressed.
   - [ ] No new console errors.
   - [ ] No unrelated files changed.

4. **If even minor issue remains**:
   - `CHANGES_REQUESTED`
   - `REWORK_REQUEST.md`
   - No `REVIEW_PASS`.

5. **If pass**:
   - `REVIEW_REPORT.md`
   - `REVIEW_PASS`.

## What You Must NOT Do

- Do NOT write product code.
- Do NOT commit/push/PR/deploy.
- Do NOT mutate durable truth.

## REVIEW_REPORT.md Template

```markdown
# Review Report — fix/diagram-non-edit-put-bpmn-guard-v1

## Run ID
20260515T094031Z-11870

## Reviewer
Agent 3 / Reviewer

## Date
YYYY-MM-DD

## Artifacts Reviewed
- [x] PLAN.md
- [x] EXEC_REPORT.md
- [x] MUTATION_BEFORE_AFTER.md
- [x] IMPLEMENTATION_NOTES.md
- [x] RUNTIME_PROOF_CHECKLIST.md

## Verification Results
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Diagram idle no mutation | PASS/FAIL | ... |
| 2 | Pan/zoom no mutation | PASS/FAIL | ... |
| 3 | Hover/selection no mutation | PASS/FAIL | ... |
| 4 | Tab switch no mutation | PASS/FAIL | ... |
| 5 | Property sidebar no mutation | PASS/FAIL | ... |
| 6 | Explicit save preserved | PASS/FAIL | ... |
| 7 | Same XML hash guard | PASS/FAIL | ... |
| 8 | Import/init no dirty | PASS/FAIL | ... |
| 9 | No backend changes | PASS/FAIL | ... |
| 10 | No unrelated files changed | PASS/FAIL | ... |

## Verdict
REVIEW_PASS / CHANGES_REQUESTED
```
