# EXECUTOR_PROMPT — Agent 2 / Executor

**Contour:** `feature/processmap-agent-rag-agent-preflight-integration-v1`  
**Run ID:** `20260516T164830Z-8575`

---

## 0. Pre-flight for Agent 2

Before writing any code, run:
```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "feature/processmap-agent-rag-agent-preflight-integration-v1" \
  --query "RAG agent preflight integration scope" \
  --format md
```

Record the output in `RAG_PREFLIGHT_EXECUTOR.md` inside the contour folder.

---

## 1. Read First

1. `PLAN.md` (this contour)
2. `RUNTIME_NAVIGATION.md` (this contour)
3. `RUNTIME_PROOF_CHECKLIST.md` (this contour)
4. `STATE.json` (this contour)
5. Previous RAG facts/BM25/hardening reports:
   - `.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/EXEC_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/FACTS_VALIDATION_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/REVIEW_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md`
   - `.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/AGENT_INTEGRATION_PLAN.md`

---

## 2. Confirm Source / Runtime Truth

Run exactly:
```bash
cd /opt/processmap-test
pwd
whoami
hostname
date -Is
git status -sb
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git diff --name-only
git diff --stat
curl -s http://clearvestnic.ru:8088/health || true
curl -I http://clearvestnic.ru:5180 || true
```

If runtime truth diverges from PLAN.md, document in `EXEC_REPORT.md`.

---

## 3. Implementation Tasks

### Task A — Implement or finalize `tools/rag/pm-rag-agent-preflight.mjs`

**Required behavior:**
- Uses structured facts first (`tools/rag/facts/*.json` and `*.ndjson`)
- Uses BM25 supporting documents second (`tools/rag/pm-rag-search.mjs`)
- Produces compact context pack
- Supports role-specific outputs: `planner`, `executor`, `reviewer`
- Supports `md` and `json` output
- Does not mutate anything
- Does not write to product runtime
- Does not print secrets
- Redacts sensitive patterns in snippets (same regexes as `pm-rag-search.mjs`)

**Required arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `--role` | Yes | `planner` \| `executor` \| `reviewer` |
| `--contour` | No | Target contour ID |
| `--area` | No | Topic/area filter |
| `--query` | No | Free-text query for BM25 supplement |
| `--top-k` | No | Number of BM25 docs (default 5) |
| `--format` | No | `md` (default) or `json` |
| `--out` | No | Output file path (default stdout) |

**Output sections (Markdown):**
1. `# ProcessMap Agent RAG Preflight`
2. `## Input` — role, contour, area/query, generated_at
3. `## Structured Facts` — Runtime Facts, Agent Rules, User Rejections, Contour Facts, Decisions, Bottlenecks, Validation Facts
4. `## Supporting Documents` — rank, score, path, title, source/category, snippet, why_matched
5. `## Required Gates` — role-specific checklist
6. `## Warnings` — user rejection overrides, deprecated facts, missing coverage, no-secrets reminder
7. `## Suggested Next Queries` — 3-5 follow-up commands

**Output sections (JSON):**
Equivalent structured JSON with `input`, `structured_facts`, `supporting_documents`, `required_gates`, `warnings`, `suggested_queries`.

**Implementation hints:**
- Reuse `pm-rag-facts-to-context.mjs` logic where possible.
- Reuse `pm-rag-search-facts.mjs` for facts lookup.
- Spawn `pm-rag-search.mjs` for BM25 supporting docs (or load index directly if faster).
- Apply role boost before top-k cutoff (same heuristic weights as prototype).
- If `--contour` is provided, boost facts matching that `contour_id`.
- If `--area` is provided, include it in the query tokens for both facts and BM25.

### Task B — Create `tools/rag/AGENT_RAG_PREFLIGHT_TEMPLATE.md`

Shared markdown template documenting:
- How to run preflight for each role (copy-paste commands)
- What sections to include in PLAN.md / EXEC_REPORT.md / REVIEW_REPORT.md
- Role-specific gates
- Warnings and overrides
- Non-goals and boundaries

### Task C — Script / Template Integration

Evaluate updating these files. Only modify if safe and bounded:
- `tools/pm-agent1-planner.sh`
- `tools/pm-agent2-executor-watch.sh`
- `tools/pm-agent3-reviewer-watch.sh`

If direct script mutation is risky:
- Create a wrapper or documented command.
- Record in `SCRIPT_TEMPLATE_INTEGRATION_REPORT.md` why full integration was deferred.
- Ensure the workflow is still executable/repeatable via copy-paste from `AGENT_RAG_PREFLIGHT_TEMPLATE.md`.

### Task D — Validation Fixtures

Create and run 4 test examples. Save outputs as sample files in the contour folder.

**Example 1 — Planner:**
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "perf/process-stage-baseline-jank-v1" \
  --area "Diagram performance lag" \
  --format md --out .planning/contours/feature/processmap-agent-rag-agent-preflight-integration-v1/PREFLIGHT_PLANNER_SAMPLE.md
```
Expected: runtime facts, Diagram bottleneck facts, user rejection override, Agent 1 GSD rule, version/runtime proof rules, supporting docs.

**Example 2 — Reviewer:**
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "perf/process-stage-baseline-jank-v1" \
  --query "Diagram performance review rules" \
  --format json --out .planning/contours/feature/processmap-agent-rag-agent-preflight-integration-v1/PREFLIGHT_REVIEWER_SAMPLE.json
```
Expected: Agent 3 GSD rules, fresh 5180 proof, real user scenario, no REVIEW_PASS if user-visible lag remains, supporting reports.

**Example 3 — Policy:**
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --query "What is forbidden for RAG?" \
  --format md --out .planning/contours/feature/processmap-agent-rag-agent-preflight-integration-v1/PREFLIGHT_EXECUTOR_SAMPLE.md
```
Expected: no auto-mutation, no BPMN XML writes, no secrets, no AI drafts as truth, supporting policy docs.

**Example 4 — Runtime:**
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --query "current ProcessMap test runtime" \
  --format md
```
Expected: clearvestnic.ru, /opt/processmap-test, 5180, 8088, Project Atlas path.

### Task E — Re-run Existing Validators

```bash
# Facts validator
node tools/rag/pm-rag-validate-facts.mjs

# BM25 validation
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8

# Secrets scan
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json
```

Record outputs in `SECRETS_AND_SAFETY_REPORT.md` and note any changes from previous contours.

### Task F — Update Project Atlas

Create/update:
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Preflight Integration.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent RAG Preflight Template.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Preflight Output Examples.md`

### Task G — Create All Required Reports

Create inside contour folder:
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

## 4. Boundaries

**Allowed:**
- Add/change bounded tooling/config/docs for RAG preflight integration
- Create/change files under: `tools/rag/`, `scripts/rag/`, `docs/rag/`, `config/rag/`, `tools/pm-agent*.sh` (if safe), `.planning/contours/<CID>/`, Project Atlas
- Use Node built-ins only
- Use existing dependencies only if already available and justified

**Forbidden:**
- No product runtime behavior changes
- No frontend UI changes
- No backend API changes
- No package install
- No embeddings/vector DB
- No auto-mutation
- No commit/push/PR
- No deploy
- No secrets printed

---

## 5. Final Checklist Before READY_FOR_REVIEW

- [ ] `pm-rag-agent-preflight.mjs` exists and handles all required args
- [ ] `--role planner` produces correct output
- [ ] `--role executor` produces correct output
- [ ] `--role reviewer` produces correct output
- [ ] `--format md` works
- [ ] `--format json` works
- [ ] Sample outputs created for all 4 examples
- [ ] Facts validator still passes (28/28)
- [ ] BM25 validation still passes (7/7 or documented)
- [ ] Secrets scan clean or false positives documented
- [ ] No product runtime files changed
- [ ] No secrets printed
- [ ] Project Atlas updated
- [ ] All required reports created
- [ ] `READY_FOR_REVIEW` created
