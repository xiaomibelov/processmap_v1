# REVIEWER_PROMPT — perf/session-analysis-bpmn-tab-switch-load-regression-v1

## Your Role
Agent 3 / Reviewer. You validate the fix via Playwright/browser runtime review. You DO NOT write product code.

## Read First

1. `PLAN.md` — plan, acceptance criteria, scope
2. `EXEC_REPORT.md` — Agent 2's report (if exists)
3. `RUNTIME_NAVIGATION.md` — exact reproduction route
4. `RUNTIME_PROOF_CHECKLIST.md` — mandatory checks

## UI Review Skill (if exists)

Check `/srv/obsidian/project-atlas/ProcessMap/Prompts/PROCESSMAP_AGENT3_UI_REVIEW_SKILL.md` and apply its guidance.

## Runtime Validation Procedure

1. Open browser
2. Navigate to `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`
3. Open DevTools → Network tab
4. Open DevTools → Console tab
5. Perform this exact cycle **3 times**:
   - Click **"Анализ процессов"**
   - Wait until analysis content is visible (bounds block or timeline table)
   - Click **"Diagram (BPMN)"**
   - Wait until BPMN canvas is visible
6. After the 3rd cycle, inspect:

### Network Checks

- [ ] No `PATCH /api/sessions/4c515d1c6e` requests triggered by tab switch
- [ ] No `PUT /api/sessions/4c515d1c6e/bpmn` requests triggered by tab switch
- [ ] `GET /api/sessions/4c515d1c6e/bpmn/versions?limit=1` appears **at most once** per switch
- [ ] No more than 3 total `GET /bpmn/versions?limit=1` calls across all 6 switches
- [ ] No 409 Conflict errors from session endpoint
- [ ] No obvious duplicate request storms

### Console Checks

- [ ] No new uncaught errors related to tab switching
- [ ] No repeated 409 error logs

### UI Checks

- [ ] Subsequent tab switches feel fast (visually < 500 ms)
- [ ] No full-screen loader when data already loaded
- [ ] No duplicate version/limit toasts or notifications
- [ ] BPMN diagram remains fully interactive
- [ ] Analysis tab remains fully interactive
- [ ] Ordinary save/version behavior still works (if feasible to test)

## Acceptance Criteria

PASS only if **ALL** of the above pass.

## Review Outcomes

### If PASS
- Create `REVIEW_PASS` file in the contour directory
- Write brief `REVIEW_REPORT.md` summarizing validation results

### If MINOR Issues Remain
- Create `CHANGES_REQUESTED` file
- Write `REWORK_REQUEST.md` with:
  - Exact issue description
  - Reproduction steps
  - Required fix
  - Files to change
- Do NOT create `REVIEW_PASS`

### If BLOCKED
- Create `REVIEW_BLOCKED.md` with:
  - Exact blocker description
  - Why fix cannot be validated
  - Whether Agent 2 needs to restart or user intervention is needed
- Do NOT create `REVIEW_PASS`

## Non-goals for Review

- Do NOT rewrite Agent 2's fix
- Do NOT add new features
- Do NOT change backend/schema
- Do NOT approve if even one acceptance criterion fails
