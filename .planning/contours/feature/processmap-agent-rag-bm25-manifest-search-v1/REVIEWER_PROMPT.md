# Agent 3 / Reviewer Prompt

**Contour:** `feature/processmap-agent-rag-bm25-manifest-search-v1`  
**Run ID:** `20260516T144907Z-299`  
**Role:** Agent 3 / Reviewer — independent validation, no implementation changes.

---

## 1. Reviewer GSD Discipline — Mandatory

Before review, Agent 3 MUST run:

```bash
cd /opt/processmap-test

echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
```

If GSD is available:
- Use GSD review/check discipline.

If GSD is unavailable:
- Continue as `GSD_FALLBACK_MANUAL_REVIEW_ONLY`.
- Explicitly record fallback in `REVIEW_REPORT.md` under `## Reviewer GSD Discipline`.

**REVIEW_REPORT.md must contain:**

```markdown
## Reviewer GSD Discipline
- GSD mode: <mode>
- Commands run: <list>
- Source/runtime truth: <pwd, branch, HEAD, origin/main, status>
- Independent validation commands: <list>
- Validation query results: <summary>
- Pass/fail reasoning: <explicit>
```

**No REVIEW_PASS if:**
- Reviewer GSD section is missing.
- Search validation was not run.
- Validation queries were not checked.
- Secret exclusion was not verified.
- Product runtime was changed without scope justification.
- Search returns generic/useless output.

---

## 2. Pre-Flight Checklist

1. Read `PLAN.md`, `EXECUTOR_PROMPT.md`, `STATE.json` in this contour.
2. Read Agent 2's `EXEC_REPORT.md` and all other reports.
3. Capture independent source/runtime truth:
   - `pwd`, `whoami`, `hostname`, `date -Is`
   - `git status -sb`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
   - `git diff --name-only`
4. Compare against Agent 1 and Agent 2 truth. Document any divergence.

---

## 3. File Inspection Checklist

Inspect these paths and confirm they exist and are reasonable:

| # | Expected Path | Check |
|---|---------------|-------|
| 1 | `tools/rag/pm-rag-build-search-index.mjs` | Exists, executable, Node built-ins only |
| 2 | `tools/rag/pm-rag-search.mjs` | Exists, executable, CLI flags work |
| 3 | `tools/rag/pm-rag-run-validation-queries.mjs` | Exists, executable, reads fixture |
| 4 | `tools/rag/processmap-rag-validation-queries.json` | Exists, contains 7 queries + expected terms + pass criteria |
| 5 | `tools/rag/pm-rag-agent-preflight.mjs` | If exists; if not, documented as next contour |
| 6 | Contour reports (`EXEC_REPORT.md`, `SEARCH_INDEX_REPORT.md`, etc.) | Exist, non-empty, dated |
| 7 | `RAG_SEARCH_VALIDATION_RESULTS.json` | Exists, objective pass/fail per query |
| 8 | `RAG_SEARCH_VALIDATION_RESULTS.md` | Exists, human-readable |
| 9 | `RAG_SEARCH_INDEX_SAMPLE.json` | Exists, contains chunks with metadata |
| 10 | Project Atlas updates | `/srv/obsidian/project-atlas/ProcessMap/RAG/BM25 Manifest Search.md` exists |

---

## 4. Independent Validation Commands

Agent 3 MUST run these independently and record outputs:

```bash
# 1. Policy validation (must still pass)
node tools/rag/pm-rag-validate-policy.mjs

# 2. Secrets scan (must still pass, no new leaks)
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json

# 3. Build search index (or reuse Agent 2 index if documented)
node tools/rag/pm-rag-build-search-index.mjs \
  --manifest .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json

# 4. Search: Diagram REVIEW_PASS rules
node tools/rag/pm-rag-search.mjs "latest rules for Diagram REVIEW_PASS" --top-k 8

# 5. Search: Drag hot path history
node tools/rag/pm-rag-search.mjs "What happened in perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1" --top-k 8

# 6. Search: RAG forbidden actions
node tools/rag/pm-rag-search.mjs "What is forbidden for RAG" --top-k 8

# 7. Search: Indexed paths
node tools/rag/pm-rag-search.mjs "Which paths should be indexed" --top-k 8

# 8. Search: Test runtime
node tools/rag/pm-rag-search.mjs "current ProcessMap test runtime" --top-k 8

# 9. Validation query runner
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```

For each search, verify:
- Results are ranked by score.
- Snippets are present and specific (not generic).
- Metadata includes path, title, category, contour_id, verdict.
- Expected terms from validation fixture appear in top-k snippets.
- Expected path patterns appear in top-k results.

---

## 5. Exclusion Verification

Verify these paths do NOT appear in index or search results:

```bash
grep -E '"path".*\.env' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.json || echo "PASS: no .env"
grep -E '"path".*node_modules' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.json || echo "PASS: no node_modules"
grep -E '"path".*dist/' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.json || echo "PASS: no dist"
grep -E '"path".*__pycache__' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.json || echo "PASS: no __pycache__"
grep -E '"path".*\.pem' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.json || echo "PASS: no .pem"
grep -E '"path".*\.agents' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.json || echo "PASS: no .agents"
grep -E '"path".*\.playwright-mcp' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.json || echo "PASS: no .playwright-mcp"
```

All must show `PASS`.

---

## 6. Secret Value Verification

- Search CLI output must NOT contain secret values (passwords, tokens, keys).
- If any result snippet contains a flagged pattern, it must be redacted or skipped.
- Document any findings.

---

## 7. Product Runtime Change Verification

- `git diff --name-only` must NOT show new product runtime changes introduced by this contour.
- Pre-existing 8 frontend modifications from `fix/lockfile-sync-test` are acceptable and unrelated.
- No `package.json`, `requirements.txt`, lockfile changes.
- No `.env` modifications.
- No backend API route changes.
- No frontend component changes.

---

## 8. No Embeddings / Vector DB / Package Install Verification

- No `npm install` or `pip install` artifacts.
- No `node_modules` changes (except pre-existing).
- No vector DB process running (no milvus, pinecone, chroma, qdrant, weaviate, pgvector).
- No embedding model files downloaded.

---

## 9. Verdict

### REVIEW_PASS conditions

ALL must be true:
1. Reviewer GSD Discipline section present and complete.
2. Search index builder exists and runs without error.
3. Search CLI exists and returns ranked results with scores/snippets/metadata.
4. Validation query runner exists and ran 7+ queries.
5. Validation fixture exists with expected terms and pass criteria.
6. At least 5/6 primary validation queries pass (Query 7 is bonus).
7. Any failing query has specific fix plan or next contour documented.
8. Secrets scanner still passes.
9. Excluded files not in index/results.
10. No secret values printed.
11. No product runtime changes.
12. No package install.
13. No embeddings/vector DB.
14. Project Atlas docs updated.
15. Agent preflight usage documented.

### CHANGES_REQUESTED conditions

If ANY of the following:
- Search results are generic/useless (no specific paths/terms).
- Validation queries fail without documented reason/fix plan.
- Product runtime files were changed.
- Secrets leaked in output.
- Package installed or vector DB started.
- Missing reports or artifacts.
- Search index missing or broken.

Then create:
- `REVIEW_REPORT.md` with `CHANGES_REQUESTED`
- `REWORK_REQUEST.md` with specific, actionable fixes

---

## 10. Final Markers

- Create `REVIEW_REPORT.md` with verdict and all evidence.
- If `REVIEW_PASS`: create `REVIEW_PASS` marker file.
- If `CHANGES_REQUESTED`: create `CHANGES_REQUESTED` marker file + `REWORK_REQUEST.md`.
- Write `REVIEW_RUN_ID` containing exactly: `20260516T144907Z-299`
