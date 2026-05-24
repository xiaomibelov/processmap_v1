# RAG Context Output Examples

**Contour:** `feature/processmap-agent-rag-agent-preflight-integration-v1`  
**Date:** 2026-05-16  
**Agent 2 / Executor**

## Sample Files Created

| # | Role | Query/Area | Format | File |
|---|------|------------|--------|------|
| 1 | planner | Diagram performance lag | md | `PREFLIGHT_PLANNER_SAMPLE.md` |
| 2 | reviewer | Diagram performance review rules | json | `PREFLIGHT_REVIEWER_SAMPLE.json` |
| 3 | executor | What is forbidden for RAG? | md | `PREFLIGHT_EXECUTOR_SAMPLE.md` |
| 4 | executor | current ProcessMap test runtime | md | `PREFLIGHT_RUNTIME_SAMPLE.md` |

## Example 1 — Planner (Diagram Performance Lag)

**Key findings:**
- Runtime facts: clearvestnic.ru, :5180, :8088, /opt/processmap-test
- Bottleneck: React bundle ~95% CPU during diagram drag
- User rejections: 4 critical/high rejections on drag performance contours
- Contour facts: drag hot path (not_solved), ledger rework (not_solved), real drag engine (not_solved)
- Supporting docs: prior review reports, validation query results

**Usage:** Before writing PLAN.md, Agent 1 runs this to understand:
- What has already been tried and failed
- What user-visible acceptance criteria must be met
- What decisions constrain the approach

## Example 2 — Reviewer (Diagram Performance Review Rules)

**Key findings (JSON):**
- Agent 3 rules: GSD discipline, fresh 5180 proof, exact scenario, real mouse drag
- User rejections: all 4 active rejections surfaced with severity
- Validation facts: q1-diagram-review-pass rules, q7-agent3-diagram-review
- Supporting docs: review reports from prior contours

**Usage:** Before writing REVIEW_REPORT.md, Agent 3 runs this to understand:
- What exact scenario must be tested
- What prior rejections override formal passes
- What fresh runtime proof is required

## Example 3 — Policy (What is Forbidden for RAG?)

**Key findings:**
- Agent rules: RAG read-only, no auto-mutate, no PR/deploy without approval
- Decisions: no BPMN XML writes, no Product Actions auto-apply, AI drafts not truth
- Validation: q4-rag-forbidden-actions PASS

**Usage:** Any agent can run this to confirm boundaries before acting.

## Example 4 — Runtime (Current ProcessMap Test Runtime)

**Key findings:**
- Server: clearvestnic.ru
- Frontend: :5180 (nginx, HTTP 200, no-cache)
- Backend health: :8088/health (ok, redis healthy)
- Working dir: /opt/processmap-test
- Current branch: fix/lockfile-sync-test (8 uncommitted frontend files)

**Usage:** Agent 2 confirms runtime truth before implementation; Agent 3 confirms before review.
