# SECRETS_AND_EXCLUSIONS_RECHECK

**Contour:** `feature/processmap-agent-rag-bm25-manifest-search-v1`  
**Date:** 2026-05-16

---

## Secrets Scan

### Command

```bash
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json
```

**Exit code:** 1 (findings present, all reviewed)  
**Findings:** 12

### Findings Breakdown

| Path | Rule ID | Severity | Assessment |
|------|---------|----------|------------|
| `.../RAG/INDEXING_POLICY.md` | CONTENT_PASSWORD_EQ | high | False positive: policy doc example |
| `.../INDEXING_POLICY_REPORT.md` | CONTENT_PG_CONN | high | False positive: report example string |
| `.../INDEXING_POLICY_REPORT.md` | CONTENT_REDIS_CONN | high | False positive: report example string |
| `.../SECRETS_SCAN_REPORT.md` | CONTENT_PASSWORD_EQ | high | False positive: scanner report itself |
| `.../RAG_SEARCH_INDEX_SAMPLE.json` | CONTENT_OVERSIZED | medium | Expected: index JSON is ~16 MB |
| `.../INDEXING_POLICY.md` | CONTENT_PASSWORD_EQ | high | False positive: policy doc example |
| `.../PROCESSMAP_RAG_INDEXING_POLICY.md` | CONTENT_PASSWORD_EQ | high | False positive: policy doc example |
| `frontend/src/shared/i18n/ru.js` | CONTENT_PASSWORD_EQ | high | False positive: UI translation string |
| `backend/tests/test_admin_user_management_api.py` | CONTENT_PASSWORD_EQ | high | False positive: test fixture |
| `backend/tests/test_ai_module_catalog_api.py` | CONTENT_API_KEY | high | False positive: test fixture |
| `backend/tests/test_auth_users_db_profile_storage.py` | CONTENT_PASSWORD_EQ | high | False positive: test fixture |
| `backend/tests/test_org_invites.py` | CONTENT_PASSWORD_EQ | high | False positive: test fixture |

**Assessment:** All 12 findings are false positives. No secret values are printed in scanner output. Fail-closed policy is maintained. No global weakening applied.

---

## Exclusions Recheck

### Verification Commands

```bash
grep -E '"path".*\.env' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no .env"
grep -E '"path".*\.pem' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no .pem"
grep -E '"path".*node_modules' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no node_modules"
grep -E '"path".*frontend/dist' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no frontend/dist"
grep -E '"path".*__pycache__' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no __pycache__"
grep -E '"path".*\.git' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no .git"
grep -E '"path".*\.agents' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no .agents"
grep -E '"path".*\.playwright-mcp' .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no .playwright-mcp"
```

**Results:** All PASS. Excluded paths are not present in the manifest or index.

### Index Exclusion Verification

```bash
grep -c "\.env" .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.json || echo "PASS: no .env in index"
grep -c "node_modules" .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.json || echo "PASS: no node_modules in index"
```

**Results:** PASS (grep returns 0 matches).

---

## Minor Fix Applied

**Scanner `--path` ENOTDIR:** Fixed in `tools/rag/pm-rag-scan-secrets.mjs`. Added `stat` check in `walkDir` to handle single-file input. Verified working:

```bash
node tools/rag/pm-rag-scan-secrets.mjs --path tools/rag/pm-rag-build-search-index.mjs --json
# → 0 findings, exit 0
```
