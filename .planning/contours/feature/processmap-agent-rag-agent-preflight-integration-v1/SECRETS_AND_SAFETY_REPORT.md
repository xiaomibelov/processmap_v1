# Secrets and Safety Report

**Contour:** `feature/processmap-agent-rag-agent-preflight-integration-v1`  
**Date:** 2026-05-16  
**Agent 2 / Executor**

## Scans Performed

### 1. Facts Validator
```bash
node tools/rag/pm-rag-validate-facts.mjs
```
**Result:** 28/28 PASS

### 2. BM25 Validation
```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
**Result:** 7/7 PASS (1.00 pass rate)

### 3. Secrets Scan
```bash
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json
```
**Result:** 17 findings (all in previously existing files; none in facts directory)

## Secrets Findings Breakdown

| Path | Rule ID | Severity | Assessment |
|------|---------|----------|------------|
| `INDEXING_POLICY.md` (multiple) | `CONTENT_PASSWORD_EQ` | high | False positive — policy docs document exclusion patterns like `password =` as examples of what to exclude. |
| `REVIEW_REPORT.md` (multiple) | `CONTENT_JWT` | high | False positive — previous contour reports mention JWT patterns in the context of secrets scanning. No actual secret values. |
| `INDEXING_POLICY_REPORT.md` | `CONTENT_PG_CONN` / `CONTENT_REDIS_CONN` | high | False positive — policy doc documents connection string patterns as excluded content. |
| `RAG_SEARCH_INDEX_*.json` | `CONTENT_OVERSIZED` | medium | Expected — index files are large (16–97 MB) and contain concatenated text. No secret values in facts. |
| `frontend/src/shared/i18n/ru.js` | `CONTENT_PASSWORD_EQ` | high | False positive — localization string `"password"` in UI context. |
| `backend/tests/test_*.py` (multiple) | `CONTENT_PASSWORD_EQ` / `CONTENT_API_KEY` | high | False positive — test fixtures use placeholder values like `"testpassword123"` or mock API keys. |

## Safety Checklist

- [x] Preflight CLI does not read `.env` or secrets files
- [x] Preflight CLI redacts sensitive patterns in BM25 snippets (same regexes as `pm-rag-search.mjs`)
- [x] No new dependencies that could access secrets
- [x] Output files written only to `tools/rag/` or contour dirs
- [x] Facts validator check #13 (excluded paths) and #14 (secret-like values) still pass
- [x] No secret values printed in preflight sample outputs

## Deltas from Previous Contours

| Contour | Facts Validator | BM25 Validation | Secrets Scan |
|---------|-----------------|-----------------|--------------|
| `processmap-agent-rag-structured-facts-registry-v1` | 28/28 PASS | 7/7 PASS | 17 findings (documented) |
| `processmap-agent-rag-coverage-and-validation-hardening-v1` | 28/28 PASS | 7/7 PASS | 17 findings (documented) |
| **This contour** | **28/28 PASS** | **7/7 PASS** | **17 findings (no change)** |

No regression introduced.
