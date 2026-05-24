# SECRETS_AND_SAFETY_REPORT

**Contour:** `feature/processmap-agent-rag-structured-facts-registry-v1`
**Date:** 2026-05-16

---

## Scans Performed

### 1. Registry Scan

```bash
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json
```

**Result:** 17 findings, all false positives / expected.

| Category | Count | Examples |
|----------|-------|----------|
| CONTENT_PASSWORD_EQ | 8 | Policy docs (`INDEXING_POLICY.md`), i18n (`ru.js`), test fixtures |
| CONTENT_JWT | 3 | Report files documenting redaction rules (`REVIEW_REPORT.md`, `SECRETS_AND_EXCLUSIONS_RECHECK.md`) |
| CONTENT_PG_CONN | 1 | Example connection string in `INDEXING_POLICY_REPORT.md` |
| CONTENT_REDIS_CONN | 1 | Example connection string in `INDEXING_POLICY_REPORT.md` |
| CONTENT_API_KEY | 1 | Test fixture referencing `"api_key"` |
| CONTENT_OVERSIZED | 3 | Index JSON files (`RAG_SEARCH_INDEX_BALANCED.json`, `RAG_SEARCH_INDEX_SAMPLE.json`) |

**No secret values printed.** Scanner outputs only path + rule_id + severity.

### 2. Facts Directory Scan

```bash
node tools/rag/pm-rag-scan-secrets.mjs --path tools/rag/facts/
```

**Result:** 0 findings.

The facts directory is clean. No secret-like patterns detected in any fact value.

## Validator Secret Checks

- Check 13: No `source_ref` points to excluded secrets path → PASS
- Check 14: No fact value contains secret-like content → PASS

## Policy

- Facts must NOT contain `.env`, keys, tokens, passwords, connection strings
- Facts must NOT reference excluded paths (`.env*`, `node_modules`, `dist`, `.git`, etc.)
- `source_refs` point to curated safe sources only
- No secrets printed in any report or CLI output
- Scanner maintains fail-closed behavior
