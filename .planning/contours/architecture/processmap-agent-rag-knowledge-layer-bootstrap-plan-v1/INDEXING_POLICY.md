# INDEXING_POLICY — ProcessMap Agent RAG / Knowledge Layer

Contour: architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1

---

## 1. Hard Exclude Patterns

Never index files matching these globs or regexes.

### Globs

```
**/.env
**/.env.*
**/*.pem
**/*.key
**/id_rsa
**/id_ed25519
**/secrets/**
**/*.secret
**/*.token
**/*.password
**/*.credential
**/__pycache__/**
**/*.pyc
**/node_modules/**
**/frontend/dist/**
**/build/**
**/cache/**
**/.git/**
**/.playwright-mcp/**
**/.agents/**
**/*.backup*
```

### Regex Patterns

```regex
(?i)(api[_-]?key|auth[_-]?token|bearer|password|secret|private[_-]?key|access[_-]?token|refresh[_-]?token)
(?i)(mongodb\+srv://|postgres://|redis://|mysql://)
(?i)(sk-[a-zA-Z0-9]{20,})
```

### Specific Paths (always exclude)

- `/opt/processmap-test/.env` and all `.env.*` variants
- `/opt/processmap-test/.env.backup_20260514_095731`
- `/opt/processmap-test/.playwright-mcp/` — browser traces and logs
- `/opt/processmap-test/.agents/` — agent runtime state
- `/srv/obsidian/project-atlas/ProcessMap/_Imported/` — raw imports, triage required first
- Any file with `backup`, `dump`, `raw_log` in name unless explicitly curated

---

## 2. Secrets Scanner Rules

### What Constitutes a Secret

A secret is any string that grants authenticated access to a system or encrypts data. Specific categories:

1. **API Keys** — `sk-...`, `AKIA...`, `ghp_...`, etc.
2. **Tokens** — JWT, bearer tokens, OAuth refresh tokens, session cookies
3. **Passwords** — plaintext passwords, connection strings with embedded credentials
4. **Private Keys** — RSA/ED25519 private key blocks, `.pem` files
5. **Connection Strings** — database URLs with username/password

### Scanner Behavior

| Finding | Action |
|---------|--------|
| Entire file contains secrets | **Skip file entirely** — do not redact-in-place |
| Single line/field in otherwise safe file | **Skip file entirely** — avoid partial leaks |
| Ambiguous (e.g., `password = "placeholder"`) | Flag for manual review; default to skip |
| Environment variable references (e.g., `os.getenv("SECRET")`) | Safe to index — reference only, no value |

### Pre-Index Secret Checklist

For every source batch:
- [ ] Run regex scanner across all candidate files
- [ ] Check file names against hard-exclude globs
- [ ] Check file sizes — unusually large text files may be dumps
- [ ] Verify no `.env` files slipped through
- [ ] Cross-check against `INDEXING_POLICY.md` exclusion list

---

## 3. Pre-Index Checklist (Per Source)

Before any file is added to the index:

- [ ] Source is listed in `INDEX_SOURCES.md` registry
- [ ] `excluded_sensitive` scan passed (see §4)
- [ ] Truth level assigned (canonical | evidence | draft | deprecated)
- [ ] Category assigned (project_atlas | contour | docs | code | runtime_evidence)
- [ ] Chunking strategy selected per source type
- [ ] Metadata schema populated (path, title, date, tags)
- [ ] Owner/contour_id assigned for freshness tracking
- [ ] Not marked as `deprecated` unless intentional historical indexing

---

## 4. `excluded_sensitive=false` Proof Template

Every indexed chunk MUST include this metadata field:

```json
{
  "excluded_sensitive": false,
  "excluded_sensitive_proof": {
    "scanner_version": "v1",
    "scan_timestamp": "2026-05-16T14:05:12Z",
    "scanner_rules_applied": [
      "hard_exclude_globs",
      "secret_regex_patterns",
      "connection_string_regex"
    ],
    "manual_review_required": false,
    "reviewer": "agent2-executor"
  }
}
```

If `manual_review_required` is true, the file is blocked from indexing until a human confirms.

---

## 5. Source-Specific Exclusions

### Project Atlas
- Exclude `_Imported/20260514/` entirely (pending triage)
- Exclude raw browser storage dumps
- Exclude AI draft suggestions as source truth
- Exclude uncurated screenshots

### Planning Contours
- Exclude raw huge logs unless summarized
- Exclude temporary backup files inside contours
- Exclude `debug-page.mjs`, `run-profile.mjs` (runtime scripts, not knowledge)

### Code
- Exclude `node_modules/`, `frontend/dist/`, `.git/`
- Exclude `__pycache__/`, `*.pyc`
- Exclude minified bundles
- Exclude raw binary assets unless referenced in docs

### Docs
- Exclude raw debug JSON dumps unless summarized
- Exclude stale drafts beyond retention
- Exclude raw screenshots unless curated into evidence

---

## 6. Policy Enforcement

- **Pipeline gate**: Secrets scanner MUST run before any vector/BM25 insert.
- **Fail closed**: If scanner is uncertain, skip the file.
- **No redaction**: Do not attempt to redact secrets in-place. Skip the whole file.
- **Audit trail**: Every skipped file is logged with reason.
- **Periodic re-scan**: Re-run scanner on existing index when rules are updated.

