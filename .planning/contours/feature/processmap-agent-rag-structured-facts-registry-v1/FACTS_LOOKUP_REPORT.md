# FACTS_LOOKUP_REPORT

**Contour:** `feature/processmap-agent-rag-structured-facts-registry-v1`
**Date:** 2026-05-16

---

## Tool

`node tools/rag/pm-rag-search-facts.mjs "<query>" [--type <type>] [--status <status>] [--top-k N] [--json]`

## Example Queries and Results

### Query 1: "Diagram REVIEW_PASS rules"

```bash
node tools/rag/pm-rag-search-facts.mjs "Diagram REVIEW_PASS rules"
```

**Results:** 10 facts returned.
- Top: `val-q1-diagram-review-pass-rules` (validation_fact)
- Strong matches on `id_match`, `summary_match`
- Includes user_rejection_facts and bottleneck_facts related to diagram performance

### Query 2: "current ProcessMap test runtime" (JSON)

```bash
node tools/rag/pm-rag-search-facts.mjs "current ProcessMap test runtime" --json
```

**Results:** 10 facts returned.
- Top: `val-q6-test-runtime` (validation_fact, score 27)
- Runtime facts: `rt-git-branch`, `rt-repo-root`, `rt-contour-root`, `rt-server-host`, `rt-frontend-url`, `rt-api-health-url`
- Exact phrase match boost active on validation_fact summary

### Query 3: "contours where user rejected REVIEW_PASS" --type user_rejection_fact

```bash
node tools/rag/pm-rag-search-facts.mjs "contours where user rejected REVIEW_PASS" --type user_rejection_fact
```

**Results:** 5 facts returned (all user_rejection_facts).
- `ur-perf-drag-hot-path` — critical
- `ur-fix-drag-ledger-rework` — high
- `ur-fix-real-drag-engine` — high
- `ur-synthetic-zoom-not-drag` — critical
- `ur-version-marker-on-canvas` — medium

### Query 4: "React bundle 95 CPU drag bottleneck" --top-k 10

```bash
node tools/rag/pm-rag-search-facts.mjs "React bundle 95 CPU drag bottleneck" --top-k 10
```

**Results:** 10 facts returned.
- Top: `bn-react-cpu-95` (bottleneck_fact, strong id/type/summary/problem/hypothesis/evidence match)
- `bn-diagram-drag-lag` — second bottleneck fact
- Multiple user_rejection_facts and contour_facts related to drag performance

### Query 5: "RAG validation 7 of 7 coverage hardening" --top-k 10

```bash
node tools/rag/pm-rag-search-facts.mjs "RAG validation 7 of 7 coverage hardening" --top-k 10
```

**Results:** 10 facts returned.
- Top: `bn-rag-retrieval-7of7` (bottleneck_fact)
- `cf-rag-coverage-hardening` (contour_fact)
- `val-coverage-hardening-summary` (validation_fact)
- Related RAG contour facts and bootstrap facts

## Ranking Behavior

- `id` match: weight 5
- `type` match: weight 4
- `summary` / key fields: weight 3
- `rationale` / findings: weight 2
- `source_refs` / `status`: weight 1
- Exact phrase match in summary: +3 bonus
- Results sorted by score descending
