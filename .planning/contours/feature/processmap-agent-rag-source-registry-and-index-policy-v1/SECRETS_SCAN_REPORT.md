# SECRETS_SCAN_REPORT

**Contour:** `feature/processmap-agent-rag-source-registry-and-index-policy-v1`  
**Run ID:** `20260516T142047Z-97868`  
**Scanner:** `tools/rag/pm-rag-scan-secrets.mjs` v1.0.0

---

## Scan Parameters

| Parameter | Value |
|-----------|-------|
| Registry | `tools/rag/processmap-rag-sources.json` |
| Sources scanned | 8 |
| Scan mode | `--registry` (all registered sources) |
| Output format | Markdown + JSON |

## Results Summary

| Metric | Value |
|--------|-------|
| Files scanned | ~800+ (full recursive walk of 8 source roots) |
| Findings | 8 |
| Critical severity | 0 |
| High severity | 8 |
| Medium severity | 0 |

## Findings

| # | Path | Rule ID | Severity |
|---|------|---------|----------|
| 1 | `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEXING_POLICY.md` | CONTENT_PASSWORD_EQ | high |
| 2 | `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/INDEXING_POLICY.md` | CONTENT_PASSWORD_EQ | high |
| 3 | `/opt/processmap-test/docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md` | CONTENT_PASSWORD_EQ | high |
| 4 | `/opt/processmap-test/frontend/src/shared/i18n/ru.js` | CONTENT_PASSWORD_EQ | high |
| 5 | `/opt/processmap-test/backend/tests/test_admin_user_management_api.py` | CONTENT_PASSWORD_EQ | high |
| 6 | `/opt/processmap-test/backend/tests/test_ai_module_catalog_api.py` | CONTENT_API_KEY | high |
| 7 | `/opt/processmap-test/backend/tests/test_auth_users_db_profile_storage.py` | CONTENT_PASSWORD_EQ | high |
| 8 | `/opt/processmap-test/backend/tests/test_org_invites.py` | CONTENT_PASSWORD_EQ | high |

## Finding Analysis

All 8 findings are **false positives** upon manual review:

1. **INDEXING_POLICY.md files (3 findings):** These are RAG policy documents that contain the example string `password = "placeholder"` to illustrate ambiguous cases. The scanner correctly flags the pattern; the content is documentation, not a secret.

2. **ru.js (1 finding):** UI translation file containing `password: "Пароль"` (Russian word for "Password"). This is a label string, not a credential.

3. **Test files (4 findings):** Python test fixtures using placeholder passwords and API keys (`strongpass1`, `strongpass2`, `SECRET_SHOULD_NOT_LEAK`). These are explicitly fake test data.

## Scanner Behavior Verification

| Check | Result |
|-------|--------|
| Scanner runs without crash | ✅ |
| Scanner exits with code 1 when findings present | ✅ |
| Scanner output does NOT contain secret values | ✅ |
| Scanner reports path + rule_id + severity only | ✅ |
| Path risk rules detect `.env`, `.pem`, keys | ✅ |
| Content rules detect token, api_key, password, bearer, JWT patterns | ✅ |
| Fail-closed: ambiguous patterns flagged for review | ✅ |
| Environment variable references not flagged | ✅ |

## Conclusion

The secrets scanner is operational and enforces the fail-closed policy. All flagged items were reviewed and determined to be false positives in documentation, UI labels, and test fixtures. No actual secrets were found in the indexed source candidates. The primary indexing gate (manifest exclusion of `.env`, keys, `node_modules`, etc.) is fully functional.
