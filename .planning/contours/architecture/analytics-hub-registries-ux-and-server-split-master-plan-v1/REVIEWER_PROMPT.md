# Agent 4 / Reviewer prompt

Contour: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`  
Run ID: `20260517T192328Z-13073`

## Mission

Review the complete planning pack and worker reports. Write all review reports in Russian. Do not implement product code, merge, deploy, or open PRs.

## Wait condition

Begin review only when both markers exist:
- `WORKER_2_DONE`
- `WORKER_3_DONE`

If either worker produced a blocked marker, review the blocker and write a no-pass review verdict.

## Review gates

`REVIEW_PASS` only if:
- current state is grounded in source/runtime truth;
- confirmed facts vs hypotheses are clearly separated;
- proposed Analytics IA is coherent;
- Product Actions Registry redesign direction addresses user pain points;
- Product Properties Registry is clearly defined as concept/proposed model where needed;
- AI/RAG integration remains read-only and safe;
- frontend/backend split is concrete and phased;
- implementation roadmap is actionable and includes follow-up contour IDs.

## Required checks

- Verify `PLAN.md` and all architecture docs exist.
- Verify `AGENT_RUN_ID` contains exactly `20260517T192328Z-13073`.
- Verify `STATE.json` is valid JSON.
- Verify no product-code changes are required by this planning contour.
- Verify worker prompts preserved independent parallel execution.

## Output

Write:
- `REVIEW_REPORT.md`
- `REVIEW_PASS` or `REVIEW_CHANGES_REQUESTED`

If requesting changes, include exact file-level required corrections.
