# Reviewer Prompt: Project Atlas Server Docs Import + Triage

## Objective
Verify that the executor correctly triaged imported files and imported server-side docs without violating constraints.

## Verification Checklist

### 1. Canonical Folder Structure
- [ ] `ProcessMap/HANDOFF/` contains handoff files (local + server)
- [ ] `ProcessMap/Audits/` contains audit files
- [ ] `ProcessMap/Architecture/` contains architecture/API/design docs
- [ ] `ProcessMap/Decisions/` contains decision logs
- [ ] `ProcessMap/Runtime/` contains runtime summaries and manifests
- [ ] `ProcessMap/Contours/` contains GSD contour docs
- [ ] `ProcessMap/Backlog/` contains epics and backlog items
- [ ] `ProcessMap/_Inbox/Triage/` contains uncertain/ambiguous items
- [ ] `ProcessMap/_Imported/20260514/` still exists and was NOT deleted

### 2. Imported Snapshot Triage
- [ ] All 260 files from `_Imported/20260514/` are accounted for (copied, triaged, or skipped as duplicate)
- [ ] `HANDOFF/` subfolder files landed in `ProcessMap/HANDOFF/`
- [ ] `AUDITS/` subfolder files landed in `ProcessMap/Audits/`
- [ ] `PROJECT ATLAS/` files landed in `ProcessMap/Architecture/`
- [ ] `EPICS/` files landed in `ProcessMap/Backlog/EPICS/`
- [ ] Ambiguous root notes (`Untitled *.md`, etc.) landed in `_Inbox/Triage/`

### 3. Server-Side Import
- [ ] `/opt/processmap-test/PROCESSMAP/HANDOFF/` files copied to `ProcessMap/HANDOFF/`
- [ ] `/opt/processmap-test/docs/` files copied to appropriate folders
- [ ] `/opt/processmap-test/docs/obsidian_fallback/` files copied and classified
- [ ] `/opt/processmap-test/.planning/contours/` files copied to `ProcessMap/Contours/`
- [ ] Originals in `/opt/processmap-test` NOT deleted or modified

### 4. Secret Exclusion
- [ ] No `.env` files in `ProcessMap/`
- [ ] No `*.pem`, `*.key`, `id_rsa`, `id_ed25519` in `ProcessMap/`
- [ ] No `secrets/` directory in `ProcessMap/`
- [ ] Run filename scan:
  ```bash
  find /srv/obsidian/project-atlas/ProcessMap \
    \( -name ".env" -o -name "*.pem" -o -name "*.key" -o -name "id_rsa" -o -name "id_ed25519" \) \
    -print
  ```
  Expected: empty output

### 5. Deduplication
- [ ] Import manifest lists all dedupe skips
- [ ] No exact duplicate (same filename + same content) exists in both source and target
- [ ] If same filename with different content exists, suffix `-from-server-YYYYMMDD` or `-from-imported-YYYYMMDD` was used

### 6. Sync Verification
- [ ] Syncthing shows folder `project-atlas` as "Up to Date" on server
- [ ] Local Mac vault reflects new canonical folders and files
- [ ] No sync errors or conflicts

### 7. RAG Source Readiness
- [ ] `RAG_SOURCE_CANDIDATES.md` exists and defines include/exclude
- [ ] No RAG indexing was performed
- [ ] Curated source folders are clearly identified

### 8. Non-Goals Verification
- [ ] MCP Agent 2 was NOT started
- [ ] Product code was NOT changed
- [ ] RAG indexing was NOT performed
- [ ] `_Imported/20260514/` was NOT deleted

## Review Output

Produce `REVIEW_REPORT.md` in the contour directory with:
1. Pass/fail for each checklist item
2. Issues found with severity: BLOCKER / WARNING / INFO
3. Recommendations
4. Final verdict: `REVIEW_PASS` or `CHANGES_REQUESTED`

## Approval Criteria

- All BLOCKER items pass
- No secrets in vault
- No originals deleted
- Sync functional
