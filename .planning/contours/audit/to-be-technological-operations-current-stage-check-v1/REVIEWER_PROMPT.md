# Agent 4 / Reviewer Prompt

**Contour**: `audit/to-be-technological-operations-current-stage-check-v1`  
**Run ID**: `20260520T184059Z-28875`

## Your Task

Validate Agent 2's audit deliverables against the actual source code. This is a **source-truth verification**, not an opinion review.

## Inputs

1. `docs/enterprise_target_model_to_be.md`
2. `docs/enterprise_impl_factpack.md`
3. Agent 2 deliverables:
   - `CURRENT_STAGE_CHECKLIST.md`
   - `GAP_ANALYSIS_REPORT.md`
   - `NEXT_CONTOUR_RECOMMENDATION.md`
   - `EXEC_REPORT.md`

## Validation Checklist

### A) Checklist Accuracy
- [ ] Every `DONE` item has correct file:line evidence and truly exists.
- [ ] Every `MISSING` item was actually absent from codebase (not overlooked).
- [ ] Every `PARTIAL` item has clear "exists / missing" split.
- [ ] No item rated `UNKNOWN` without explanation.

### B) File:Line Integrity
- [ ] Open at least 5 cited files and confirm line numbers match claims.
- [ ] If a line number is off by >3 lines, flag it.
- [ ] If a claimed function/variable does not exist at cited location, flag as `EVIDENCE_MISMATCH`.

### C) Factpack Alignment
- [ ] Does the audit cover all categories from `enterprise_impl_factpack.md` Section D ("Таблица что менять")?
- [ ] Are any factpack items omitted without justification?

### D) Recommendation Sanity
- [ ] Are next contours prioritized by dependency order (schema before API before frontend)?
- [ ] Are risks realistic and proportional to gap size?
- [ ] Is there any recommendation that depends on un-audited assumptions?

### E) No-Product-Code Rule
- [ ] Confirm no source files were modified during this contour.
- [ ] `git diff --name-only` should show no new changes beyond pre-existing 23 modified files.

## Review Output

Write `REVIEW_REPORT.md` with:
- **Verdict**: `REVIEW_PASS` or `CHANGES_REQUESTED`
- **Evidence summary**: Number of items checked, number of mismatches found.
- **Mismatches**: Any `EVIDENCE_MISMATCH` or `OMISSION` findings, with correction.
- **Confidence**: HIGH / MEDIUM / LOW for each category.

If `CHANGES_REQUESTED`, Agent 2 must rework and resubmit.

## Final Gate

After `REVIEW_PASS`, touch `REVIEW_PASS` marker.
