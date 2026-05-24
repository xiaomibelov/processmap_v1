# Implementation Notes

**Contour:** `feature/processmap-agent-rag-agent-preflight-integration-v1`  
**Date:** 2026-05-16  
**Agent 2 / Executor**

## Architecture

```
┌─────────────────────────────────────┐
│  pm-rag-agent-preflight.mjs         │
│  ─────────────────────────          │
│  1. Parse args (--role, --contour)  │
│  2. Load facts (*.json, *.ndjson)   │
│  3. Tokenize query + area           │
│  4. Score facts (query + role +     │
│     contour + status boost)         │
│  5. Spawn pm-rag-search.mjs         │
│  6. Deduplicate / compose pack      │
│  7. Render md or json               │
└─────────────────────────────────────┘
```

## Design Decisions

### Facts-first, BM25-second
Facts are loaded synchronously from `tools/rag/facts/` and scored in-memory. BM25 is spawned as a child process only if a query is provided. This ensures:
- Deterministic output when facts alone are sufficient
- Fast feedback (< 100ms for facts-only mode)
- Graceful degradation if BM25 index is missing

### Role Boosts
Hardcoded heuristic weights based on agent responsibilities:

| Fact Type | Planner | Executor | Reviewer |
|-----------|---------|----------|----------|
| agent_rule (role-specific) | +3 (agent1) | +3 (agent2) | +3 (agent3) |
| agent_rule (all) | +2 | +2 | +2 |
| bottleneck_fact | +2 | — | — |
| decision_fact | +1 | +2 | — |
| user_rejection_fact | — | — | +3 |
| validation_fact | +1 | +1 | +2 |
| runtime_fact | +1 | +1 | +1 |
| contour_fact | +1 | +1 | +1 |

### Contour Boost
If `--contour` matches `fact.contour_id` (substring or exact), +3 is added. This ensures contour-specific facts surface even when query tokens are sparse.

### Status Handling
- `active`: +1
- `draft`: -1
- `superseded` / `deprecated`: -2 (and flagged in warnings)

### Redaction
Same regexes as `pm-rag-search.mjs`:
- OpenAI keys (`sk-...`)
- JWT tokens (`eyJ...`)
- MongoDB/PostgreSQL/Redis connection strings
- Bearer tokens

### No Mutation Guarantee
The CLI:
- Only reads files (facts, index)
- Only writes if `--out` is provided
- Does not spawn any tool that modifies product code
- Does not read `.env`, `.pem`, or `.key` files

## Reuse of Existing Tools

| Component | Reused From | How |
|-----------|-------------|-----|
| Facts loading | `pm-rag-search-facts.mjs` | Same JSON/NDJSON pattern |
| BM25 search | `pm-rag-search.mjs` | Spawned with `--json --top-k N` |
| Redaction | `pm-rag-search.mjs` | Same `redactSensitive()` function copied |
| Tokenization | `pm-rag-search.mjs` / `pm-rag-search-facts.mjs` | Similar split/filter logic |

## File Inventory

### Created
- `tools/rag/pm-rag-agent-preflight.mjs` (445 lines)
- `tools/rag/AGENT_RAG_PREFLIGHT_TEMPLATE.md` (172 lines)
- `.planning/contours/feature/processmap-agent-rag-agent-preflight-integration-v1/*` (12 files)

### Modified
- None

## Future Improvements (out of scope)

1. Load BM25 index directly instead of spawning child process (reduces latency ~500ms).
2. Add `--fact-type` filter to narrow results.
3. Add `--since` date filter for recent contours.
4. Integrate preflight output auto-injection into agent launcher scripts (deferred to future contour).
