# Agent RAG Preflight Template

Shared template for running ProcessMap Agent RAG preflight across Agent 1 (Planner), Agent 2 (Executor), and Agent 3 (Reviewer).

## Core Principle

```
Step 1: Query structured facts first (deterministic, fast, curated)
Step 2: Query BM25 supporting documents second (broader context, snippets)
Step 3: Compose compact context pack (deduplicated, ranked, gated)
```

## Running Preflight

### Agent 1 — Planner

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "$CID" \
  --area "<area from task>" \
  --format md --out .planning/contours/$CID/RAG_PREFLIGHT_PLANNER.md
```

### Agent 2 — Executor

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "$CID" \
  --area "<area>" \
  --query "<contextual query>" \
  --format md --out .planning/contours/$CID/RAG_PREFLIGHT_EXECUTOR.md
```

### Agent 3 — Reviewer

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "$CID" \
  --query "<review focus>" \
  --format md --out .planning/contours/$CID/RAG_PREFLIGHT_REVIEWER.md
```

## CLI Arguments

| Arg | Required | Values | Description |
|-----|----------|--------|-------------|
| `--role` | Yes | `planner` \| `executor` \| `reviewer` | Agent role |
| `--contour` | No | `<contour_id>` | Target contour |
| `--area` | No | `<topic>` | Topic/area filter |
| `--query` | No | `<free text>` | BM25 supplement query |
| `--top-k` | No | N (default 5) | BM25 docs count |
| `--format` | No | `md` (default) or `json` | Output format |
| `--out` | No | `<file>` | Output file (default stdout) |

## Output Sections

### Markdown (default)

1. `# ProcessMap Agent RAG Preflight`
2. `## Input` — role, contour, area/query, generated_at
3. `## Structured Facts` — Runtime Facts, Agent Rules, User Rejections, Contour Facts, Decisions, Bottlenecks, Validation Facts
4. `## Supporting Documents` — rank, score, path, title, source/category, snippet, why_matched
5. `## Required Gates` — role-specific checklist
6. `## Warnings` — user rejection overrides, deprecated facts, missing coverage, no-secrets reminder
7. `## Suggested Next Queries` — 3-5 follow-up commands

### JSON

Equivalent structured JSON with `input`, `structured_facts`, `supporting_documents`, `required_gates`, `warnings`, `suggested_queries`.

## Role-Specific Gates

### Planner
- GSD discipline recorded
- Source/runtime truth captured
- Bounded scope defined in PLAN.md
- Acceptance criteria defined
- User rejection facts reviewed
- No product code written by Agent 1
- No merge/deploy/PR without explicit approval

### Executor
- Source/runtime truth confirmed before implementation
- Bounded contour scope respected
- No product runtime changes unless explicitly allowed
- No secrets printed in output
- No auto-mutation of BPMN XML or Product Actions
- RAG read-only boundary respected
- Runtime evidence collected for Agent 3

### Reviewer
- Reviewer GSD discipline section present in REVIEW_REPORT.md
- Fresh runtime proof collected (5180/8088)
- Exact user scenario reproduced
- Before/after evidence collected
- User rejection override checked
- No REVIEW_PASS if user-visible scenario still fails
- Product runtime unchanged without scope

## Report Integration

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

## Warnings and Overrides

- **User rejections override formal REVIEW_PASS** — always check `user_rejection_fact` entries.
- **Deprecated/superseded facts** — facts with `status: superseded` or `status: deprecated` are deprioritized.
- **Missing coverage** — if no runtime facts or agent rules match, note the gap.
- **No secrets** — preflight output is redacted but still do not paste it into untrusted channels.

## Non-goals and Boundaries

- No product runtime behavior changes via preflight.
- No frontend UI changes.
- No backend API changes.
- No package installation.
- No embeddings / vector DB.
- No auto-mutation.
- No commit/push/PR.
- No deploy.
- No secrets printed.
