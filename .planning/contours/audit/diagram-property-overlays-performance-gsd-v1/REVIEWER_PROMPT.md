# Agent 3 / Reviewer Prompt

## Contour
- **ID**: `audit/diagram-property-overlays-performance-gsd-v1`
- **Run ID**: `20260514T220133Z-82898`
- **Role**: Agent 3 / Reviewer
- **Scope**: Review audit outputs for completeness, accuracy, and actionability.

## Hard Rules

- **NO product code changes**.
- **NO BPMN XML mutation**.
- **NO backend schema/storage changes**.
- **NO deploy/PR/merge/commit**.
- Read-only verification only.

## Pre-review Checklist

Read all audit outputs:
1. `PLAN.md`
2. `EXECUTOR_PROMPT.md`
3. `EXEC_REPORT.md`
4. `PERFORMANCE_AUDIT_REPORT.md`
5. `SOURCE_MAP.md`
6. `NETWORK_EVIDENCE.md`
7. `ROOT_CAUSE_HYPOTHESES.md`
8. `FIX_RECOMMENDATIONS.md`
9. Evidence files in `evidence/`
10. Project Atlas note at `/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Property Overlays Performance Audit.md`

## Review Tasks

### Task 1 — Runtime Reproduction (if Playwright available)

Re-run at least one runtime scenario (preferably Scenario C — overlay visibility) with Playwright/browser automation:
- Verify network capture matches Agent 2's findings;
- Verify console errors/warnings documented;
- Verify overlay/DOM behavior matches report.

If Playwright unavailable, document `PLAYWRIGHT_UNAVAILABLE` and do manual verification.

### Task 2 — Checklist Verification

Verify each item:

| # | Check | Pass Criteria |
|---|-------|---------------|
| 1 | Evidence exists | At least network + console + screenshot or detailed observation notes |
| 2 | Source map is concrete | Exact file paths, function names, line references where possible |
| 3 | Hypotheses are evidence-based | Each ranked hypothesis cites specific evidence |
| 4 | Network findings are specific | Exact endpoint URLs, request counts, duplicate counts |
| 5 | Overlay findings are specific | Exact DOM classes, overlay counts, before/after numbers |
| 6 | No product code changed | `git diff --name-only` shows no changes outside `.planning/` |
| 7 | No secrets | No API keys, tokens, passwords in any report |
| 8 | Recommendations are bounded and actionable | P0 references exact files/functions; no vague "optimize" statements |
| 9 | Project Atlas note exists | File present at expected path |
| 10 | Clear next contour proposal | Report suggests specific follow-up contour ID and scope |

### Task 3 — Fail Conditions

Review **FAILS** if any of:
- Report is generic (no specific files, no specific endpoints);
- No runtime evidence (no network log, no console capture, no screenshots, no observation notes);
- No source map (or source map is just grep output without analysis);
- No network/request evidence;
- No overlay-specific analysis;
- Recommendations are vague (e.g., "improve performance" without specifics);
- Product files were changed;
- Missing Project Atlas note;
- No clear next contour proposal.

### Task 4 — Pass/Fail Action

**If FAIL**:
1. Create `CHANGES_REQUESTED` marker;
2. Create `REWORK_REQUEST.md` with:
   - Specific missing items;
   - Required evidence;
   - Suggested method to obtain it;
   - Priority order for rework.

**If PASS**:
1. Create `REVIEW_REPORT.md` with:
   - Summary of what was reviewed;
   - Verification results per checklist;
   - Confidence level for each hypothesis;
   - Recommended next contour ID and scope;
   - Any caveats or risks.
2. Create `REVIEW_PASS` marker.

## Review Output Format

### REVIEW_REPORT.md sections:

```markdown
# Review Report: audit/diagram-property-overlays-performance-gsd-v1

## Reviewer
Agent 3 / Reviewer

## Date
YYYY-MM-DDTHH:MM:SSZ

## Artifacts Reviewed
- [ ] PLAN.md
- [ ] EXEC_REPORT.md
- [ ] PERFORMANCE_AUDIT_REPORT.md
- [ ] SOURCE_MAP.md
- [ ] NETWORK_EVIDENCE.md
- [ ] ROOT_CAUSE_HYPOTHESES.md
- [ ] FIX_RECOMMENDATIONS.md
- [ ] Evidence files
- [ ] Project Atlas note

## Verification Results
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Evidence exists | PASS/FAIL | ... |
| ... | ... | ... | ... |

## Hypothesis Confidence
| ID | Confidence | Notes |
|----|-----------|-------|
| H1 | High/Medium/Low | ... |

## Next Contour Recommendation
- **ID**: suggested-contour-id
- **Scope**: what should be built/fixed
- **Depends on**: any prerequisites

## Caveats and Risks
- ...

## Verdict
PASS / CHANGES_REQUESTED
```

## Success Criteria

- All 10 checklist items evaluated;
- Verdict is explicit PASS or CHANGES_REQUESTED;
- If CHANGES_REQUESTED, REWORK_REQUEST.md is specific and actionable;
- If PASS, next contour is clearly defined.
