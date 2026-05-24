# PLAN: Project Atlas Sync + RAG Bootstrap

**Contour ID:** `tooling/project-atlas-sync-and-rag-bootstrap-v1`
**Planner:** Agent 1 (Planner)
**Date:** 2026-05-14
**Verdict:** `PLAN_READY_FOR_EXECUTION`

---

## 1. Source Truth

### Server Identity
```
Hostname:   clearvestnic.ru
User:       root
Date:       Thu May 14 10:56:14 AM UTC 2026
CWD:        /root
Disk:       40G total, 20G used, 18G avail (53%)
Inodes:     2.5M total, 486K used, 2.1M free (19%)
```

### ProcessMap Runtime Repository
```
Path:       /opt/processmap-test
Branch:     fix/lockfile-sync-test
Status:     M .env, ?? .planning/contours/, ?? TEST_RUNTIME.md, ?? bin/
HEAD:       a9a9d9c5f468d9da63415306da6d34dcd605aa0d
```

### Project Atlas Server Target
```
Path:       /srv/obsidian/project-atlas
Status:     Exists, EMPTY (only . and ..)
```

---

## 2. Server Inventory Summary

### Key Document Repositories Found

| Location | Status | Notes |
|----------|--------|-------|
| `/opt/processmap-test` | **Primary runtime** | Active repo, contains `PROCESSMAP/HANDOFF/`, `docs/`, `.planning/` |
| `/root/processmap-agent/imports/bpmn123-local-stack-20260502-113641` | Staging copy | Mirror of `/opt/processmap-test` from earlier import |
| `/root/processmap_v1` | Older checkout | Incomplete docs set, no `docs/obsidian_fallback` |
| `/root/processmap_v1_overlay_audit` | Audit checkout | Incomplete docs set |
| `/root/processmap_version_reconcile` | Reconcile checkout | Incomplete docs set |
| `/root/processmap_admin_access_navigation_and_users_table_v1` | Feature checkout | Incomplete docs set |

### High-Value Document Clusters on Server

1. **`/opt/processmap-test/PROCESSMAP/HANDOFF/`** — 8 curated handoff notes from recent contours (May 2026)
2. **`/opt/processmap-test/docs/obsidian_fallback/project_atlas_updates/`** — 12+ contour update packs with structured docs (API maps, evidence logs, decision journals, backlogs)
3. **`/opt/processmap-test/docs/`** — Core documentation: contracts, factpacks, audits, migration plans, guides
4. **`/opt/processmap-test/.planning/contours/`** — GSD contour manifests (currently 1 active: MCP repair, paused)
5. **`/root/processmap-agent/handoffs/`** — Agent handoff records (empty or minimal)

### Document Count Estimate
- Markdown files in `/opt/processmap-test/docs/`: ~60
- Handoff files in `PROCESSMAP/HANDOFF/`: ~8
- Obsidian fallback updates: ~60 (across multiple contour subdirs)
- Total candidate docs for vault seeding: **~130 Markdown files**

### Paused Contour
- `tooling/mcp-servers-inventory-and-repair-v1` exists in `.planning/contours/`
- Status: `paused` — do NOT start or modify

---

## 3. Local Inventory Instructions

See `LOCAL_MAC_INVENTORY_PROMPT.md` for the full local agent prompt.

### Summary
1. Run read-only `find` across `~/Documents`, `~/Desktop`, `~/Downloads`, `~/PycharmProjects`
2. Produce `~/Desktop/processmap_docs_inventory.txt`
3. Review and select documents for staging
4. Copy (not move) selected docs into `~/Documents/Obsidian/ProjectAtlas`
5. Follow canonical structure from `PROJECT_ATLAS_STRUCTURE.md`

### Expected Local Sources
- `~/Documents/Obsidian/ProjectAtlas` (if exists)
- `~/PycharmProjects/processmap_canonical_main` (if exists)
- Any downloaded handoff packs or evidence files

---

## 4. Canonical Vault Structure

Defined in `PROJECT_ATLAS_STRUCTURE.md`.

```
ProjectAtlas/
├── ProcessMap/
│   ├── HANDOFF/
│   ├── Evidence/
│   ├── Decisions/
│   ├── Runtime/
│   ├── Prompts/
│   ├── Contours/
│   ├── Architecture/
│   ├── Audits/
│   ├── Backlog/
│   └── RAG/
├── _Inbox/
└── _Templates/
```

---

## 5. Sync Architecture

### Primary Strategy: Syncthing

**Selection:** Syncthing is the default sync mechanism unless a blocker is found.

**Rationale:**
- Decentralized, no central server required
- Handles bidirectional sync with conflict resolution
- Cross-platform (macOS, Linux)
- Ignore patterns (`.stignore`) supported
- No git merge complexity for non-developers

**Endpoints:**
- **Local Mac:** `~/Documents/Obsidian/ProjectAtlas`
- **Server:** `/srv/obsidian/project-atlas`

**Alternatives Considered:**
- Git snapshot: Deferred to later. Useful for version history but adds merge complexity.
- rsync: One-directional, requires manual conflict resolution.
- Dropbox/iCloud: Not suitable for server-side Linux.

### Syncthing Setup Steps

1. **Local Mac**: Install Syncthing (via Homebrew or Syncthing app)
2. **Server**: Install Syncthing (via apt) — see `SERVER_SYNC_EXECUTOR_PROMPT.md`
3. **Pair devices**: Exchange device IDs
4. **Share folder**: Add `project-atlas` folder on both sides
5. **Verify `.stignore`**: Ensure ignore patterns are active

### Required `.stignore`

```
.DS_Store
Thumbs.db
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/cache
.trash
*.tmp
*.swp
*~
.git
.env
.env.*
*.pem
*.key
id_rsa
id_ed25519
secrets
secrets/**
.local
.local/**
node_modules
node_modules/**
.venv
.venv/**
venv
venv/**
logs
logs/**
```

---

## 6. Secret Exclusion Rules

### Absolute Prohibitions
- `.env`, `.env.*` files
- `secrets/` directories and their contents
- `*.pem`, `*.key`, `id_rsa`, `id_ed25519`
- API keys, tokens, passwords in any form
- Private configuration files

### Log Exclusions
- Raw unfiltered logs over 1MB
- Temporary debug dumps
- Unverified telemetry blobs

### Filtered Inclusions
- **Runtime summaries** are OK if curated and sanitized
- **Evidence files** are OK if they contain test results, not raw credentials
- **Architecture docs** are OK if they describe API contracts, not contain keys

### Verification
Before any sync or indexing, run:
```bash
grep -riE '(password|secret|token|api_key|private_key|AWS_|OPENAI_)' \
  --include="*.md" /srv/obsidian/project-atlas/ || echo "Clean"
```

---

## 7. RAG Bootstrap Plan

Defined in `RAG_BOOTSTRAP_PLAN.md`.

### Summary
- **Scope**: Read-only retrieval/context layer over Project Atlas
- **Source**: `/srv/obsidian/project-atlas/ProcessMap`
- **Initial indexed dirs**: HANDOFF, Decisions, Architecture, Audits, Contours, Prompts
- **Excluded**: secrets, raw logs, binaries, drafts, .stignore patterns
- **Chunking**: By Markdown headings, max 512 tokens, 64 token overlap
- **API**: `/search`, `/reindex`, `/health`
- **Integration**: Later connect to Product Actions AI

### Deferred to Follow-Up Contour
```
tooling/project-atlas-rag-server-bootstrap-v1
```

---

## 8. Non-Goals

This contour explicitly does NOT:
- Start Agent 2 (MCP repair)
- Modify product code in `/opt/processmap-test`
- Perform any deployment
- Perform any git merge
- Delete any files
- Transfer secrets or credentials
- Index raw logs without curation
- Build the RAG server (only plan)

---

## 9. Validation Plan

### Phase 1: Inventory Complete
- [ ] Server inventory executed and documented
- [ ] Local inventory executed and `processmap_docs_inventory.txt` produced
- [ ] Document selection rationale documented

### Phase 2: Vault Seeded
- [ ] Canonical structure created on both local and server
- [ ] `.stignore` active on both sides
- [ ] README seeded on server
- [ ] Selected documents copied (not moved) to vaults

### Phase 3: Sync Verified
- [ ] Syncthing installed and running on both endpoints
- [ ] Devices paired
- [ ] Bidirectional sync tested (server→local and local→server)
- [ ] Conflict resolution verified
- [ ] No secrets synced

### Phase 4: RAG Plan Reviewed
- [ ] `RAG_BOOTSTRAP_PLAN.md` reviewed for boundedness
- [ ] Read-only constraint confirmed
- [ ] Follow-up contour ID reserved

---

## 10. Files in This Contour

| File | Purpose |
|------|---------|
| `PLAN.md` | This file — master plan |
| `PROJECT_ATLAS_STRUCTURE.md` | Canonical vault directory structure |
| `LOCAL_MAC_INVENTORY_PROMPT.md` | Prompt for local Mac agent/user |
| `SERVER_SYNC_EXECUTOR_PROMPT.md` | Prompt for server sync executor |
| `RAG_BOOTSTRAP_PLAN.md` | RAG architecture and deferred implementation plan |
| `REVIEWER_PROMPT.md` | Verification checklist for reviewer agent |
| `STATE.json` | Machine-readable contour state |
| `READY_FOR_EXECUTION` | Marker file indicating plan is ready |

---

**Verdict: PLAN_READY_FOR_EXECUTION**
