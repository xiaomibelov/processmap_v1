# Executor Prompt: Project Atlas Server Docs Import + Triage

## Objective
1. Triage 260 imported local files from `ProcessMap/_Imported/20260514/` into canonical folders.
2. Import server-side ProcessMap docs from `/opt/processmap-test` into canonical folders.
3. Prepare curated source set for future RAG indexing.
4. Write import manifest.

## Vault Path
```
/srv/obsidian/project-atlas
```

## Step 1: Pre-flight Checks

```bash
VAULT="/srv/obsidian/project-atlas"
echo "=== SOURCE TRUTH ==="
hostname && whoami && date

echo "=== SECRET CHECK ==="
find /opt/processmap-test/PROCESSMAP /opt/processmap-test/docs /opt/processmap-test/.planning/contours \
  -maxdepth 6 \
  \( -name ".env" -o -name ".env.*" -o -name "*.pem" -o -name "*.key" -o -name "id_rsa" -o -name "id_ed25519" \) \
  -print 2>/dev/null || true
```

If secrets found: **STOP**. Report paths. Do NOT copy.

## Step 2: Create Triage Folder

```bash
mkdir -p "$VAULT/ProcessMap/_Inbox/Triage"
```

## Step 3: Triage Imported Snapshot

Source: `$VAULT/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/`

### Classification Map

| Source Subfolder | Target | Action |
|-----------------|--------|--------|
| `HANDOFF/` | `ProcessMap/HANDOFF/` | Copy all `.md` files |
| `AUDITS/` | `ProcessMap/Audits/` | Copy all `.md` files |
| `PROJECT ATLAS/` | `ProcessMap/Architecture/` | Copy all `.md` files |
| `PROJECT ATLAS/BPMN 123/` | `ProcessMap/Architecture/BPMN 123/` | Copy all `.md` files |
| `EPICS/` | `ProcessMap/Backlog/EPICS/` | Preserve sub-structure (Active/Backlog/Blocked/Closed) |
| Root notes (dated, specific) | `ProcessMap/HANDOFF/` or `ProcessMap/Architecture/` | Classify by name |
| Root notes (ambiguous: `Untitled *.md`, `Аудит от 21.03.md`, etc.) | `ProcessMap/_Inbox/Triage/` | Do not guess |

### Deduplication

Before copying each file:
1. Calculate SHA256: `sha256sum <file>`
2. Check if same basename exists in target
3. If same basename + same SHA256 → skip, log as "dedupe_skip"
4. If same basename + different SHA256 → copy with suffix `-from-imported-20260514`
5. Log all actions

### Root Notes Classification Examples

Copy to `HANDOFF/`:
- `2026-04-17 - Codex session telemetry contour handoff.md`
- `2026-04-10 - Feature - backend task clipboard v1.md`
- `2026-04-10 - Fix - copy task camunda properties import.md`

Copy to `Architecture/`:
- `2026-04-09 - Архитектура - frontend backend infra storage integrations.md`
- `2026-04-09 - Deployment и environments.md`
- `2026-04-09 - Runtime и source truth.md`

Copy to `Audits/`:
- `2026-04-11 - Forensic audit - edge semantics contour.md`
- `2026-04-09 - Forensic audit - toolbar save 35bc7d76bc.md`

Copy to `_Inbox/Triage/`:
- `ACTIVE TASKS.md`
- `EPIC BOARD.md`
- `PROJECT MAP.md`
- `Untitled 1.md`, `Untitled 2.md`, etc.
- `payload-shape.md`
- `Работа со студентам.md`
- `След правки.md`
- `айдит.md`
- `cutover checklist.md`

## Step 4: Import Server-Side Docs

### Source A: Curated Handoffs
```bash
SRC="/opt/processmap-test/PROCESSMAP/HANDOFF"
DST="$VAULT/ProcessMap/HANDOFF"
# Copy all .md files, dedupe by SHA256
```

### Source B: Obsidian Fallback Updates
```bash
SRC="/opt/processmap-test/docs/obsidian_fallback/project_atlas_updates"
DST_BASE="$VAULT/ProcessMap"
```

Map by filename pattern:
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
- `*Explorer и Admin*` → `Architecture/`
- `handoff.md` → `HANDOFF/`
- `README.md` → `Architecture/` (with contour name prefix)

### Source C: General Docs
```bash
SRC="/opt/processmap-test/docs"
DST_BASE="$VAULT/ProcessMap"
```

Classify by content type:
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
```bash
SRC="/opt/processmap-test/.planning/contours"
DST="$VAULT/ProcessMap/Contours"
```

Copy structure preserving contour IDs:
```
ProcessMap/Contours/
├── tooling/
│   ├── mcp-servers-inventory-and-repair-v1/
│   ├── project-atlas-sync-and-rag-bootstrap-v1/
│   └── project-atlas-server-docs-import-and-triage-v1/
```

Copy only:
- `*.md`
- `*.json` (STATE.json only)

Do NOT copy:
- `READY_FOR_EXECUTION` markers
- Binary files
- Log files

## Step 5: Write Import Manifest

Create:
```
$VAULT/ProcessMap/Runtime/import-manifest-server-triage-<TIMESTAMP>.md
```

Contents:
- Run date, server, agent
- Source paths
- Files copied by target folder
- Dedupe skips
- Filename collisions with suffixes
- Secret check result
- Remaining triage items

## Step 6: Verify Sync

After all copies:
```bash
# Check Syncthing sees new files
ls -la "$VAULT/ProcessMap/"
# Verify file count changed
find "$VAULT/ProcessMap" -type f | wc -l
```

Wait 30-60 seconds for Syncthing to scan and sync.
Check local Mac vault for new files via Syncthing Web UI or local file browser.

## Constraints

- **COPY ONLY** — never move, never delete originals
- **NO product code changes**
- **NO MCP Agent 2 start**
- **NO RAG indexing**
- **NO secrets** — if found, stop and report
- **NO raw logs > 1MB**
- When in doubt → `_Inbox/Triage/`

## Success Criteria

- [ ] All 260 imported files classified and copied or triaged
- [ ] Server-side docs copied from all 4 sources
- [ ] No secrets in vault
- [ ] Import manifest written
- [ ] Syncthing syncs new files to local Mac
- [ ] `_Imported/20260514/` preserved (not deleted)
