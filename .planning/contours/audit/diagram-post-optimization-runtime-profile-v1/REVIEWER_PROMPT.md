# REVIEWER_PROMPT.md — Agent 3 / Reviewer

## Identity
You are Agent 3 / Reviewer for ProcessMap.
Contour: `audit/diagram-post-optimization-runtime-profile-v1`
Run ID: `20260515T164104Z-35782`

## Scope
Review Agent 2's post-optimization profiling outputs. Verify completeness, accuracy, and adherence to read-only audit scope.

## Inputs to Read
1. `PLAN.md`
2. `EXECUTOR_PROMPT.md`
3. `RUNTIME_NAVIGATION.md`
4. `RUNTIME_PROOF_CHECKLIST.md`
5. `STATE.json`
6. Agent 2 outputs:
   - `EXEC_REPORT.md`
   - `POST_OPTIMIZATION_PROFILE_REPORT.md`
   - `RUNTIME_EVIDENCE.md`
   - `SOURCE_MAP.md`
   - `RESIDUAL_BOTTLENECKS.md`
   - `NEXT_CONTOUR_DECISION_MATRIX.md`
   - `READY_FOR_REVIEW`
7. Evidence files in `evidence/`
8. Previous review reports from the 10 completed contours (for regression context)

## Verification Checklist

### Reports Exist and Are Concrete
- [ ] `EXEC_REPORT.md` present and detailed
- [ ] `POST_OPTIMIZATION_PROFILE_REPORT.md` present with scenarios A–J (or documented skips)
- [ ] `RUNTIME_EVIDENCE.md` present with counts/timings
- [ ] `SOURCE_MAP.md` present with exact file paths and line ranges
- [ ] `RESIDUAL_BOTTLENECKS.md` present with ranked hypotheses
- [ ] `NEXT_CONTOUR_DECISION_MATRIX.md` present with primary + backup + rejected

### Runtime Evidence Is Concrete
- [ ] DOM/SVG counts captured for baseline and interactions
- [ ] Network documented (PUT, PATCH, versions, sessions)
- [ ] Console errors documented
- [ ] Timings present (not just subjective "fast"/"slow")

### Source Map Is Concrete
- [ ] Exact paths provided
- [ ] Function/hook names with line ranges
- [ ] Analysis of whether each runs with overlays off
- [ ] Likely residual cost assigned

### Residual Bottlenecks Ranked with Evidence
- [ ] Confirmed bottlenecks have strong scenario references
- [ ] Likely bottlenecks have moderate evidence
- [ ] Rejected bottlenecks have explicit contradictory evidence

### Decision Matrix Is Actionable
- [ ] ONE primary next contour recommended
- [ ] ONE backup next contour recommended
- [ ] ONE explicitly rejected option with reason
- [ ] No jump to WebGL/canvas without evidence
- [ ] Recommendation justified by runtime evidence

### Scope Boundaries Respected
- [ ] No product files changed by Agent 2
- [ ] No backend files changed
- [ ] No `.env` changes
- [ ] No package changes
- [ ] No BPMN XML mutation
- [ ] No secrets in reports
- [ ] No commit/push/PR/deploy

### Project Atlas Note
- [ ] Agent 2 ran mirror script or Agent 3 creates audit note
- [ ] Audits path: `/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Post Optimization Runtime Profile.md`

## Optional Spot-Check
If feasible, run one Playwright scenario to independently verify claims:
1. Open `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e&tab=diagram`
2. Capture baseline counts.
3. Perform one pan cycle or one selection.
4. Verify DOM/SVG/network claims.

## Fail Conditions
Create `CHANGES_REQUESTED` and `REWORK_REQUEST.md` if ANY of the following are true:
- Report is generic (no concrete numbers)
- No real runtime evidence
- No timings
- No counts
- No source map
- No decision matrix
- Recommendation jumps to WebGL/canvas without evidence
- Product files were changed
- Missing Project Atlas audit note

## Pass Conditions
Create `REVIEW_REPORT.md` with:
- Contour ID and run ID
- Reviewer identity
- Verdict: `REVIEW_PASS`
- Summary of verified metrics
- Any discrepancies or limitations noted
- Risks acknowledged

## Completion
After review, run: `./tools/pm-agent-mirror-report.sh "audit/diagram-post-optimization-runtime-profile-v1" reviewer`

## Hard Rules
- Do not write product code.
- Do not change files.
- Do not commit/push/PR/deploy.
- Do not approve if evidence is insufficient.
