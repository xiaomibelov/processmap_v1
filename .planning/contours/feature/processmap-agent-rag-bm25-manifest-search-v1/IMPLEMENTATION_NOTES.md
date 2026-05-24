# IMPLEMENTATION_NOTES

**Contour:** `feature/processmap-agent-rag-bm25-manifest-search-v1`  
**Run ID:** `20260516T144907Z-299`

---

## Technical Approach

All tooling was implemented using **Node.js built-ins only** (`fs`, `path`, `crypto`, `child_process`, `process`). No external packages were installed.

### BM25 Implementation

- Standard BM25 formula with Robertson/Sparck Jones IDF variant.
- `idf = log(1 + (N - df + 0.5) / (df + 0.5))`
- Score per term = `idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl/avgdl))`
- Sum over query terms.

### Tokenization

- Unicode-aware regex `/[^a-zа-яё0-9]+/u` splits on any non-alphanumeric character.
- Supports English and Russian terms.
- Stopword list is minimal (~50 words) to avoid over-filtering technical terms.

### Chunking Heuristics

- Markdown: H1–H3 boundaries using `^(#{1,3})\s+(.+)$` regex.
- Code ≥200 lines: function/class/const/def boundaries using a broad regex. This is intentionally simple to avoid parsing complexity.
- Fallback to whole-file chunking when no boundaries are detected.

### Boosts

Boosts are applied at query time, not index time. This keeps the index generic and allows future query syntax changes without rebuilding.

---

## Deviations from Plan

### 1. Agent Preflight Helper

**Plan expectation:** Optional `pm-rag-agent-preflight.mjs` implementation.

**Actual:** Not implemented due to time/complexity budget. Documented as next contour proposal in `AGENT_PREFLIGHT_USAGE.md`.

### 2. Manifest `--limit` Source Distribution

**Plan expectation:** Preferred `--sample-balanced` or `--per-source-limit` flag.

**Actual:** Not implemented. The manifest builder's `--limit` behavior is order-dependent (first source fills cap). Documented as next contour proposal.

### 3. Validation Query Pass Rate

**Plan expectation:** "Validation results are mostly pass."

**Actual:** 4/7 pass (57%). Three failures are due to BM25 lexical limitations and sample cap constraints, not implementation bugs. All failures are documented with root-cause analysis.

---

## Known Limitations

1. **No semantic matching:** BM25 is lexical. Paraphrased queries or conceptually related terms will not match unless they share exact words.
2. **Index size:** ~16 MB for 500 files. A full manifest (~5000+ files) could produce 100+ MB. Should be stored outside the repo or gzip-compressed.
3. **Code chunking is heuristic-based:** Function boundary detection uses regex, not AST parsing. Complex nested functions may be chunked sub-optimally.
4. **No query syntax:** No `category:`, `contour:`, or `path:` filters yet. All terms are treated as text.
5. **Snippet quality:** Snippets are built from `snippet_seed` (first 200 chars of chunk body). For large chunks, the matched terms may not appear in the snippet.
6. **Russian tokenization:** Handles Cyrillic letters but does not perform stemming or lemmatization.
7. **No incremental updates:** Rebuilding the index requires re-processing the entire manifest.

---

## Suggestions for Next Contours

- **Contour `feature/processmap-agent-rag-preflight-helper-v1`:** Implement `pm-rag-agent-preflight.mjs` with role-based query generation.
- **Contour `feature/processmap-agent-rag-query-syntax-v1`:** Add `category:`, `contour:`, `path:`, `verdict:` query filters.
- **Contour `feature/processmap-agent-rag-embeddings-v1`:** Integrate vector embeddings for semantic search (requires package install and embedding model).
- **Contour `feature/processmap-agent-rag-balanced-sample-v1`:** Add `--per-source-limit` to manifest builder for fair source distribution.
- **Contour `feature/processmap-agent-rag-incremental-index-v1`:** Add mtime-based incremental index updates.
