# ProcessMap RAG Indexing Policy

**Version:** 1.0.0  
**Project:** ProcessMap  
**Updated:** 2026-05-16  
**Contour:** `feature/processmap-agent-rag-source-registry-and-index-policy-v1`

---

## 1. Include Rules

The following source categories are indexed, in order of priority:

| Category | Priority | Description |
|----------|----------|-------------|
| `project_atlas` | critical | Project Atlas (Obsidian) notes, architecture docs, decisions |
| `contour` | critical | Planning contour reports: PLAN.md, EXEC_REPORT.md, REVIEW_REPORT.md |
| `docs` | high | Curated documentation: fact packs, API contracts, test plans |
| `code` | critical / high | Source code from `frontend/src`, `backend`, `tools`, `scripts` |
| `runtime_evidence` | normal | Runtime proof, baselines, profiles (summarized only) |

### Include Criteria
- File must be listed in `tools/rag/processmap-rag-sources.json` registry.
- File must pass the secrets scanner (§3).
- File must have an assigned `truth_level` and `category`.
- File must not match any hard exclude glob or regex (§2).

---

## 2. Exclude Rules

### 2.1 Hard Exclude Globs

Never index files matching these patterns:

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

### 2.2 Regex Patterns

Content matching these regexes blocks the containing file from indexing:

```regex
(?i)(api[_-]?key|auth[_-]?token|bearer|password|secret|private[_-]?key|access[_-]?token|refresh[_-]?token)
(?i)(mongodb\+srv://|postgres://|redis://|mysql://)
(?i)(sk-[a-zA-Z0-9]{20,})
```

### 2.3 Specific Paths (Always Exclude)

| Path | Reason |
|------|--------|
| `/opt/processmap-test/.env` and all `.env.*` variants | Secrets |
| `/opt/processmap-test/.env.backup_20260514_095731` | Secrets backup |
| `/opt/processmap-test/.playwright-mcp/` | Browser traces and logs |
| `/opt/processmap-test/.agents/` | Agent runtime state |
| `/srv/obsidian/project-atlas/ProcessMap/_Imported/` | Raw imports, triage required first |
| Any file with `backup`, `dump`, `raw_log` in name unless curated | Potential leaks |

---

## 3. Secrets Scanner Rules

### 3.1 Secret Categories

| # | Category | Examples |
|---|----------|----------|
| 1 | API Keys | `sk-...`, `AKIA...`, `ghp_...` |
| 2 | Tokens | JWT, bearer tokens, OAuth refresh tokens, session cookies |
| 3 | Passwords | Plaintext passwords, connection strings with embedded credentials |
| 4 | Private Keys | RSA/ED25519 private key blocks, `.pem` files |
| 5 | Connection Strings | Database URLs with username/password |

### 3.2 Scanner Behavior (Fail-Closed)

| Finding | Action |
|---------|--------|
| Entire file contains secrets | **Skip file entirely** — do not redact-in-place |
| Single line/field in otherwise safe file | **Skip file entirely** — avoid partial leaks |
| Ambiguous (e.g. `password = "placeholder"`) | Flag for manual review; default to skip |
| Environment variable references (e.g. `os.getenv("SECRET")`) | Safe to index — reference only, no value |

### 3.3 Pre-Index Secret Checklist

For every source batch:
- [ ] Run regex scanner across all candidate files.
- [ ] Check file names against hard-exclude globs.
- [ ] Check file sizes — unusually large text files may be dumps.
- [ ] Verify no `.env` files slipped through.
- [ ] Cross-check against `INDEXING_POLICY.md` exclusion list.

---

## 4. AI Drafts Policy

- AI drafts are **never** treated as canonical truth.
- All AI-generated suggestions, WIP notes, and draft documents are assigned `truth_level: draft`.
- Drafts may be indexed for searchability but are down-ranked in retrieval.
- A human operator must explicitly accept any RAG suggestion before application.

---

## 5. Deprecated Docs Policy

- Deprecated documents are indexed only if historical search is needed.
- Assigned `truth_level: deprecated` and down-ranked in retrieval.
- Deprecated chunks are never deleted from index; they are simply ranked lower.
- Documents marked obsolete or legacy are automatically classified as `deprecated`.

---

## 6. Raw Logs Policy

- Raw log files are **summarized only**; never indexed in bulk.
- A human-readable summary + key metrics may be indexed as a single chunk.
- The summary chunk references the raw file path but does not contain raw log lines.
- Files with `.log` extension or `raw_log` in path are classified as `raw_log`.

---

## 7. Screenshots / Binaries Policy

- Binary assets (images, videos, fonts, minified bundles) are excluded from indexing.
- Screenshots are excluded unless explicitly curated into an evidence document.
- Curated evidence docs may reference screenshot file paths in metadata.
- Supported text-only formats: `.md`, `.py`, `.js`, `.jsx`, `.mjs`, `.ts`, `.tsx`, `.json`, `.yaml`, `.yml`, `.sh`, `.txt`.

---

## 8. Update Workflow

### Trigger Events

1. **Contour completion**
   - EXEC_REPORT / REVIEW_REPORT mirrored to Project Atlas via `./tools/pm-agent-mirror-report.sh`.
   - RAG update job picks up curated reports (not all raw files).
   - `CHANGES_REQUESTED` indexed as high-priority warning.
   - `REVIEW_PASS` indexed as normal-priority evidence.

2. **Code merge to `main`**
   - Incremental re-index of changed code files.
   - Not on every WIP commit.

3. **Manual refresh**
   - Admin can trigger full re-index via existing RAG admin page.

### Freshness Rules

| Source Type | Max Age Before Stale Flag | Update Trigger |
|-------------|---------------------------|----------------|
| Contour reports | 30 days | contour completion mirror |
| Project Atlas notes | 30 days | sync pipeline |
| Code (key files) | 7 days | merge to main |
| Docs | 90 days | manual or doc update PR |
| Runtime evidence | 14 days | contour completion |

### Stale Handling

- Stale chunks are **not deleted**; they are down-ranked in retrieval.
- `deprecated` truth_level chunks are always down-ranked.
- Fresh chunks get `+recency_boost` in BM25 scoring.

---

## 9. Read-Only Boundary

### Allowed (RAG/RAK can return)

| Action | Allowed? |
|--------|----------|
| Context snippets from indexed sources | Yes |
| Suggestions (e.g. "prior fix in contour X used approach Y") | Yes |
| Warnings (e.g. "this file had 3 regressions before") | Yes |
| References to source truth (paths, contour ids, line numbers) | Yes |
| Summaries of evidence | Yes |

### Forbidden (RAG/RAK must NOT do)

| Action | Allowed? |
|--------|----------|
| Auto-mutate code | **No** |
| Auto-save files | **No** |
| Write BPMN XML | **No** |
| Apply Product Actions automatically | **No** |
| Override human review verdict | **No** |
| Index secrets | **No** |
| Generate auto-mutation suggestions without human review | **No** |
| Treat AI drafts as canonical truth | **No** |

### Enforcement

- Agent prompts include explicit boundary text.
- RAG API returns `suggestion` type only; no `action` type.
- RAG context is logged but never auto-applied.
