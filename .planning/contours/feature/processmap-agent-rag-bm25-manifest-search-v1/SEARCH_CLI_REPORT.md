# SEARCH_CLI_REPORT

**Contour:** `feature/processmap-agent-rag-bm25-manifest-search-v1`  
**Date:** 2026-05-16

---

## Search CLI Behavior

**File:** `tools/rag/pm-rag-search.mjs`

### Interface

```bash
node tools/rag/pm-rag-search.mjs "<query>" [--top-k N] [--json] [--format md]
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--top-k N` | 5 | Number of results |
| `--json` | false | Output raw JSON array |
| `--format md` | false | Output markdown table + snippets |
| (default) | — | Human-readable plain text |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (invalid query, etc.) |
| 2 | Missing index file |

---

## Scoring Algorithm

1. Tokenize query with same tokenizer as index builder.
2. For each chunk, compute BM25 score per query term and sum.
3. Apply field/exact-match boosts:
   - Exact contour id match: +3.0
   - Exact path match: +2.0
   - Exact title/heading match: +2.0
   - Verdict exact match: +2.0
   - Source category match: +1.0
   - Recency (mtime < 30 days): +0.5
4. Sort by score descending (stable).
5. Return top-k.

---

## Sample Queries

### Query 1 — Plain Text

```bash
node tools/rag/pm-rag-search.mjs "latest rules for Diagram REVIEW_PASS" --top-k 8
```

**Result:** 8 results, top score 25.948. First result: Project Atlas reviewer prompt with exact title match.

### Query 2 — JSON

```bash
node tools/rag/pm-rag-search.mjs "perf diagram modeler drag hot path pointermove suppression" --top-k 10 --json
```

**Result:** 10 results, top score 42.403. All results from the exact perf contour, boosted by contour-id and path matches.

### Query 3 — Markdown

```bash
node tools/rag/pm-rag-search.mjs "current ProcessMap test runtime clearvestnic 5180" --top-k 5 --format md
```

**Result:** 5 results in Markdown table format with code-block snippets. Matched executor prompts containing runtime truth blocks.

---

## Snippet Rules

- Max ~600 chars (configurable).
- Sensitive values redacted (sk-*, JWT, connection strings, bearer tokens).
- Matched terms highlighted with `*term*` markers.
- Russian and English text preserved.
