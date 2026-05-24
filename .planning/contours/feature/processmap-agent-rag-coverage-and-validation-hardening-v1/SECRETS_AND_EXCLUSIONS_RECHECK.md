# SECRETS_AND_EXCLUSIONS_RECHECK

**Contour:** `feature/processmap-agent-rag-coverage-and-validation-hardening-v1`
**Date:** 2026-05-16

---

## Scan Command

```bash
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json
```

## Findings

| Path | Rule ID | Severity | Assessment |
|------|---------|----------|------------|
| /srv/obsidian/project-atlas/ProcessMap/RAG/INDEXING_POLICY.md | CONTENT_PASSWORD_EQ | high | False positive — example password pattern in policy doc |
| /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/INDEXING_POLICY_REPORT.md | CONTENT_PG_CONN | high | False positive — example connection string in report |
| /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/INDEXING_POLICY_REPORT.md | CONTENT_REDIS_CONN | high | False positive — example connection string in report |
| /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/SECRETS_SCAN_REPORT.md | CONTENT_PASSWORD_EQ | high | False positive — example password pattern in report |
| /opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/INDEXING_POLICY.md | CONTENT_PASSWORD_EQ | high | False positive — example password pattern in policy doc |
| /opt/processmap-test/docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md | CONTENT_PASSWORD_EQ | high | False positive — example password pattern in policy doc |
| /opt/processmap-test/frontend/src/shared/i18n/ru.js | CONTENT_PASSWORD_EQ | high | False positive — translation string containing "password" |
| /opt/processmap-test/backend/tests/test_admin_user_management_api.py | CONTENT_PASSWORD_EQ | high | False positive — test fixture using "password" |
| /opt/processmap-test/backend/tests/test_ai_module_catalog_api.py | CONTENT_API_KEY | high | False positive — test fixture referencing "api_key" |
| /opt/processmap-test/backend/tests/test_auth_users_db_profile_storage.py | CONTENT_PASSWORD_EQ | high | False positive — test fixture using "password" |
| /opt/processmap-test/backend/tests/test_org_invites.py | CONTENT_PASSWORD_EQ | high | False positive — test fixture using "password" |
| /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.json | CONTENT_OVERSIZED | medium | Expected — index JSON is large |

**Total findings:** 12
**Critical / actionable:** 0
**False positives / expected:** 12

## Exclusion Verification

| Excluded Pattern | Present in Manifest? |
|------------------|----------------------|
| `.env` | No |
| `*.pem` | No |
| `*.key` | No |
| `node_modules` | No |
| `frontend/dist` | No |
| `__pycache__` | No |
| `.playwright-mcp` | No |
| `.agents` | No |
| `*.backup*` | No |
| `_Imported` | No |

**All excluded patterns are absent from manifest and index.**

## Secret Values in Search Output

Search CLI redaction is active:
- `sk-*` keys
- JWT tokens (`eyJ...`)
- MongoDB/Postgres/Redis connection strings
- Bearer tokens

No secret values observed in search output during validation.
