# REVIEWER_PROMPT — Agent 3 / Reviewer

**Contour:** `feature/processmap-agent-rag-coverage-and-validation-hardening-v1`
**Run ID:** `20260516T151430Z-2767`
**Agent:** Agent 3 / Reviewer

---

## Reviewer GSD Discipline — Mandatory

Agent 3 обязан перед review выполнить:

```bash
cd /opt/processmap-test

echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
```

Если GSD доступен:
- использовать GSD review/check discipline.

Если GSD недоступен:
- продолжить как `GSD_FALLBACK_MANUAL_REVIEW_ONLY`;
- явно записать fallback в `REVIEW_REPORT.md`.

## Source / Runtime Truth Capture

Record in `REVIEW_REPORT.md`:

```bash
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

## Pre-Review Reading List

Read ALL of the following before running any commands:

1. `PLAN.md` (this contour)
2. `EXECUTOR_PROMPT.md` (this contour)
3. Agent 2 `EXEC_REPORT.md`
4. Agent 2 `COVERAGE_HARDENING_REPORT.md`
5. Agent 2 `SOURCE_BALANCED_MANIFEST_REPORT.md`
6. Agent 2 `SEARCH_RANKING_IMPROVEMENTS.md`
7. Agent 2 `VALIDATION_HARDENING_RESULTS.md`
8. Agent 2 `VALIDATION_QUERY_RESULTS.md`
9. Agent 2 `SECRETS_AND_EXCLUSIONS_RECHECK.md`
10. Agent 2 `RUNTIME_BEHAVIOR_IMPACT.md`
11. Agent 2 `IMPLEMENTATION_NOTES.md`
12. Previous contour `REVIEW_REPORT.md` and `EXEC_REPORT.md` (for baseline comparison)

## Independent Validation Commands

Run each command independently and record outputs:

### Policy & Secrets

```bash
node tools/rag/pm-rag-validate-policy.mjs
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json
```

### Manifest & Index Build

```bash
node tools/rag/pm-rag-build-manifest.mjs --source-balanced --per-source-limit 100
# or
node tools/rag/pm-rag-build-manifest.mjs --full
```

```bash
node tools/rag/pm-rag-build-search-index.mjs --manifest .planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_MANIFEST_BALANCED.json
```

### Search Queries

Run at least these 5 searches independently:

```bash
node tools/rag/pm-rag-search.mjs "What are the latest rules for Diagram REVIEW_PASS?" --top-k 8 --json
node tools/rag/pm-rag-search.mjs "What happened in perf diagram modeler drag hot path pointermove suppression?" --top-k 10 --json
node tools/rag/pm-rag-search.mjs "What are current Diagram lag bottlenecks?" --top-k 8 --json
node tools/rag/pm-rag-search.mjs "What is forbidden for RAG?" --top-k 8 --json
node tools/rag/pm-rag-search.mjs "What is current ProcessMap test runtime?" --top-k 5 --json
```

### Validation Runner

```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8 --manifest .planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_MANIFEST_BALANCED.json
```

## Verification Checklist

### 1. Source-Balanced Coverage

- [ ] Open `RAG_COVERAGE_REPORT.json` or `.md`.
- [ ] Verify each of the 8 sources has `files_included > 0`.
- [ ] Verify `project-atlas` does not have > 50% of total files unless `--full` mode was used and total is justified.
- [ ] Grep the manifest for source id presence:
  ```bash
  grep -c '"source_id": "project-atlas"' .planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_MANIFEST_BALANCED.json
  grep -c '"source_id": "planning-contours"' ...
  grep -c '"source_id": "docs-curated"' ...
  grep -c '"source_id": "handoff-notes"' ...
  grep -c '"source_id": "frontend-src"' ...
  grep -c '"source_id": "backend-src"' ...
  grep -c '"source_id": "tools-src"' ...
  grep -c '"source_id": "scripts-src"' ...
  ```

### 2. Validation Pass Rate

- [ ] Validation runner executed all 7 queries.
- [ ] `RAG_SEARCH_VALIDATION_RESULTS.json` contains per-query `status`.
- [ ] `summary.pass_count` and `summary.fail_count` are computed from per-query statuses.
- [ ] Pass rate is ≥ 6/7.
- [ ] If 6/7, the remaining failure has a precise root cause and concrete next fix documented.
- [ ] If < 6/7, fail review.
- [ ] `EXEC_REPORT.md` quotes the exact same numbers as the JSON.
- [ ] No discrepancy between JSON, EXEC_REPORT, and your independent re-run.

### 3. Search Result Quality

- [ ] Results include `rank`, `score`, `path`, `title`, `source_id`, `category`, `document_class`, `verdict`.
- [ ] Results include `snippet` with matched term highlighting.
- [ ] Results include `why_matched` array.
- [ ] Snippets are specific (not generic copy-paste).
- [ ] No secret values in snippets.

### 4. Exclusion Verification

```bash
grep -E '"path".*\.env' .planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_MANIFEST_BALANCED.json || echo "PASS: no .env"
grep -E '"path".*node_modules' ... || echo "PASS: no node_modules"
grep -E '"path".*frontend/dist' ... || echo "PASS: no frontend/dist"
grep -E '"path".*__pycache__' ... || echo "PASS: no __pycache__"
grep -E '"path".*\.agents' ... || echo "PASS: no .agents"
grep -E '"path".*\.playwright-mcp' ... || echo "PASS: no .playwright-mcp"
```

All must PASS.

### 5. Secret Value Verification

- [ ] Search CLI output does NOT contain secret values.
- [ ] No `sk-*`, JWT, bearer tokens, connection strings observed.
- [ ] Scanner findings (if any) are documented as false positives or expected.
- [ ] Fail-closed policy maintained.

### 6. Product Runtime Change Verification

- [ ] `git diff --name-only` shows only pre-existing 8 frontend files (unrelated) or no changes.
- [ ] No changes to `frontend/src/` product code by this contour.
- [ ] No changes to `backend/app/`.
- [ ] No changes to `.env`.
- [ ] No changes to `package.json`, `requirements.txt`, or lockfiles.

### 7. No Embeddings / Vector DB / Package Install

- [ ] No `npm install` or `pip install` artifacts.
- [ ] No `node_modules` changes in `tools/rag/`.
- [ ] No vector DB process running (no milvus, pinecone, chroma, qdrant, weaviate, pgvector).
- [ ] No embedding model files downloaded.

### 8. Project Atlas Updates

- [ ] `/srv/obsidian/project-atlas/ProcessMap/RAG/Coverage and Validation Hardening.md` exists and is non-empty.
- [ ] `/srv/obsidian/project-atlas/ProcessMap/RAG/Search Validation Results.md` updated.

## Review Report Requirements

`REVIEW_REPORT.md` must contain:

1. **Reviewer GSD Discipline** — GSD mode, commands run, source/runtime truth.
2. **Independent Validation Commands** — exact commands run and their results.
3. **Validation Query Results** — per-query status, terms matched, paths matched.
4. **Coverage Checks** — per-source inclusion counts.
5. **Pass / Fail Reasoning** — explicit rationale for each query and overall verdict.
6. **Verdict** — either `REVIEW_PASS` or `CHANGES_REQUESTED`.

## No REVIEW_PASS Conditions

Do NOT grant `REVIEW_PASS` if ANY of the following are true:

- Reviewer GSD section missing.
- Validation queries not independently run.
- Validation pass rate < 6/7.
- Validation pass rate 6/7 but remaining failure lacks precise root cause + next fix.
- Source-balanced coverage not proven (any source has 0 included files).
- Source coverage remains biased (one source > 60% of capped manifest without justification).
- Secret exclusions weakened.
- Product runtime changed without scope.
- Search output remains generic/useless.
- Validation count discrepancy remains (JSON ≠ EXEC_REPORT ≠ your re-run).
- Results are generic and do not answer the queries specifically.

## If Fail

Create:
- `CHANGES_REQUESTED`
- `REWORK_REQUEST.md` with:
  - Specific failures.
  - Exact files/scripts to modify.
  - Expected behavior after fix.
  - Re-validation commands.

Do NOT create `REVIEW_PASS`.
