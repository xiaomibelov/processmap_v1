# Agent 2 / Executor Prompt

**Contour:** `feature/processmap-agent-rag-bm25-manifest-search-v1`  
**Run ID:** `20260516T144907Z-299`  
**Role:** Agent 2 / Executor — implementation only, no planning changes without Agent 1 approval.

---

## 1. Pre-Flight Checklist

Before writing any code, Agent 2 MUST:

1. Read `PLAN.md` in this contour folder.
2. Read `RUNTIME_NAVIGATION.md` and `RUNTIME_PROOF_CHECKLIST.md`.
3. Read `STATE.json` to confirm boundaries.
4. Read previous contour reports:
   - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/EXEC_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/REVIEW_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/SOURCE_REGISTRY_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/INDEXING_POLICY_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/SECRETS_SCAN_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/MANIFEST_BUILD_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/VALIDATION_RESULTS.md`
5. Capture source/runtime truth:
   - `pwd`, `whoami`, `hostname`, `date -Is`
   - `git status -sb`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
   - `git diff --name-only`
6. Confirm current branch and HEAD match Agent 1 capture (or document divergence).

---

## 2. Boundaries (Hard Rules)

| Action | Allowed? |
|--------|----------|
| Add tooling/config/docs for BM25/lexical search | ✅ Yes |
| Create files under `tools/rag/` | ✅ Yes |
| Create files under `scripts/rag/` | ✅ Yes |
| Create files under `docs/rag/` | ✅ Yes |
| Create files under `.planning/contours/<CID>/` | ✅ Yes |
| Create/update Project Atlas files under `/srv/obsidian/project-atlas/ProcessMap/RAG/` | ✅ Yes |
| Modify product runtime files (frontend/src, backend/app) | ❌ NO |
| Modify `.env` or secrets | ❌ NO |
| Install packages (npm, pip, etc.) | ❌ NO |
| Start embeddings/vector DB service | ❌ NO |
| Auto-mutate code or files | ❌ NO |
| Write BPMN XML | ❌ NO |
| Apply Product Actions automatically | ❌ NO |
| Commit / push / PR | ❌ NO |
| Deploy to stage/prod | ❌ NO |

---

## 3. Implementation Tasks

### 3A. BM25 Search Index Builder

**File:** `tools/rag/pm-rag-build-search-index.mjs`

Requirements:
- Node built-ins only. No `npm install`.
- Read manifest JSON from previous contour output OR regenerate via `pm-rag-build-manifest.mjs`.
- Read safe text content for each manifest entry.
- Chunk docs:
  - Markdown: by heading (H1-H3 boundaries).
  - Code files (<200 lines): by file.
  - Code files (≥200 lines): by function/class boundary if detectable; otherwise by file.
  - Contour reports: by section heading.
- Tokenize:
  - lowercase;
  - split on non-alphanumeric Unicode;
  - keep English and Russian terms;
  - optional stopword removal (English + Russian minimal set).
- Compute BM25 statistics:
  - term frequency (tf);
  - document frequency (df);
  - inverse document frequency (idf);
  - average chunk length (avgdl);
  - chunk length normalization.
- Parameters: `k1 = 1.2`, `b = 0.75`.
- Store index as JSON with metadata per chunk.
- Deterministic output.
- Skip excluded/sensitive files (reuse registry exclusions).

**Index JSON schema (per chunk):**
```json
{
  "chunk_id": "uuid",
  "path": "absolute/path/to/file",
  "title": "Heading or filename",
  "source_id": "registry-source-id",
  "category": "contour",
  "document_class": "decision",
  "contour_id": "perf/...-v1",
  "verdict": "REVIEW_PASS",
  "date": "2026-05-16T...",
  "mtime": "2026-05-16T...",
  "tokens": ["term1", "term2", ...],
  "tf": {"term1": 3, "term2": 1},
  "length": 150,
  "snippet_seed": "first 200 chars of content"
}
```

Store `df` and `idf` at top level of index JSON, not per chunk.

### 3B. Search CLI

**File:** `tools/rag/pm-rag-search.mjs`

Requirements:
- Read index JSON.
- Tokenize query with same tokenizer as builder.
- Score each chunk with BM25.
- Apply boosts:
  - exact contour id match: +3.0
  - exact path match: +2.0
  - exact title/heading match: +2.0
  - verdict exact match: +2.0
  - source category match: +1.0
  - recency (mtime < 30 days): +0.5
- Sort by score descending.
- Return top-k.

**Output formats:**
- Default: human-readable plain text with rank, score, path, title, snippet, matched terms.
- `--json`: JSON array of result objects.
- `--format md`: Markdown with table + code blocks for snippets.

**Result object fields:**
- rank, score, path, title, source_id, category, document_class, contour_id, verdict, snippet, matched_terms, boosts_applied, date, mtime, metadata_summary.

**Snippet rules:**
- 400–800 chars max.
- Preserve Russian/English.
- Redact sensitive.
- Highlight matched terms with `*term*` if feasible.

### 3C. Validation Query Runner

**File:** `tools/rag/pm-rag-run-validation-queries.mjs`

Requirements:
- Read `tools/rag/processmap-rag-validation-queries.json`.
- Run each query via search CLI logic (can import or spawn).
- Compare top-k results against expected_terms and expected_path_patterns.
- Produce pass/fail per query.
- Write:
  - `.planning/contours/<CID>/RAG_SEARCH_VALIDATION_RESULTS.json`
  - `.planning/contours/<CID>/RAG_SEARCH_VALIDATION_RESULTS.md`

### 3D. Validation Query Fixture

**File:** `tools/rag/processmap-rag-validation-queries.json`

Must contain all 7 queries from architecture contour with:
- query string;
- expected_terms (array);
- expected_path_patterns (array of glob-like strings);
- expected_answer_summary;
- pass_criteria.

### 3E. Agent Preflight Helper (Optional)

**File:** `tools/rag/pm-rag-agent-preflight.mjs`

If time/complexity allows:
- `--role planner|executor|reviewer`
- `--area "keywords"`
- `--contour "contour-id"`
- Output: suggested queries + top results + compact context block.

If not implemented, document as next contour proposal.

### 3F. Minor Fixes from Previous Contour

1. **Scanner `--path` ENOTDIR:**
   - In `tools/rag/pm-rag-scan-secrets.mjs`, add `stat` check in `walkDir`.
   - If `--path` points to a file (not directory), scan it directly.
   - If fix is trivial (< 5 lines), apply. Otherwise document in IMPLEMENTATION_NOTES.

2. **Manifest `--limit` source distribution:**
   - Preferred: add `--sample-balanced` or `--per-source-limit N` flag to `pm-rag-build-manifest.mjs`.
   - If too complex, document limitation and next contour.

3. **False positives:**
   - Keep fail-closed.
   - Do NOT weaken scanner globally.
   - Optional: add per-path allowlist if safe and scoped.

---

## 4. Validation Commands Agent 2 Must Run

Run these commands and include outputs in reports:

```bash
# 1. Policy validation (reuse)
node tools/rag/pm-rag-validate-policy.mjs

# 2. Secrets scan (reuse)
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json

# 3. Manifest build (reuse)
node tools/rag/pm-rag-build-manifest.mjs --sample --limit 500

# 4. Search index build
node tools/rag/pm-rag-build-search-index.mjs \
  --manifest .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json

# 5. Search query examples
node tools/rag/pm-rag-search.mjs "latest rules for Diagram REVIEW_PASS" --top-k 8
node tools/rag/pm-rag-search.mjs "perf diagram modeler drag hot path pointermove suppression" --top-k 10 --json
node tools/rag/pm-rag-search.mjs "current ProcessMap test runtime clearvestnic 5180" --top-k 5 --format md

# 6. Validation query runner
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```

---

## 5. Required Reports

Create inside contour folder:

| Report | Purpose |
|--------|---------|
| `EXEC_REPORT.md` | Summary of what was implemented, files created, commands run |
| `SEARCH_INDEX_REPORT.md` | Index builder behavior, corpus stats, index path |
| `SEARCH_CLI_REPORT.md` | Search CLI behavior, sample queries, output format verification |
| `VALIDATION_QUERY_RESULTS.md` | Per-query results, pass/fail, specific findings |
| `AGENT_PREFLIGHT_USAGE.md` | Agent 1/2/3 usage examples and query patterns |
| `SECRETS_AND_EXCLUSIONS_RECHECK.md` | Secrets scan results, exclusion verification |
| `RUNTIME_BEHAVIOR_IMPACT.md` | Confirmation that no product runtime files were changed |
| `IMPLEMENTATION_NOTES.md` | Technical decisions, limitations, next contour proposals |

Generated artifacts:

| Artifact | Purpose |
|----------|---------|
| `RAG_SEARCH_INDEX_SAMPLE.json` | Sample of built index |
| `RAG_SEARCH_INDEX_SAMPLE.md` | Human-readable sample index summary |
| `RAG_SEARCH_VALIDATION_RESULTS.json` | Machine-readable validation results |
| `RAG_SEARCH_VALIDATION_RESULTS.md` | Human-readable validation report |

---

## 6. Project Atlas Updates

Create or update:

```
/srv/obsidian/project-atlas/ProcessMap/RAG/BM25 Manifest Search.md
/srv/obsidian/project-atlas/ProcessMap/RAG/Search Validation Results.md
/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Preflight Usage.md
```

Mirror the key contents from contour reports. Keep Obsidian files concise and linking-friendly.

---

## 7. Final Markers

- If complete and unblocked: create `READY_FOR_REVIEW` in contour folder.
- If blocked: create `EXEC_BLOCKED.md` with specific blocker, do NOT create `READY_FOR_REVIEW`.
- Write `EXECUTION_RUN_ID` containing exactly: `20260516T144907Z-299`
