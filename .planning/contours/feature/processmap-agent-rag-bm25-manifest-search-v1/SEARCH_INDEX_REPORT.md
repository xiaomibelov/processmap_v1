# SEARCH_INDEX_REPORT

**Contour:** `feature/processmap-agent-rag-bm25-manifest-search-v1`  
**Date:** 2026-05-16

---

## Index Builder Behavior

**File:** `tools/rag/pm-rag-build-search-index.mjs`

### Responsibilities
1. Reads manifest JSON from previous contour output.
2. Reads safe text content for each manifest entry.
3. Skips excluded/sensitive files (checks `excluded_sensitive` flag).
4. Chunks documents per content type.
5. Tokenizes and computes BM25 statistics.
6. Writes deterministic JSON index + human-readable MD summary.

### Chunking Strategy

| Content Type | Strategy |
|--------------|----------|
| Markdown | By heading (H1–H3 boundaries) |
| Contour reports | By heading (same as Markdown) |
| Code files (<200 lines) | Whole file |
| Code files (≥200 lines) | By function/class boundary heuristic; fallback to whole file |
| Other | Whole file |

### Tokenizer

- Lowercase
- Split on non-alphanumeric Unicode (`/[^a-zа-яё0-9]+/u`)
- Minimum term length: 2
- Stopword removal: minimal English + Russian sets

### BM25 Parameters

| Parameter | Value |
|-----------|-------|
| k1 | 1.2 |
| b | 0.75 |

### Statistics Computed

- `tf` — term frequency per chunk
- `df` — document frequency per term across corpus
- `idf` — inverse document frequency (`log(1 + (N - df + 0.5) / (df + 0.5))`)
- `avgdl` — average chunk length in tokens

---

## Corpus Stats

| Metric | Value |
|--------|-------|
| Manifest files | 500 |
| Total chunks | 6026 |
| Unique terms | 7307 |
| Average chunk length (avgdl) | 55.75 tokens |
| Index JSON size | ~16 MB |
| Index MD size | ~8 KB |

---

## Index Output Paths

- JSON: `.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.json`
- MD:   `.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.md`

---

## Determinism

- Chunk IDs are SHA-256 hashes of `path::heading::startLine` (first 16 hex chars).
- Chunks are sorted by `chunk_id` before writing.
- Same manifest input → same index output.
