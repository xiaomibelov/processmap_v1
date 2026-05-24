# EXECUTOR_PROMPT — Agent 2 / Executor

## Contour
- ID: `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1`
- Role: Agent 2 / Executor
- Scope: architecture and planning ONLY. No product code changes. No package install. No indexing service start.

## Prerequisites
Read before any work:
1. `PLAN.md`
2. `RUNTIME_NAVIGATION.md`
3. `RUNTIME_PROOF_CHECKLIST.md`
4. `STATE.json`

## Tasks

### 1. Source Inventory
Produce `SOURCE_INVENTORY.md` with concrete file lists:

**A. Project Atlas**
- Scan `/srv/obsidian/project-atlas/ProcessMap`
- List per category: AgentReports, Architecture, Audits, Backlog, Contours, Decisions, Evidence, HANDOFF, Prompts, RAG, Runtime
- For each file: path, category, truth_level, priority
- Note total file count and size estimate

**B. Planning Contours**
- Scan `/opt/processmap-test/.planning/contours`
- List every contour with: id, category, verdict (REVIEW_PASS / CHANGES_REQUESTED / pending), files present
- Highlight contours with CHANGES_REQUESTED or REWORK_REQUEST.md (these are high-priority warnings for RAG)

**C. Docs**
- Scan `/opt/processmap-test/docs` and `/opt/processmap-test/PROCESSMAP/HANDOFF`
- List curated docs with: path, category, relevance to RAG

**D. Code Candidates**
- Scan `frontend/src`, `backend`, `tools`, `scripts`
- List key files: path, type, module, risk tags, lines estimate
- Prioritize: RAG modules, diagram components, session save, build scripts, agent tools

### 2. Exclusions / Secrets Policy
Produce `INDEXING_POLICY.md` with:
- Hard exclude patterns (glob/regex)
- Secrets scanner rules (what constitutes a secret)
- Pre-index checklist
- `excluded_sensitive=false` proof template

### 3. RAG Architecture
Produce `RAG_ARCHITECTURE.md` with:
- Source Registry manifest (`INDEX_SOURCES.md` draft)
- Document classifier rules (how to classify each source)
- Chunking strategy per source type (docs, code, reports)
- Metadata schema (all fields per chunk)
- Retrieval use cases per agent role
- Read-only boundary enforcement rules
- Freshness / update workflow

### 4. Agent Integration Plan
Produce `AGENT_INTEGRATION_PLAN.md` with:
- Agent 1 / Planner RAG preflight block (query terms, expected sources, logging format)
- Agent 2 / Executor RAG preflight block
- Agent 3 / Reviewer RAG preflight block
- Query templates per role
- Context logging requirements for PLAN.md / EXEC_REPORT.md / REVIEW_REPORT.md

### 5. Validation Queries
Produce `VALIDATION_QUERIES.md` with:
- 6+ concrete test queries
- Expected answers
- Source paths that should be retrieved
- Pass/fail criteria for each query

### 6. Implementation Contour Proposal
Produce `IMPLEMENTATION_CONTOUR_PROPOSAL.md` with:
- Proposed next contours (names, scopes, deliverables)
- Dependencies between contours
- Risk mitigation per contour
- Acceptance criteria for each proposed contour

### 7. Obsidian Mirror
Create/update in Project Atlas:
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Knowledge Layer Bootstrap Plan.md` — summary of this contour
- `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEX_SOURCES_DRAFT.md` — source registry draft

### 8. Final Markers
- `EXEC_REPORT.md` — summarize what was done, what was found, limitations, next steps
- `READY_FOR_REVIEW` — empty marker file

## Constraints (Hard)
- NO product code changes.
- NO package install.
- NO indexing service start.
- NO BPMN XML mutation.
- NO secrets read/output.
- NO auto-mutation suggestions in architecture.
- NO GSD repair.
- NO MCP repair.

## If Blocked
- Write `EXEC_BLOCKED.md` with reason and evidence.
- Do NOT write `READY_FOR_REVIEW`.
