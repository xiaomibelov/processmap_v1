# PLAN: Project Atlas Server Docs Import + Triage

**Contour ID:** `tooling/project-atlas-server-docs-import-and-triage-v1`
**Planner:** Agent 1 (Planner)
**Date:** 2026-05-14
**Verdict:** `PLAN_READY_FOR_EXECUTION`

---

## 1. Source Truth

### Server Identity
```
Hostname:   clearvestnic.ru
User:       root
Date:       Thu May 14 11:26:09 AM UTC 2026
Disk:       40G total, 20G used, 18G avail (53%)
```

### Sync Status
```
Syncthing:    active (v2.1.0)
Folder:       project-atlas
Status:       idle, synced
Local vault:  /Users/mac/Documents/Obsidian/ProjectAtlas
Server vault: /srv/obsidian/project-atlas
Sync test:    bidirectional passed
```

### Vault Structure (Current)
```
/srv/obsidian/project-atlas
├── ProcessMap/
│   ├── Architecture/
│   ├── Audits/
│   ├── Backlog/
│   ├── Contours/
│   ├── Decisions/
│   ├── Evidence/
│   ├── HANDOFF/
│   ├── Prompts/
│   ├── RAG/
│   ├── Runtime/
│   ├── _Imported/
│   │   └── 20260514/              ← 260 files from local Mac
│   │       └── INDEX.md
│   └── README.md
├── _Inbox/
│   └── local-processmap-import-20260514_140132/
├── _Templates/
├── README.md
└── .stignore
```

### Imported Snapshot Summary
- **260 files** staged from local Mac Obsidian vault
- Source: `/Users/mac/Documents/Obsidian Vault/PROCESSMAP/`
- Structure preserved: `HANDOFF/`, `AUDITS/`, `EPICS/`, `PROJECT ATLAS/`, root notes
- Secret-risk check: **clean**

### Server Docs Inventory

| Source | File Count | Type |
|--------|-----------|------|
| `/opt/processmap-test/PROCESSMAP/HANDOFF/` | 9 | Curated handoffs |
| `/opt/processmap-test/docs/*.md` | ~60 | Core docs (contracts, audits, guides) |
| `/opt/processmap-test/docs/obsidian_fallback/project_atlas_updates/` | ~70 | Contour update packs |
| `/opt/processmap-test/.planning/contours/` | 2 contours | GSD plans |

**Total server-side candidate docs:** ~140 files

---

## 2. Existing Sync Status

- Syncthing running as user service (`syncthing.service`)
- GUI: `127.0.0.1:8384` (localhost only)
- Folder `project-atlas` scanned and idle
- Server device ID: `2FJV6RR-GI6X5HM-4TFGEGG-KTCTA62-DTWLMKT-2GWYMRO-F2SLTIX-7NIT3QO`
- Bidirectional sync verified: server writes visible on Mac, Mac writes visible on server

---

## 3. Triage Plan for Imported Snapshot

### Source
```
ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/
```

### Target Mapping

| Source | Target Folder | Count Estimate |
|--------|--------------|----------------|
| `HANDOFF/*.md` | `ProcessMap/HANDOFF/` | ~150 |
| `AUDITS/*.md` | `ProcessMap/Audits/` | ~6 |
| `PROJECT ATLAS/*.md` | `ProcessMap/Architecture/` | ~20 |
| `PROJECT ATLAS/BPMN 123/*.md` | `ProcessMap/Architecture/BPMN 123/` | ~16 |
| `EPICS/*/*` | `ProcessMap/Backlog/EPICS/` | ~20 |
| Dated root notes (handoff/feature/fix) | `ProcessMap/HANDOFF/` | ~15 |
| Dated root notes (architecture/runtime) | `ProcessMap/Architecture/` | ~10 |
| Dated root notes (audit/forensic) | `ProcessMap/Audits/` | ~3 |
| Ambiguous root notes | `ProcessMap/_Inbox/Triage/` | ~20 |

### Ambiguous Items (Triage)
- `Untitled 1.md`, `Untitled 2.md`, `Untitled 3.md`, `Untitled.md`
- `ACTIVE TASKS.md`
- `EPIC BOARD.md`
- `PROJECT MAP.md`
- `payload-shape.md`
- `Работа со студентам.md`, `Работа со студентами 2.md`
- `След правки.md`, `айдит.md`, `защиту для редактирования.md`
- `cutover checklist.md`, `deploy serv.md`, `dep ag.md.md`

---

## 4. Server Docs Import Plan

### Source A: Curated Handoffs
```
/opt/processmap-test/PROCESSMAP/HANDOFF/
```
**Target:** `ProcessMap/HANDOFF/`
**Files:** 9 handoff notes from May 2026
**Action:** Copy all `.md` files with dedupe

### Source B: Obsidian Fallback Updates
```
/opt/processmap-test/docs/obsidian_fallback/project_atlas_updates/
```
**Target:** Multiple folders based on filename
**Files:** ~70 contour update docs
**Action:** Classify by filename pattern and copy

Classification patterns:
- `*API карта*` → `Architecture/`
- `*Карта сохранения*` → `Architecture/`
- `*Карта производительности*` → `Architecture/`
- `*runtime evidence*` → `Runtime/`
- `*Журнал решений*` → `Decisions/`
- `*Backlog контуров*` → `Backlog/`
- `*AI слой*` → `Architecture/`
- `*UI UX*` → `Architecture/`
- `*Версии и история*` → `Architecture/`
- `*Шаблоны свойства*` → `Architecture/`
- `handoff.md` → `HANDOFF/`
- `README.md` → `Architecture/` (with contour prefix)

### Source C: General Docs
```
/opt/processmap-test/docs/
```
**Target:** Multiple folders
**Files:** ~60 core docs
**Action:** Classify by content type

Classification:
- `contract_*.md` → `Architecture/`
- `*_audit.md` → `Audits/`
- `handoff_*.md` → `HANDOFF/`
- `*factpack*.md` → `Architecture/`
- `*runtime*.md` → `Runtime/`
- `decompose/*.md` → `Architecture/`
- `gsd/*.md` → `Contours/` or `Backlog/`
- `redis/*.md` → `Architecture/`
- `screens/*.md` → `Evidence/`
- `debug/*.md` → `Evidence/`
- `migration/*.md` → `Architecture/`
- `tooling/*.md` → `Contours/`
- `specs/*.md` → `Architecture/`
- Remaining → `_Inbox/Triage/`

### Source D: GSD Contours
```
/opt/processmap-test/.planning/contours/
```
**Target:** `ProcessMap/Contours/<contour-id>/`
**Files:** PLAN.md, EXECUTOR_PROMPT.md, REVIEWER_PROMPT.md, STATE.json
**Action:** Copy preserving directory structure

Contours to copy:
- `tooling/mcp-servers-inventory-and-repair-v1/`
- `tooling/project-atlas-sync-and-rag-bootstrap-v1/`
- `tooling/project-atlas-server-docs-import-and-triage-v1/` (this contour)

---

## 5. Classification Rules

See `IMPORT_RULES.md` for detailed classification rules.

Summary:
- Handoff/session notes → `HANDOFF/`
- Audit/forensic → `Audits/`
- Architecture/API/design → `Architecture/`
- Decisions/ADRs → `Decisions/`
- Runtime proof/evidence → `Runtime/` or `Evidence/`
- GSD plans → `Contours/`
- Epics/backlog → `Backlog/`
- Unknown but relevant → `_Inbox/Triage/`

---

## 6. Copy-Only Execution Plan

### Principle
All operations are **copy-only**. Originals are NEVER moved or deleted.

### Order of Operations
1. Secret check on all sources
2. Create `_Inbox/Triage/`
3. Triage imported snapshot (260 files)
4. Import server-side docs (~140 files)
5. Deduplication (SHA256-based)
6. Write import manifest
7. Verify sync

### Deduplication Strategy
- Calculate SHA256 for each source file
- If `(basename, sha256)` pair exists in target → skip
- If basename exists but SHA256 differs → copy with date suffix
- Log all decisions

---

## 7. Secret Exclusion

### Pre-flight Check
```bash
find <source> \
  \( -name ".env" -o -name ".env.*" -o -name "*.pem" \
     -o -name "*.key" -o -name "id_rsa" -o -name "id_ed25519" \) \
  -print
```

### If Found
- STOP copying from that source
- Report path in manifest
- Do NOT read contents
- Do NOT copy file

### Expected Result
Zero matches. All sources are docs-only directories.

---

## 8. RAG Source Candidate Preparation

See `RAG_SOURCE_CANDIDATES.md` for full plan.

### Proposed RAG Include (for future contour)
1. `ProcessMap/HANDOFF/`
2. `ProcessMap/Decisions/`
3. `ProcessMap/Architecture/`
4. `ProcessMap/Audits/`
5. `ProcessMap/Contours/`

### Proposed RAG Exclude
1. `ProcessMap/_Imported/`
2. `ProcessMap/_Inbox/Triage/`
3. `ProcessMap/RAG/`
4. Any file > 5MB
5. Any draft or unreviewed content

**This contour does NOT start RAG indexing.**

---

## 9. Non-Goals

This contour explicitly does NOT:
- Start RAG indexing
- Start MCP Agent 2 (repair)
- Modify ProcessMap product code
- Delete `_Imported/20260514/`
- Delete any originals
- Transfer secrets or credentials
- Index raw logs without curation
- Build or deploy anything

---

## 10. Validation Plan

### Phase 1: Pre-flight
- [ ] Secret check passed (zero matches)
- [ ] Syncthing running and synced

### Phase 2: Execution
- [ ] All 260 imported files classified and copied or triaged
- [ ] All server-side docs copied from 4 sources
- [ ] No duplicates without suffix
- [ ] Import manifest written

### Phase 3: Verification
- [ ] Reviewer checks canonical folder structure
- [ ] Reviewer verifies no secrets
- [ ] Reviewer verifies sync
- [ ] Reviewer verifies `_Imported/` preserved

### Phase 4: Approval
- [ ] Reviewer verdict: `REVIEW_PASS`

---

## 11. Files in This Contour

| File | Purpose |
|------|---------|
| `PLAN.md` | This file — master plan |
| `EXECUTOR_PROMPT.md` | Instructions for executor agent |
| `REVIEWER_PROMPT.md` | Verification checklist for reviewer |
| `IMPORT_RULES.md` | Detailed classification rules |
| `RAG_SOURCE_CANDIDATES.md` | Future RAG include/exclude plan |
| `STATE.json` | Machine-readable contour state |
| `READY_FOR_EXECUTION` | Marker file |

---

**Verdict: PLAN_READY_FOR_EXECUTION**
