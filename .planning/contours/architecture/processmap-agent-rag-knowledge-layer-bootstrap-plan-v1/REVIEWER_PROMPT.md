# REVIEWER PROMPT — Agent 3 / Reviewer

## Contour
- ID: `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1`
- Role: Agent 3 / Reviewer
- Scope: Verify Agent 2 reports. No product code changes.

## Prerequisites
1. Run Reviewer GSD Discipline.
2. Read `PLAN.md`, `RUNTIME_NAVIGATION.md`, `STATE.json`.
3. Read ALL Agent 2 reports:
   - `EXEC_REPORT.md`
   - `SOURCE_INVENTORY.md`
   - `RAG_ARCHITECTURE.md`
   - `INDEXING_POLICY.md`
   - `AGENT_INTEGRATION_PLAN.md`
   - `VALIDATION_QUERIES.md`
   - `IMPLEMENTATION_CONTOUR_PROPOSAL.md`

## Review Checklist

### Source Inventory
- [ ] Concrete file paths listed (not generics like "docs/")
- [ ] Project Atlas files enumerated by category
- [ ] Contours enumerated with verdicts
- [ ] Code candidates have paths, modules, risk tags
- [ ] Size/scope estimates provided

### Exclusions / Secrets
- [ ] Hard exclude patterns are explicit (globs/regex)
- [ ] Secrets scanner rules defined
- [ ] Policy covers: .env, keys, tokens, DB dumps, session state
- [ ] `excluded_sensitive=false` proof mechanism described

### RAG Architecture
- [ ] Source Registry manifest is concrete (actual paths, not placeholders)
- [ ] Document classifier has clear rules per category
- [ ] Chunking strategy differs for docs vs code vs reports
- [ ] Metadata schema is complete (all 10+ fields)
- [ ] Retrieval use cases mapped to Agent 1/2/3
- [ ] Read-only boundary is explicit and enforced
- [ ] Freshness workflow is practical (mirror + incremental)

### Agent Integration
- [ ] Agent 1 preflight has query terms and logging format
- [ ] Agent 2 preflight has query terms and logging format
- [ ] Agent 3 preflight has query terms and logging format
- [ ] Query templates are concrete (not "search for relevant stuff")
- [ ] Context logging requirements are mandatory (not optional)

### Validation Queries
- [ ] 6+ queries present
- [ ] Each has expected answer
- [ ] Each has source paths that should be retrieved
- [ ] Pass/fail criteria are objective

### Implementation Contour Proposal
- [ ] Proposed contours are bounded (not "build everything")
- [ ] Each contour has scope, deliverables, acceptance criteria
- [ ] Dependencies are realistic
- [ ] No contour tries to implement production indexing + UI + agent integration at once

### Project Atlas
- [ ] `Agent Knowledge Layer Bootstrap Plan.md` created in `/srv/obsidian/project-atlas/ProcessMap/RAG/`
- [ ] `INDEX_SOURCES_DRAFT.md` created in `/srv/obsidian/project-atlas/ProcessMap/RAG/`

## Fail Conditions (REVIEW_FAIL)

Fail and write `CHANGES_REQUESTED` + `REWORK_REQUEST.md` if ANY of:
- Plan is generic (no actual source paths).
- No exclusions or secrets policy.
- No agent integration (preflight blocks missing).
- Suggests auto-mutation or auto-apply.
- Indexes secrets/drafts as truth.
- Implementation plan tries to do too much in one contour.
- Missing Project Atlas notes.

## Pass Conditions (REVIEW_PASS)

Pass and write `REVIEW_PASS` + `REVIEW_REPORT.md` if ALL of:
- Source inventory is concrete and complete.
- Exclusions are strict.
- RAG read-only boundary is clear.
- Agent integration is concrete.
- Validation queries are objective.
- Implementation contour proposal is actionable and bounded.
- Project Atlas notes created.

## Output Files
- `REVIEW_REPORT.md` — detailed review with check results
- `REVIEW_PASS` or `CHANGES_REQUESTED` — verdict marker
- If failed: `REWORK_REQUEST.md` — specific required fixes

## Constraints
- NO product code changes.
- NO package install.
- NO indexing service start.
- NO secrets read/output.
- NO auto-merging or deploying.
