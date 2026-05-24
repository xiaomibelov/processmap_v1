# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: (none)
- **area/query**: What is forbidden for RAG?
- **generated_at**: 2026-05-16T16:59:30.934Z

## Structured Facts

### Agent Rules
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- Version marker must not overlay the BPMN canvas. (All diagram/UI contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)
- For TO-BE format, follow only the user-provided document; no invented terms unless marked hypothesis. (All TO-BE modeling and process design contours)

### Validation Facts
- What is forbidden for RAG? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — 6. Search: RAG forbidden actions
- **score**: 26.679
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEWER_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, canonical_truth
- **snippet**:
```
## 6. Search: *RAG* *forbidden* actions
node tools/*rag*/pm-*rag*-search.mjs "*What* is *forbidden* for *RAG*" --top-k 8
```

### #2 — 6. Search: RAG forbidden actions
- **score**: 25.679
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-agent-*rag*-bm25-manifest-search-v1] ## 6. Search: *RAG* *forbidden* actions
node tools/*rag*/pm-*rag*-search.mjs "*What* is *forbidden* for *RAG*" --top-k 8
```

### #3 — q4-rag-forbidden-actions
- **score**: 25.065
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_VALIDATION_RESULTS.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-agent-*rag*-bm25-manifest-search-v1] ## q4-*rag*-*forbidden*-actions
**Query:** *What* is *forbidden* for *RAG*? **Status:** ❌ FAIL **Terms:** 6/10 (60%) **Paths:** 1/4 (25%) **Pass Criteria:** At least 4 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.
```

### #4 — q4-rag-forbidden-actions ❌ FAIL
- **score**: 22.417
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/VALIDATION_QUERY_RESULTS.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-agent-*rag*-bm25-manifest-search-v1] ## q4-*rag*-*forbidden*-actions ❌ FAIL
**Query:** "*What* is *forbidden* for *RAG*?" - **Terms found:** 6/10 (60%) - **Paths matched:** 1/4 (25%) - **Status:** FAIL - **Root cause:** Expected paths include AGENTS.md and architecture PLAN.md, which are in the manifest but did not rank in top-8 because the query terms are generic and many files match. The path patterns are broad and competitive. - **Next contour:** Add category/source filter to query syntax; boost canonical docs.
```

### #5 — Query 4: RAG Forbidden Actions
- **score**: 22.175
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/VALIDATION_QUERIES.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-agent-*rag*-knowledge-layer-bootstrap-plan-v1] ## Query 4: *RAG* *Forbidden* Actions
**Query:** "*What* is *forbidden* for *RAG*?" **Expected Answer:** - No secrets indexing - No auto-mutation of code or files - No BPMN XML writes - No AI drafts treated as canonical truth - No auto-save or auto-apply of Product Actions - No override of human review verdict **Sources That Should Be Retrieved:** - `architecture/processmap-agent-*rag*-knowledge-layer-bootstrap-plan-v1/PLAN.md` (Read-only Boundary) - `architecture/processmap-agent-*rag*-knowledge-layer-bootstrap-plan-v1/INDEXING_POLICY.md` - …
```

## Required Gates
- [ ] Source/runtime truth confirmed before implementation
- [ ] Bounded contour scope respected
- [ ] No product runtime changes unless explicitly allowed
- [ ] No secrets printed in output
- [ ] No auto-mutation of BPMN XML or Product Actions
- [ ] RAG read-only boundary respected
- [ ] Runtime evidence collected for Agent 3

## Warnings
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "ProcessMap runtime" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "agent rules" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour <contour-id> --area "scope" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
