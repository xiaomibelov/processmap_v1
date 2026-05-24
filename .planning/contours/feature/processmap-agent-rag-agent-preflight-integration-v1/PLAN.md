# feature/processmap-agent-rag-agent-preflight-integration-v1

**Contour ID:** `feature/processmap-agent-rag-agent-preflight-integration-v1`  
**Agent 1 Run ID:** `20260516T164830Z-8575`  
**Date:** 2026-05-16T16:48:39+00:00  
**Planner:** Agent 1 / Planner  
**Verdict:** PLAN_READY_FOR_EXECUTION

---

## GSD Discipline

### GSD Availability Result

| Check | Result |
|-------|--------|
| `command -v gsd` | `/opt/processmap-test/bin/gsd` (found) |
| `command -v gsd-sdk` | `/opt/processmap-test/bin/gsd-sdk` (found) |
| `PROCESSMAP_GSD_WRAPPER_FOUND` | Yes |
| `CODEX_GSD_TOOLS_FOUND` | Yes |
| GSD skills count | 49+ directories under `/root/.codex/skills/gsd-*` |
| GSD agents count | 0 under `/root/.codex/agents/gsd-*` |

### GSD Mode
`GSD_PROCESSMAP_WRAPPER_PLANNING` — ProcessMap wrapper (`/opt/processmap-test/bin/gsd`) and Codex GSD tools (`/root/.codex/get-shit-done/bin/gsd-tools.cjs`) are both present and executable. GSD skills directory is populated.

### GSD Commands Used
```bash
export PATH="/opt/processmap-test/bin:$PATH"
command -v gsd
command -v gsd-sdk
test -x /opt/processmap-test/bin/gsd
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs
find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*' | sort | head -50
```

### Planning Constraints
- Implementation will NOT be performed by Agent 1.
- Product runtime files will NOT be changed by Agent 1.
- Contour is strictly bounded to tooling/docs/workflow.
- RAG remains read-only.
- Preflight integration is tooling/workflow only.
- Agent 2 / Agent 3 gates are prepared in this planning pack.

---

## Source / Runtime Truth

| Property | Value |
|----------|-------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `date -Is` | `2026-05-16T16:49:53+00:00` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --name-only` | 8 pre-existing frontend files (unrelated to this contour) |
| `git diff --stat` | 8 files changed, 55 insertions(+), 9 deletions(-) |
| `curl -s http://clearvestnic.ru:8088/health` | `{"ok":true,"status":"ok",...}` |
| `curl -I http://clearvestnic.ru:5180` | HTTP/1.1 200 OK (nginx, no-cache) |

**Divergence note:** The 8 modified frontend files are pre-existing and belong to `fix/lockfile-sync-test`. They are completely unrelated to this contour. This contour creates only tooling/config/docs under `tools/rag/`, `.planning/contours/<CID>/`, and Project Atlas.

---

## Previous RAG Source Truth

### Closed Contours Reviewed

| # | Contour ID | Verdict | Key Deliverables |
|---|------------|---------|------------------|
| 1 | `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1` | REVIEW_PASS | Source inventory, RAG architecture, indexing policy draft, agent integration plan, validation queries, 4 implementation contours proposed |
| 2 | `feature/processmap-agent-rag-source-registry-and-index-policy-v1` | REVIEW_PASS | 8-source registry, indexing policy, secrets scanner, manifest builder, metadata schema, classifier rules (27/27 policy checks pass) |
| 3 | `feature/processmap-agent-rag-bm25-manifest-search-v1` | REVIEW_PASS | BM25 search index builder, search CLI, validation query runner (3/7 pass on 500-file sample; failures documented as corpus/ranking issues) |
| 4 | `feature/processmap-agent-rag-coverage-and-validation-hardening-v1` | REVIEW_PASS | Full manifest mode (1,803 files), source-balanced coverage, improved ranking (7/7 PASS on full manifest, all 8 sources represented) |
| 5 | `feature/processmap-agent-rag-structured-facts-registry-v1` | REVIEW_PASS | Structured facts registry (53 facts, 7 types), facts validator (28/28 PASS), facts search CLI, facts-to-context bridge prototype |

### Existing RAG Tooling Inventory

| Tool | Purpose | Status |
|------|---------|--------|
| `tools/rag/pm-rag-build-manifest.mjs` | Build file manifest from registry | Working, `--full` mode available |
| `tools/rag/pm-rag-build-search-index.mjs` | Build BM25 index from manifest | Working, ~97 MB index on full manifest |
| `tools/rag/pm-rag-search.mjs` | BM25 search CLI (text/JSON/md) | Working, 7/7 validation pass |
| `tools/rag/pm-rag-run-validation-queries.mjs` | Run validation queries against index | Working |
| `tools/rag/pm-rag-scan-secrets.mjs` | Scan for secrets in registry/path | Working, 0 critical findings in facts |
| `tools/rag/pm-rag-validate-policy.mjs` | Validate registry/indexing policy | 27/27 PASS |
| `tools/rag/pm-rag-validate-facts.mjs` | Validate structured facts registry | 28/28 PASS |
| `tools/rag/pm-rag-search-facts.mjs` | Lexical search over facts | Working, ranked results with `why_matched` |
| `tools/rag/pm-rag-facts-to-context.mjs` | Prototype facts-to-context bridge | Working, supports `--role`, `--query`, `--append-bm25` |

### Existing Facts Summary (53 facts)

| Fact Type | Count | Key Content |
|-----------|-------|-------------|
| `runtime_fact` | 9 | clearvestnic.ru, :5180, :8088, /opt/processmap-test, /srv/obsidian/project-atlas |
| `agent_rule` | 8 | Agent 1/2/3 rules, no product changes in RAG, RAG read-only |
| `contour_fact` | 9 | All 9 contours including RAG and Diagram performance history |
| `user_rejection_fact` | 5 | 5 rejections overriding formal REVIEW_PASS (drag lag, version marker, synthetic tests) |
| `decision_fact` | 10 | RAG read-only, no auto-mutate, no BPMN XML write, Product Actions truth source |
| `validation_fact` | 8 | 7/7 coverage hardening, q4-rag-forbidden-actions PASS |
| `bottleneck_fact` | 4 | React 95% CPU drag, RAG retrieval 3/7→7/7 |

### Key User Rejection Facts (override formal REVIEW_PASS)

| ID | Contour | Severity | Reason |
|----|---------|----------|--------|
| `ur-perf-drag-hot-path` | `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1` | critical | Drag lag remained during real mouse interaction |
| `ur-synthetic-zoom-not-drag` | `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1` | critical | Reviewer tested synthetic zoom/click instead of real mouse drag |
| `ur-fix-drag-ledger-rework` | `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1` | high | Real drag lag still observable; process improved but not product |
| `ur-fix-real-drag-engine` | `fix/diagram-real-drag-performance-and-engine-decomposition-v1` | high | Large-canvas lag and version marker overlay remained |
| `ur-version-marker-on-canvas` | `fix/diagram-real-drag-performance-and-engine-decomposition-v1` | medium | Version marker placed on canvas, obstructing interaction |

### Project Atlas RAG Docs

| Path | Status |
|------|--------|
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Knowledge Layer Bootstrap Plan.md` | Exists |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Preflight Usage.md` | Exists |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Rules Facts.md` | Exists |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/BM25 Manifest Search.md` | Exists |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Contour Facts Index.md` | Exists |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Coverage and Validation Hardening.md` | Exists |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Facts Validation Results.md` | Exists |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Structured Facts Registry.md` | Exists |

---

## Problem Statement

We have built a robust RAG/RAK knowledge layer with:
- 53 structured facts across 7 types
- BM25 search over 1,803 files from 8 sources
- 7/7 validation pass on search queries
- Secrets-clean, read-only boundary

However, **agents do not yet use RAG as a mandatory preflight step**. The existing `pm-rag-facts-to-context.mjs` is a prototype that:
- Supports `--role` and `--query` but not `--contour`, `--area`, `--format md|json`, `--out <file>`
- Does not produce the full compact context pack required by agents
- Does not integrate into agent launcher scripts/templates
- Does not enforce role-specific gates

**Goal:** Make RAG preflight a repeatable, executable part of Agent 1/2/3 workflow without changing product runtime.

---

## Implementation Scope

### In Scope

1. **Agent preflight CLI** — finalize or implement `tools/rag/pm-rag-agent-preflight.mjs` with full argument support and role-specific output
2. **Planner preflight contract** — template/guidance for PLAN.md `## RAG Preflight` section
3. **Executor preflight contract** — template/guidance for EXEC_REPORT.md `## RAG Context Used` section
4. **Reviewer preflight contract** — template/guidance for REVIEW_REPORT.md `## RAG Review Context` section
5. **Script/template integration** — update or wrap agent scripts to reference preflight
6. **Validation fixtures** — concrete test examples for planner/executor/reviewer/policy/runtime queries
7. **Project Atlas updates** — mirror new docs to Obsidian

### Out of Scope (Non-goals)

- No full RAG server/API
- No embeddings
- No vector database
- No external services
- No package installation
- No product runtime UI changes
- No backend API changes
- No auto-mutation
- No BPMN XML mutation
- No Product Actions auto-apply
- No indexing secrets
- No treating AI drafts as truth
- No automatic execution of agent work based on RAG
- No MCP repair
- No stage/prod deploy
- No PR/merge/push

---

## Facts-first / BM25-second Design

### Core Principle

Every agent preflight MUST follow:

```
Step 1: Query structured facts first (deterministic, fast, curated)
Step 2: Query BM25 supporting documents second (broader context, snippets)
Step 3: Compose compact context pack (deduplicated, ranked, gated)
```

### Why Facts First

1. **Deterministic** — Same query always returns same facts (unless facts are explicitly updated)
2. **Curated** — Facts are hand-maintained with source refs and severity
3. **Fast** — In-memory JSON/NDJSON load, no index rebuild needed
4. **User rejection override** — Formal REVIEW_PASS vs `not_solved` is explicit
5. **Compact** — 53 facts vs 1,803 files; agents need density, not volume

### Why BM25 Second

1. **Breadth** — Covers files not yet in facts (new contours, ad-hoc docs)
2. **Snippets** — Provides verbatim text with `*term*` highlighting
3. **Evidence** — Source refs link back to original files
4. **Discovery** — Suggests follow-up queries when facts are incomplete

### Composition Rule

- Facts are always included if matched (score > 0)
- BM25 docs are included if they add new information not already in facts
- Duplicates are suppressed (if a BM25 doc is already referenced by a fact, skip or deprioritize)
- Role boost is applied BEFORE top-k cutoff

---

## Agent Preflight CLI Contract

### Tool Location
`tools/rag/pm-rag-agent-preflight.mjs`

### Arguments

| Arg | Required | Values | Description |
|-----|----------|--------|-------------|
| `--role` | Yes | `planner` \| `executor` \| `reviewer` | Agent role for context tailoring |
| `--contour` | No | `<contour_id>` | Target contour ID for contour-specific facts |
| `--area` | No | `<area/topic>` | Topic/area filter (e.g., "Diagram performance lag") |
| `--query` | No | `<free text>` | Free-text query for BM25 supplement |
| `--top-k` | No | N (default 5) | Number of BM25 supporting docs |
| `--format` | No | `md` \| `json` (default `md`) | Output format |
| `--out` | No | `<file>` | Optional output file (default stdout) |

### Examples

```bash
# Planner mode
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "perf/process-stage-baseline-jank-v1" \
  --area "Diagram performance lag" \
  --format md

# Reviewer mode
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "perf/process-stage-baseline-jank-v1" \
  --query "Diagram performance review rules" \
  --format json

# Executor mode — policy check
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --query "What is forbidden for RAG?" \
  --format md

# Runtime facts
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --query "current ProcessMap test runtime" \
  --format md
```

### Output Sections (Markdown)

```markdown
# ProcessMap Agent RAG Preflight

## Input
- role:
- contour:
- area/query:
- generated_at:

## Structured Facts
### Runtime Facts
### Agent Rules
### User Rejections
### Contour Facts
### Decisions
### Bottlenecks
### Validation Facts

## Supporting Documents
For each:
- rank
- score
- path
- title
- source/category
- snippet
- why_matched

## Required Gates
Role-specific checklist.

## Warnings
- user rejection overrides formal pass
- deprecated/superseded facts
- missing source coverage
- no-secrets reminder

## Suggested Next Queries
- list 3-5 follow-up search commands
```

### Output Sections (JSON)

Equivalent fields as a single JSON object with:
- `input` object
- `structured_facts` object with arrays per fact type
- `supporting_documents` array
- `required_gates` array
- `warnings` array
- `suggested_queries` array

---

## Planner Integration Plan

### Agent 1 Must Before PLAN.md

Run:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "$CID" \
  --area "<area from task>" \
  --format md --out .planning/contours/$CID/RAG_PREFLIGHT_PLANNER.md
```

### PLAN.md Must Include

```markdown
## RAG Preflight
- command run: `node tools/rag/pm-rag-agent-preflight.mjs --role planner ...`
- role: planner
- query/area: <area>
- facts used: <list of fact IDs>
- supporting documents used: <list of paths>
- user rejections considered: <yes/no + which>
- decisions/rules considered: <list>
- accepted context: <what influenced the plan>
- ignored/deprecated context: <what was discarded and why>
- resulting plan changes: <delta from default approach>
```

### Script Integration

Option A (preferred if safe): Update `tools/pm-agent1-planner.sh` to generate a preflight command in the prompt file.

Option B (if script mutation is risky): Add explicit preflight instruction in `EXECUTOR_PROMPT.md` and `REVIEWER_PROMPT.md` for Agent 2/3 to run preflight before work. Document deferred script integration with rationale.

---

## Executor Integration Plan

### Agent 2 Must Before Implementation

Run:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "$CID" \
  --area "<area>" \
  --query "<contextual query>" \
  --format md --out .planning/contours/$CID/RAG_PREFLIGHT_EXECUTOR.md
```

### EXEC_REPORT.md Must Include

```markdown
## RAG Context Used
- command run: `node tools/rag/pm-rag-agent-preflight.mjs --role executor ...`
- facts used: <list of fact IDs>
- source docs used: <list of paths>
- prior contours/files considered: <list>
- known regressions: <from facts>
- forbidden actions: <from agent rules / decision facts>
- validation scenarios: <from validation facts>
- limitations: <what RAG did not cover>
```

### Script Integration

Option A: Update `tools/pm-agent2-executor-watch.sh` to reference preflight in the generated prompt.

Option B: Add `AGENT_RAG_PREFLIGHT_TEMPLATE.md` with copy-paste commands for Agent 2.

---

## Reviewer Integration Plan

### Agent 3 Must Before Review

Run:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "$CID" \
  --query "<review focus>" \
  --format md --out .planning/contours/$CID/RAG_PREFLIGHT_REVIEWER.md
```

### REVIEW_REPORT.md Must Include

```markdown
## RAG Review Context
- command run: `node tools/rag/pm-rag-agent-preflight.mjs --role reviewer ...`
- facts used: <list of fact IDs>
- user-visible acceptance criteria: <from contour facts / validation facts>
- fail conditions: <from user rejection facts / agent rules>
- prior user rejections: <list with severity>
- supporting reports: <BM25 docs with snippets>
- verdict implications: <how RAG context affects pass/fail>
```

### Script Integration

Option A: Update `tools/pm-agent3-reviewer-watch.sh` to reference preflight in the generated prompt.

Option B: Document in `REVIEWER_PROMPT.md` with explicit preflight command.

---

## Script / Template Integration Plan

### Files to Create

1. `tools/rag/pm-rag-agent-preflight.mjs` — main preflight CLI
2. `tools/rag/AGENT_RAG_PREFLIGHT_TEMPLATE.md` — shared template documenting:
   - How to run preflight for each role
   - What sections to include in reports
   - Role-specific gates
   - Warnings and overrides

### Files Potentially Modified (Bounded, Safe Only)

| File | Change | Risk | Decision |
|------|--------|------|----------|
| `tools/pm-agent1-planner.sh` | Add preflight command hint in prompt | Low | Agent 2 decides if safe |
| `tools/pm-agent2-executor-watch.sh` | Add preflight command hint in prompt | Low | Agent 2 decides if safe |
| `tools/pm-agent3-reviewer-watch.sh` | Add preflight command hint in prompt | Low | Agent 2 decides if safe |

**Rule:** If direct script mutation is risky, Agent 2 must create a wrapper or documented command and record in `SCRIPT_TEMPLATE_INTEGRATION_REPORT.md` why full integration was deferred.

---

## Output Format

### Markdown Output (Default)

See "Agent Preflight CLI Contract" section above for full structure.

### JSON Output

```json
{
  "input": {
    "role": "planner",
    "contour": "perf/process-stage-baseline-jank-v1",
    "area": "Diagram performance lag",
    "query": "",
    "top_k": 5,
    "generated_at": "2026-05-16T16:50:00Z"
  },
  "structured_facts": {
    "runtime_facts": [...],
    "agent_rules": [...],
    "user_rejections": [...],
    "contour_facts": [...],
    "decisions": [...],
    "bottlenecks": [...],
    "validation_facts": [...]
  },
  "supporting_documents": [
    {
      "rank": 1,
      "score": 12.345,
      "path": "...",
      "title": "...",
      "source_id": "...",
      "category": "...",
      "snippet": "...",
      "why_matched": ["heading_match", "recent_14d"]
    }
  ],
  "required_gates": [
    "GSD discipline recorded",
    "source/runtime truth captured",
    "..."
  ],
  "warnings": [
    "User rejection ur-perf-drag-hot-path overrides formal REVIEW_PASS",
    "..."
  ],
  "suggested_queries": [
    "node tools/rag/pm-rag-search.mjs 'React bundle 95 CPU' --top-k 5",
    "..."
  ]
}
```

---

## Validation Plan

### Commands Agent 2 Must Run

```bash
# 1. Facts validator (must still pass)
node tools/rag/pm-rag-validate-facts.mjs

# 2. BM25 validation (must still pass 7/7 or document change)
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8

# 3. Secrets scan (must be clean or false positives documented)
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json

# 4. Planner preflight sample
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "perf/process-stage-baseline-jank-v1" \
  --area "Diagram performance lag" \
  --format md

# 5. Reviewer preflight sample
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "perf/process-stage-baseline-jank-v1" \
  --query "Diagram performance review rules" \
  --format json

# 6. Executor policy preflight sample
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --query "What is forbidden for RAG?" \
  --format md

# 7. Runtime preflight sample
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --query "current ProcessMap test runtime" \
  --format md
```

### Expected Results

| # | Test | Expected |
|---|------|----------|
| 1 | Facts validator | 28/28 PASS |
| 2 | BM25 validation | 7/7 PASS (or documented if runner changed) |
| 3 | Secrets scan | 0 critical findings in facts; false positives documented |
| 4 | Planner sample | Runtime facts, Diagram bottleneck facts, user rejection override, Agent 1 GSD rule, version/runtime proof rules, supporting docs |
| 5 | Reviewer sample | Agent 3 GSD rules, fresh 5180 proof, real user scenario, no REVIEW_PASS if user-visible lag remains, supporting reports |
| 6 | Policy sample | No auto-mutation, no BPMN XML writes, no secrets, no AI drafts as truth, supporting policy docs |
| 7 | Runtime sample | clearvestnic.ru, /opt/processmap-test, 5180, 8088, Project Atlas path |

---

## Secrets / Safety Plan

### Constraints
- No secrets printed in preflight output
- No `.env`, `.pem`, `.key` indexed or referenced
- Redaction applied to snippets (same as `pm-rag-search.mjs`)
- Scanner re-run to confirm no regression
- Facts validator check #13 (excluded paths) and #14 (secret-like values) must still pass

### Safety Checklist
- [ ] Preflight CLI does not read `.env` or secrets files
- [ ] Preflight CLI redacts sensitive patterns in BM25 snippets
- [ ] No new dependencies that could access secrets
- [ ] Output files written only to `tools/rag/` or contour dirs

---

## Project Atlas Update Plan

### Files to Create/Update

| Path | Content |
|------|---------|
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Preflight Integration.md` | Overview of preflight integration, how to use, role modes |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent RAG Preflight Template.md` | Copy of `AGENT_RAG_PREFLIGHT_TEMPLATE.md` |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Preflight Output Examples.md` | Sample outputs for planner/executor/reviewer/policy/runtime |

### Mirror Script
After writing/updating planning artifacts, Agent 2 must run:
```bash
./tools/pm-agent-mirror-report.sh "feature/processmap-agent-rag-agent-preflight-integration-v1" executor
```

---

## Acceptance Criteria

Agent 3 should pass only if:

1. Agent preflight CLI exists.
2. Preflight uses structured facts first.
3. Preflight uses BM25 supporting documents second.
4. Planner mode works.
5. Executor mode works.
6. Reviewer mode works.
7. Markdown output works.
8. JSON output works.
9. Preflight includes runtime facts.
10. Preflight includes agent rules.
11. Preflight includes user rejections.
12. Preflight includes contour facts.
13. Preflight includes decisions.
14. Preflight includes bottlenecks.
15. Preflight includes supporting document snippets.
16. User rejection override is visible in reviewer/planner context.
17. RAG read-only/no-mutation rules visible in policy query.
18. Current ProcessMap runtime facts visible in runtime query.
19. Agent 3 review context includes GSD + fresh runtime + exact user scenario gates.
20. Existing facts validator still passes.
21. Existing BM25 validation still passes 7/7 or remains documented if validation runner changed.
22. Secrets scan clean or false positives documented.
23. No secret values printed.
24. No product runtime changes.
25. No backend/frontend UI changes.
26. No package install.
27. No embeddings/vector DB.
28. Project Atlas RAG docs updated.
29. Agent 1/2/3 report templates/contracts documented.
30. Commands are repeatable.

### No REVIEW_PASS If

- Preflight is docs-only and ignores facts.
- Facts output lacks user rejection override.
- Supporting docs missing.
- Planner/executor/reviewer modes not all working.
- Product runtime changed.
- Secrets policy weakened.
- Preflight output is generic/useless.

---

## Non-goals

Explicit non-goals (reiterated from scope):

- no full RAG server/API
- no embeddings
- no vector database
- no external services
- no package installation
- no product runtime UI changes
- no backend API changes
- no auto-mutation
- no BPMN XML mutation
- no Product Actions auto-apply
- no indexing secrets
- no treating AI drafts as truth
- no automatic execution of agent work based on RAG
- no MCP repair
- no stage/prod deploy
- no PR/merge/push

---

## Agent 2 Execution Plan

### Tasks

1. **Read all planning artifacts** in this contour folder.
2. **Confirm source/runtime truth** matches Agent 1 capture.
3. **Implement or finalize** `tools/rag/pm-rag-agent-preflight.mjs`:
   - Add `--contour`, `--area`, `--query`, `--top-k`, `--format`, `--out` args
   - Load structured facts first (`tools/rag/facts/`)
   - Run BM25 search second (`pm-rag-search.mjs`)
   - Compose compact context pack with all required sections
   - Support `md` and `json` output
   - Do not mutate anything
   - Redact sensitive patterns
4. **Create** `tools/rag/AGENT_RAG_PREFLIGHT_TEMPLATE.md` with usage instructions.
5. **Integrate into scripts/templates** if safe:
   - Evaluate modifying `tools/pm-agent1-planner.sh`, `tools/pm-agent2-executor-watch.sh`, `tools/pm-agent3-reviewer-watch.sh`
   - If risky, document deferred integration with rationale
6. **Run validation commands** (see Validation Plan §11).
7. **Re-run** facts validator, BM25 validation, secrets scan.
8. **Create sample outputs**:
   - `PREFLIGHT_PLANNER_SAMPLE.md` + `.json`
   - `PREFLIGHT_EXECUTOR_SAMPLE.md` + `.json`
   - `PREFLIGHT_REVIEWER_SAMPLE.md` + `.json`
9. **Create required reports** (see §11 in user prompt).
10. **Update Project Atlas** RAG docs.
11. **Create** `READY_FOR_REVIEW`.

### Reports Agent 2 Must Produce

- `EXEC_REPORT.md`
- `PREFLIGHT_CLI_REPORT.md`
- `PLANNER_PREFLIGHT_REPORT.md`
- `EXECUTOR_PREFLIGHT_REPORT.md`
- `REVIEWER_PREFLIGHT_REPORT.md`
- `RAG_CONTEXT_OUTPUT_EXAMPLES.md`
- `SCRIPT_TEMPLATE_INTEGRATION_REPORT.md`
- `SECRETS_AND_SAFETY_REPORT.md`
- `RUNTIME_BEHAVIOR_IMPACT.md`
- `IMPLEMENTATION_NOTES.md`
- `READY_FOR_REVIEW`

If blocked: `EXEC_BLOCKED.md`, no `READY_FOR_REVIEW`.

---

## Agent 3 Review Plan

### Reviewer GSD Discipline — Mandatory

Agent 3 must before review run:
```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
```

If GSD available: use GSD review/check discipline.
If GSD unavailable: continue as `GSD_FALLBACK_MANUAL_REVIEW_ONLY`; record in `REVIEW_REPORT.md`.

### Review Steps

1. Read all Agent 2 reports.
2. Inspect changed files (limit to `tools/rag/`, `tools/pm-agent*.sh` if modified, `.planning/contours/<CID>/`, Project Atlas).
3. Run facts validator.
4. Run BM25 validation runner.
5. Run preflight CLI independently for:
   - planner / Diagram performance lag
   - executor / RAG forbidden behavior
   - reviewer / Diagram performance review rules
6. Verify facts-first behavior.
7. Verify BM25 supporting docs present.
8. Verify user rejection override present.
9. Verify role-specific gates present.
10. Verify no secret values printed.
11. Verify no product runtime files changed.
12. Verify no package install / vector DB / embeddings.
13. Create `REVIEW_REPORT.md` and `REVIEW_PASS` if pass.
14. Create `CHANGES_REQUESTED` + `REWORK_REQUEST.md` if fail.

### No REVIEW_PASS If

- Reviewer GSD section missing.
- Preflight command missing.
- Facts-first behavior missing.
- BM25 supporting docs missing.
- Agent 1/2/3 usage examples missing.
- User rejection override not represented.
- Product runtime changed without scope.
- Secrets policy weakened.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Script mutation breaks agent launcher | Low | High | Agent 2 evaluates risk; if unsafe, defers to template-only |
| BM25 index missing/stale | Low | Medium | Document index path; fallback to building sample index |
| Facts registry grows too large for in-memory load | Low | Medium | Current 53 facts trivial; document threshold |
| Preflight CLI becomes bottleneck (slow) | Medium | Low | Facts load is <100ms; BM25 search is <2s; acceptable |
| Agent prompts become too long with RAG context | Medium | Medium | Compact context pack limits to top 10 facts + top 5 docs |
| User rejection facts become stale | Medium | High | Facts are curated; update process documented |

---

## Gates

- [x] Gate 1 — Agent 1 GSD discipline completed
- [x] Gate 2 — previous RAG contours reviewed
- [x] Gate 3 — source/runtime truth captured
- [x] Gate 4 — facts-first/BM25-second preflight scope defined
- [x] Gate 5 — planner preflight contract defined
- [x] Gate 6 — executor preflight contract defined
- [x] Gate 7 — reviewer preflight contract defined
- [x] Gate 8 — scripts/templates integration plan defined
- [x] Gate 9 — no-secrets/no-mutation boundaries defined
- [x] Gate 10 — no product runtime changes locked
- [x] Gate 11 — validation commands defined
- [x] Gate 12 — Agent 2 executor prompt ready
- [x] Gate 13 — Agent 3 reviewer prompt with GSD ready
- [x] Gate 14 — READY_FOR_EXECUTION marker created

**All gates PASS. PLAN_READY_FOR_EXECUTION.**
