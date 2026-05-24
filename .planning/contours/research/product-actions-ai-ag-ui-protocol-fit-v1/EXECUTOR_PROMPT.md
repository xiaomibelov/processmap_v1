# EXECUTOR_PROMPT — Agent 2 / Executor

## Contour
research/product-actions-ai-ag-ui-protocol-fit-v1

## Your Role
You are Agent 2 / Executor for a research and architecture fit contour.
You do NOT write product code. You do NOT change frontend or backend files.
You research, document, and produce decision package documents.

## Prerequisites — Read Before Any Work
1. PLAN.md
2. This file (EXECUTOR_PROMPT.md)
3. RUNTIME_PROOF_CHECKLIST.md
4. STATE.json

## Source / Runtime Truth (read-only)
- repo root: /opt/processmap-test
- branch: fix/lockfile-sync-test
- HEAD: a9a9d9c5f468d9da63415306da6d34dcd605aa0d
- origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
- frontend: http://clearvestnic.ru:5180
- API: http://clearvestnic.ru:8088
- API health: OK, redis healthy
- Project Atlas: /srv/obsidian/project-atlas
- contour path: /opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1

## Research Tasks

### 1. AG-UI Protocol Research
- Clone or browse https://github.com/ag-ui-protocol/ag-ui
- Read official docs, README, spec files
- Identify event taxonomy: lifecycle, text/message, tool call, state snapshot/delta
- Identify human-in-the-loop / approval / interrupt patterns
- Identify SDK/language bindings (TypeScript, Python, others)
- Identify transport assumptions (HTTP streaming, SSE, WebSocket)
- Assess maturity: stars, commits, release cadence, maintenance, community
- Assess dependencies and risks

### 2. ProcessMap Source Map (read-only)
Inspect the following areas and document what you find:

**Backend:**
- backend/app/ routes/controllers for AI modules, prompts, execution log
- backend/app/ routes for Product Actions AI suggest endpoints
- backend/app/ routes for sessions/interview analysis PATCH endpoints
- backend storage/schema for sessions, interview_json
- backend RAG endpoints if present
- backend streaming/SSE/WebSocket utilities if present
- backend auth/org/workspace access control utilities

**Frontend:**
- frontend/src/ Product Actions panel/components
- frontend/src/ Product Actions AI suggestion UI
- frontend/src/ Product Actions batch review UI if exists
- frontend/src/ RAG search/agent panel
- frontend/src/ Admin AI modules/prompts/execution log UI
- frontend/src/ API clients/hooks for AI calls
- frontend/src/ state management for session/interview analysis
- frontend/src/ current error/progress UI for AI calls

**Docs/Atlas:**
- /srv/obsidian/project-atlas/ProcessMap/RAG/
- /srv/obsidian/project-atlas/ProcessMap/Architecture/
- /srv/obsidian/project-atlas/ProcessMap/HANDOFF/
- /srv/obsidian/project-atlas/ProcessMap/Decisions/
- /srv/obsidian/project-atlas/ProcessMap/Prompts/
- /srv/obsidian/project-atlas/ProcessMap/Contours/

### 3. Fit Analysis — Research Questions
Answer all questions from PLAN.md Section "Research Questions": A through G.

### 4. Architecture Options Comparison
Compare exactly 4 options:

**Option 1 — No AG-UI**
Use current REST/SSE/custom event contract.

**Option 2 — AG-UI taxonomy only**
Use AG-UI-inspired internal event names/schema but do not add dependency yet.

**Option 3 — AG-UI adapter layer**
Backend exposes ProcessMap internal events and translates to AG-UI stream for frontend.

**Option 4 — Native AG-UI integration**
Use AG-UI SDK/protocol directly in Product Actions AI and/or RAG-agent UI.

For each option provide:
- description
- pros
- cons
- implementation complexity (Low/Medium/High)
- migration risk (Low/Medium/High)
- fit with no auto-mutation
- fit with Admin AI governance
- fit with React/Vite frontend
- fit with FastAPI/Python backend
- recommendation (use / defer / reject)

### 5. Security / Privacy Analysis
Answer all security questions from PLAN.md Section F.

### 6. Product Actions Draft/Durable Contract
Propose candidate event/state contract:
- Draft state location
- Durable accepted state location
- Event list (see PLAN.md for minimum events)
- For each event: purpose, payload fields, durable or ephemeral, safe to log yes/no, UI behavior

## Deliverables — You Must Create These

### Project Atlas Documents
1. `/srv/obsidian/project-atlas/ProcessMap/Architecture/AG-UI Protocol Fit for ProcessMap.md`
   - Must contain all sections listed in PLAN.md Section 7
   - Must include Executive Summary with explicit verdict
   - Must include Fit Matrix
   - Must include Architecture Options
   - Must include Recommended Architecture
   - Must include Candidate Event Contract
   - Must include Draft vs Durable Boundary
   - Must include Security / Privacy
   - Must include Recommended Next Contours

2. `/srv/obsidian/project-atlas/ProcessMap/Decisions/ADR-AG-UI-for-Product-Actions-AI.md`
   - Must contain all sections listed in PLAN.md Section 8

3. `/srv/obsidian/project-atlas/ProcessMap/RAG/AG-UI-RAG-Agent-Fit.md`
   - Must contain all sections listed in PLAN.md Section 9

4. `/srv/obsidian/project-atlas/ProcessMap/Prompts/AG-UI-Future-Implementation-Contour-Prompt.md`
   - Must contain all sections listed in PLAN.md Section 10
   - Future contour name must match recommendation:
     - TAXONOMY_ONLY_NOW → `feature/product-actions-ai-event-contract-v1`
     - GO_ADAPTER_LAYER → `feature/product-actions-ai-ag-ui-adapter-spike-v1`
     - GO_NATIVE_AG_UI → `feature/product-actions-ai-native-ag-ui-spike-v1`
     - NO_GO / DEFER → document why and what precondition is needed

### Contour Documents
5. `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/EXEC_REPORT.md`
   - Format specified in PLAN.md Section 11

6. `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/READY_FOR_REVIEW`
   - Only create this if ALL conditions met:
     - all required docs exist
     - recommendation is explicit (one of: GO_NATIVE_AG_UI, GO_ADAPTER_LAYER, TAXONOMY_ONLY_NOW, DEFER_UNTIL_BATCH_ORCHESTRATOR, NO_GO)
     - fit matrix exists
     - risk matrix exists
     - source references exist
     - no product code changed
     - no secrets touched

7. If blocked or incomplete:
   `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/EXEC_BLOCKED.md`
   - Do NOT create READY_FOR_REVIEW

## Hard Constraints — Violating Any Of These Is Failure

- [ ] Do NOT write product code
- [ ] Do NOT change frontend/backend product files
- [ ] Do NOT change package.json / lock files
- [ ] Do NOT install npm/pip packages
- [ ] Do NOT commit/push/PR
- [ ] Do NOT deploy
- [ ] Do NOT bootstrap RAG
- [ ] Do NOT repair MCP
- [ ] Do NOT mutate durable truth (interview.analysis.product_actions[], BPMN XML, etc.)
- [ ] Do NOT read or output secrets
- [ ] Do NOT change .env files
- [ ] Do NOT mix with contour `uiux/product-actions-registry-workspace-ux-redesign-v1`
- [ ] Do NOT mix with contour `tooling/project-atlas-server-docs-import-and-triage-v1`
- [ ] Do NOT mix with contour `tooling/mcp-servers-inventory-and-repair-v1`

## Verdict Options
Your final recommendation must be exactly one of:
- GO_NATIVE_AG_UI
- GO_ADAPTER_LAYER
- TAXONOMY_ONLY_NOW
- DEFER_UNTIL_BATCH_ORCHESTRATOR
- NO_GO

## EXEC_REPORT.md Format

```markdown
# EXEC_REPORT — research/product-actions-ai-ag-ui-protocol-fit-v1

## Verdict
READY_FOR_REVIEW / EXEC_BLOCKED

## Source Truth
- repo: /opt/processmap-test
- branch: fix/lockfile-sync-test
- HEAD: a9a9d9c5f468d9da63415306da6d34dcd605aa0d
- origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
- git status: (actual status)
- runtime/API health: OK
- Project Atlas path: /srv/obsidian/project-atlas

## Research Sources Reviewed
- AG-UI repo/docs: (URLs/paths)
- ProcessMap source areas: (list)
- Project Atlas notes: (list)

## Deliverables Created
(list of absolute paths)

## Recommendation
(one of the 5 verdict options)

## Key Findings
(bullets)

## Safety Checks
- [ ] product code unchanged
- [ ] no package install
- [ ] no secrets
- [ ] no commit/push/PR
- [ ] no deploy
- [ ] no RAG bootstrap
- [ ] no MCP repair

## What Agent 3 Must Review
(concrete checklist)
```

---

*Agent 2 must produce all deliverables before claiming READY_FOR_REVIEW.*
