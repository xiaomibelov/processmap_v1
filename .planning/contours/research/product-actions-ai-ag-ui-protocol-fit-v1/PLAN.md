# research/product-actions-ai-ag-ui-protocol-fit-v1

## GSD Discipline

### GSD Availability Result
- `which gsd`: not found
- `which gsd-sdk`: not found
- `find /opt/processmap-test -maxdepth 4 -iname "*gsd*"`: only `/opt/processmap-test/docs/gsd` directory found (documentation, not CLI/tools)
- `find ~/.claude ~/.kimi ~/.config -maxdepth 4 -iname "*gsd*"`: nothing found

### Mode Used
**GSD_FALLBACK_MANUAL_PLANNING_ONLY**

### Confirmation Checklist
- [x] Implementation was NOT performed by Agent 1
- [x] Product files were NOT changed by Agent 1
- [x] Contour is bounded: research/architecture fit only, no code changes
- [x] Agent 2 / Agent 3 gates are prepared and documented below
- [x] No package installation attempted
- [x] No commit/push/PR performed
- [x] No deploy performed
- [x] No RAG bootstrap performed
- [x] No MCP repair performed
- [x] No durable truth mutated
- [x] No BPMN XML mutated

### GSD Gate Status
- Gate 1 — GSD discipline completed: **PASS**

---

## Source / Runtime Truth

| Item | Value |
|------|-------|
| repo root | /opt/processmap-test |
| branch | fix/lockfile-sync-test |
| HEAD | a9a9d9c5f468d9da63415306da6d34dcd605aa0d |
| origin/main | d805e1c64c1107b9e3fe6854e031694bf741b187 |
| git status -sb | M .env; M frontend/src/components/AppShell.jsx; M frontend/src/components/TopBar.jsx; M frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs; M frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx; M frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs; M frontend/src/styles/tailwind.css; plus untracked files |
| runtime frontend URL | http://clearvestnic.ru:5180 |
| runtime API URL | http://clearvestnic.ru:8088 |
| API health | `{"ok":true,"status":"ok","redis":...}` — healthy |
| frontend health | HTTP/1.1 200 OK |
| Project Atlas path | /srv/obsidian/project-atlas |
| contour path | /opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1 |

### Active Related Contours (from .planning/contours)
- `tooling/mcp-servers-inventory-and-repair-v1` — READY_FOR_EXECUTION
- `tooling/processmap-agent3-ui-review-skill-binding-v1` — REVIEW_PASS
- `tooling/project-atlas-server-docs-import-and-triage-v1` — READY_FOR_EXECUTION
- `tooling/project-atlas-sync-and-rag-bootstrap-v1` — READY_FOR_EXECUTION
- `uiux/product-actions-registry-workspace-ux-redesign-v1` — READY_FOR_EXECUTION, READY_FOR_REVIEW, REVIEW_PASS

**IMPORTANT**: This contour must NOT mix with:
- `uiux/product-actions-registry-workspace-ux-redesign-v1`
- `tooling/project-atlas-server-docs-import-and-triage-v1`
- `tooling/mcp-servers-inventory-and-repair-v1`

### Source/Runtime Truth Gate Status
- Gate 2 — Source/runtime truth captured: **PASS**

---

## Context

ProcessMap is evaluating whether the AG-UI protocol (https://github.com/ag-ui-protocol/ag-ui) can help with:
1. Product Actions AI batch orchestrator (moving from frontend-driven per-step to backend-owned batch)
2. AI batch progress/status stream
3. Draft suggestions review with human-in-the-loop
4. RAG-agent panel event standardization
5. Admin AI execution visibility

Preliminary hypothesis: AG-UI is an Agent ↔ UI event protocol, not a UI kit. It may be useful as an internal event contract or adapter layer, but not necessarily as a direct dependency.

### Research Source Map Defined
- Gate 3 — Research source map defined: **PASS**

### ProcessMap AI Architecture Source Map Defined
- Gate 4 — ProcessMap AI architecture source map defined: **PASS**

---

## Goals

1. Research AG-UI protocol: event taxonomy, lifecycle, transport, SDKs, maturity
2. Assess fit with Product Actions AI batch orchestrator
3. Assess fit with RAG-agent panel
4. Assess fit with Admin AI governance / execution log
5. Define draft vs durable boundary using AG-UI or internal contract
6. Compare 4 architecture options and recommend one
7. Produce decision package in Project Atlas
8. Prepare future implementation contour prompt if recommendation is not NO-GO

---

## Non-goals

1. **NO implementation of AG-UI in product code**
2. **NO UI redesign** — that belongs to `uiux/product-actions-registry-workspace-ux-redesign-v1`
3. **NO Product Actions backend implementation** — that belongs to a future `feature/product-actions-ai-server-batch-orchestrator-v1`
4. **NO RAG bootstrap or index building** — that belongs to `tooling/project-atlas-sync-and-rag-bootstrap-v1`
5. **NO MCP repair** — that belongs to `tooling/mcp-servers-inventory-and-repair-v1`
6. **NO auto-apply of AI suggestions**
7. **NO BPMN XML mutation**
8. **NO durable truth mutation** (interview.analysis.product_actions[])
9. **NO package.json / lock file changes**
10. **NO commit/push/PR/deploy**
11. **NO secrets reading or output**
12. **NO frontend/backend product file changes**

---

## Research Questions

### A. What is AG-UI?
- What exactly does AG-UI standardize?
- What event types exist?
- How are lifecycle events structured?
- How are text/message events structured?
- How are tool call events structured?
- How are state snapshot/delta events structured?
- Are there human-in-the-loop / approval / interrupt patterns?
- What SDK/language bindings exist?
- What transport is assumed: HTTP streaming, SSE, WebSocket, other?
- Is there a Python/FastAPI compatible path?
- Is there a TypeScript/React frontend compatible path?
- How mature is the project?
- What dependencies/risks exist?

### B. Fit with Product Actions AI Batch Orchestrator
- Can AG-UI express: run started, pre-scan, skip existing, chunk started, chunk progress, draft suggestions generated, chunk failed/retryable, rate limit, user approval required, accept selected, accept all ready, reject/edit suggestion, run finished, run cancelled, run resumed?
- How to separate draft suggestions from durable truth?
- How to prevent auto-apply?
- How to explicitly enforce no BPMN XML mutation?
- How do AG-UI events map to current/future ProcessMap backend endpoints?

### C. Fit with RAG-agent Panel
- Can AG-UI express: search started, source candidates found, source opened, answer streaming, citations/sources, read-only suggestion?
- Is AG-UI needed for RAG or is plain SSE/REST sufficient?
- How to enforce no mutation boundary?

### D. Fit with Admin AI Governance
- How should events/logs flow into Admin AI execution log?
- Does AG-UI create a second parallel audit/logging layer?
- Which events need durable logging vs ephemeral streaming?
- How to connect runId/sessionId/workspaceId/projectId/sessionId/stepId?

### E. Architecture Options
Compare minimum 4 options:
1. **No AG-UI** — current REST/SSE/custom event contract
2. **AG-UI taxonomy only** — AG-UI-inspired internal event names/schema, no dependency
3. **AG-UI adapter layer** — backend exposes internal events, translates to AG-UI stream for frontend
4. **Native AG-UI integration** — use AG-UI SDK/protocol directly

For each: pros, cons, implementation cost, product risk, dependency risk, migration path, fit with no auto-mutation, fit with Admin AI governance, fit with React/Vite frontend, fit with FastAPI/Python backend, recommendation.

### F. Security / Safety
- Can AG-UI event stream leak secrets?
- How to filter prompt/user data from events?
- Which event payloads must NOT be logged?
- How to protect private process data?
- How to enforce org/workspace/project/session access control?
- Are server-side permissions needed per run/event?
- How to handle raw AI messages?
- Which data can be indexed in RAG and which cannot?

### G. Product Actions Draft/Durable Contract
- Propose candidate event/state contract
- Draft state: `interview.analysis.product_action_suggestions_draft` or existing equivalent
- Durable state: `interview.analysis.product_actions[]`
- AI stream must NOT write durable accepted actions
- Apply/Accept requires explicit user action
- Product Actions save must NOT write BPMN XML
- Batch run may save draft suggestions, not accepted actions

### Fit Questions Gate Status
- Gate 5 — Fit questions defined: **PASS**

### Non-goals Gate Status
- Gate 6 — Non-goals locked: **PASS**

---

## ProcessMap Source Map Targets

### Backend Expected Areas
- backend routes/controllers for AI modules / prompts / execution log
- backend Product Actions AI suggest endpoints
- backend sessions / interview analysis PATCH endpoints
- backend storage / schema for sessions / interview_json
- backend RAG endpoints if present
- backend streaming / SSE / WebSocket utilities if present
- backend auth / org / workspace access control utilities

### Frontend Expected Areas
- Product Actions panel / components
- Product Actions AI suggestion UI
- Product Actions batch review UI if exists
- RAG search / agent panel
- Admin AI modules / prompts / execution log UI
- API clients / hooks for AI calls
- state management for session / interview analysis
- current error / progress UI for AI calls

### Docs / Atlas Expected Areas
- /srv/obsidian/project-atlas/ProcessMap/RAG/
- /srv/obsidian/project-atlas/ProcessMap/Architecture/
- /srv/obsidian/project-atlas/ProcessMap/HANDOFF/
- /srv/obsidian/project-atlas/ProcessMap/Decisions/
- /srv/obsidian/project-atlas/ProcessMap/Prompts/
- /srv/obsidian/project-atlas/ProcessMap/Contours/

---

## AG-UI Source Map Targets

- https://github.com/ag-ui-protocol/ag-ui
- Official docs / README
- Package / source structure
- Examples / demos
- Event definitions / schema
- SDK / language support
- Transport layer assumptions
- Human-in-the-loop patterns
- Security model

---

## Deliverables

### For Project Atlas
1. `/srv/obsidian/project-atlas/ProcessMap/Architecture/AG-UI Protocol Fit for ProcessMap.md`
2. `/srv/obsidian/project-atlas/ProcessMap/Decisions/ADR-AG-UI-for-Product-Actions-AI.md`
3. `/srv/obsidian/project-atlas/ProcessMap/RAG/AG-UI-RAG-Agent-Fit.md`
4. `/srv/obsidian/project-atlas/ProcessMap/Prompts/AG-UI-Future-Implementation-Contour-Prompt.md`

### Inside Contour
5. `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/EXEC_REPORT.md`
6. `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/READY_FOR_REVIEW` (only if all requirements met)

### If Blocked
7. `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/EXEC_BLOCKED.md` (instead of READY_FOR_REVIEW)

---

## Agent 2 Execution Plan

1. Read PLAN.md, EXECUTOR_PROMPT.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json
2. Research AG-UI GitHub repo, official docs, package/source structure, examples, event definitions, SDK/language support
3. Research ProcessMap backend/frontend source map per "ProcessMap Source Map Targets"
4. Research Project Atlas existing notes
5. Do NOT write product code
6. Do NOT change frontend/backend product files
7. Do NOT change package.json / lock files
8. Do NOT install packages
9. Do NOT commit/push/PR/deploy
10. Do NOT bootstrap RAG
11. Do NOT repair MCP
12. Do NOT mutate durable truth
13. Do NOT read or output secrets
14. Create all required Atlas docs with required content
15. Create EXEC_REPORT.md
16. Create READY_FOR_REVIEW only if:
    - all required docs exist
    - recommendation is explicit
    - fit matrix exists
    - risk matrix exists
    - source references exist
    - no product code changed
    - no secrets touched
17. If blocked or incomplete, create EXEC_BLOCKED.md and do NOT create READY_FOR_REVIEW

---

## Agent 3 Review Plan

1. Read PLAN.md, EXEC_REPORT.md, RUNTIME_PROOF_CHECKLIST.md, all created Atlas docs
2. Verify Agent 2 performed actual research, not generic descriptions
3. Verify AG-UI described correctly as protocol, not UI-kit
4. Verify event model covered
5. Verify human-in-the-loop considered
6. Verify Product Actions batch fit covered
7. Verify RAG-agent fit covered
8. Verify Admin AI governance fit covered
9. Verify security/privacy covered
10. Verify ProcessMap source map covered
11. Verify draft vs durable boundary correct
12. Verify no auto-apply boundary correct
13. Verify no BPMN XML mutation boundary correct
14. Verify architecture options compared
15. Verify recommendation explicit
16. Verify future prompt usable
17. Verify no product code changed
18. Verify no secrets touched
19. If any issue found (even minor):
    - Create CHANGES_REQUESTED
    - Create REWORK_REQUEST.md
    - Do NOT create REVIEW_PASS
20. If all good:
    - Create REVIEW_REPORT.md
    - Create REVIEW_PASS
21. If external blocker:
    - Create REVIEW_BLOCKED.md

### Expected Agent 3 Checks
- Source references present?
- Risk matrix present?
- Clear verdict present?
- ProcessMap source map present?
- Security section present?
- Future contour prompt present?
- Draft/durable boundary explicit?
- No vague recommendations?
- No unsupported claims?
- No product code changes?
- No missing files?
- No broken markdown links?
- No overly generic statements?

---

## Rework Loop

### Flow
1. Agent 2 creates READY_FOR_REVIEW (claims work is complete)
2. Agent 3 reviews
3. If REVIEW_PASS: contour accepted, no further action
4. If CHANGES_REQUESTED:
   - Agent 3 writes REWORK_REQUEST.md
   - Agent 2 reads REVIEW_REPORT.md and REWORK_REQUEST.md
   - Agent 2 fixes all requested docs/research issues
   - Agent 2 updates EXEC_REPORT.md with "Rework Round N"
   - Agent 2 recreates READY_FOR_REVIEW
   - Agent 3 re-reviews
   - Repeat until REVIEW_PASS or REVIEW_BLOCKED

### Strictness Rules
- Agent 3 must request rework for even minor issues
- Agent 3 must NOT silently fix Agent 2 output
- Agent 2 must NOT ignore any requested item
- No merge/PR/deploy at any point

### Markers
- READY_FOR_REVIEW = Agent 2 claims ready
- CHANGES_REQUESTED = Agent 3 rejects
- REWORK_REQUEST.md = binding instructions for Agent 2
- REVIEW_PASS = accepted
- REVIEW_BLOCKED = external blocker

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AG-UI project too immature | Medium | High | Document maturity assessment explicitly |
| Over-engineering for current needs | High | Medium | Prefer taxonomy-only or defer options |
| Creating parallel logging layer | Medium | High | Explicitly map to Admin AI execution log |
| Security leak via event stream | Medium | High | Security section mandatory; filter payloads |
| Mixing with UI redesign contour | Low | High | Non-goals explicitly lock this out |
| Mixing with backend implementation | Low | High | Non-goals explicitly lock this out |
| Agent 2 writes product code instead of docs | Low | High | STATE.json and prompts forbid it; Agent 3 checks |
| Vague recommendation without evidence | Medium | High | Fit matrix and source references required |

---

## Validation

This contour is valid when:
- All 10 gates below are PASS
- Agent 2 produces required Atlas docs
- Agent 2 produces explicit recommendation with evidence
- Agent 3 confirms research quality and boundary compliance
- No product code changed
- No secrets touched

---

## Gates

| Gate | Name | Status |
|------|------|--------|
| Gate 1 | GSD discipline completed | PASS |
| Gate 2 | Source/runtime truth captured | PASS |
| Gate 3 | Research source map defined | PASS |
| Gate 4 | ProcessMap AI architecture source map defined | PASS |
| Gate 5 | Fit questions defined | PASS |
| Gate 6 | Non-goals locked | PASS |
| Gate 7 | Executor prompt ready | PASS |
| Gate 8 | Reviewer prompt ready | PASS |
| Gate 9 | Rework loop rules defined | PASS |
| Gate 10 | READY_FOR_EXECUTION marker created | PASS |

---

*Plan created by Agent 1 / Planner*
*Contour: research/product-actions-ai-ag-ui-protocol-fit-v1*
*Run: 20260514T173748Z-63948*
*Date: 2026-05-14*
