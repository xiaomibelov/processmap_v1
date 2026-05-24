# INDEXING_POLICY_REPORT

**Contour:** `feature/processmap-agent-rag-source-registry-and-index-policy-v1`  
**Run ID:** `20260516T142047Z-97868`

---

## Policy Files

| File | Purpose |
|------|---------|
| `docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md` | Canonical policy documentation |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEXING_POLICY.md` | Project Atlas mirror |

## Section Coverage

| # | Section | Status | Notes |
|---|---------|--------|-------|
| 1 | Include Rules | ✅ | 5 categories with priorities and criteria |
| 2 | Exclude Rules | ✅ | Globs (16) + regexes (3) + specific paths (6) |
| 3 | Secrets Scanner Rules | ✅ | 5 categories, fail-closed behavior, pre-index checklist |
| 4 | AI Drafts Policy | ✅ | Never canonical; `truth_level: draft` |
| 5 | Deprecated Docs Policy | ✅ | Down-ranked; never deleted |
| 6 | Raw Logs Policy | ✅ | Summarized only; never bulk |
| 7 | Screenshots/Binaries Policy | ✅ | Excluded unless curated |
| 8 | Update Workflow | ✅ | 3 triggers, freshness rules, stale handling |
| 9 | Read-Only Boundary | ✅ | Allowed/forbidden table explicit |

## Exclusions Summary

| Type | Count |
|------|-------|
| Hard exclude globs | 16 |
| Regex patterns | 3 |
| Specific paths | 6 |
| Secret categories | 5 |

## Secrets Scanner Rules

### Path Risk Rules (10)

| ID | Pattern | Severity |
|----|---------|----------|
| PATH_DOTENV | `.env` files | critical |
| PATH_PEM | `.pem` files | critical |
| PATH_KEY | `.key` files | critical |
| PATH_ID_RSA | `id_rsa` | critical |
| PATH_ID_ED25519 | `id_ed25519` | critical |
| PATH_SECRETS_DIR | `secrets/` directory | critical |
| PATH_SECRET_EXT | `.secret`, `.token`, `.password`, `.credential` | critical |
| PATH_COOKIE | cookie files | high |
| PATH_SESSION | session storage | high |
| PATH_BACKUP | `.backup` files | high |

### Content Rules (10)

| ID | Pattern | Severity |
|----|---------|----------|
| CONTENT_TOKEN_EQ | `token = "..."` (8+ chars) | high |
| CONTENT_API_KEY | `api_key = "..."` (8+ chars) | high |
| CONTENT_PRIVATE_KEY | PEM private key block | critical |
| CONTENT_PASSWORD_EQ | `password = "..."` (3+ chars) | high |
| CONTENT_BEARER | `bearer <token>` (20+ chars) | high |
| CONTENT_JWT | JWT pattern | high |
| CONTENT_SK_KEY | `sk-...` (20+ chars) | critical |
| CONTENT_MONGO_CONN | `mongodb+srv://user:pass@` | high |
| CONTENT_PG_CONN | `postgres://user:pass@` | high |
| CONTENT_REDIS_CONN | `redis://user:pass@` | high |

## Read-Only Boundary

Explicitly documented in §9. Key forbidden actions:
- Auto-mutate code
- Auto-save files
- Write BPMN XML
- Apply Product Actions automatically
- Override human review verdict
- Index secrets
- Treat AI drafts as canonical truth

## Verification

- Policy markdown exists: ✅
- All 9 sections present: ✅
- Project Atlas mirror exists: ✅
- Hard exclusions cover `.env`, keys, `node_modules`, `dist`, `__pycache__`, `.git`: ✅
