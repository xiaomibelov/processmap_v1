# Import Rules

## Scope
This document defines classification rules for triaging imported local files and importing server-side ProcessMap documents into the canonical Project Atlas vault structure.

## Canonical Folders

```
ProcessMap/
├── HANDOFF/       # Curated handoff notes from AI sessions
├── Evidence/      # Runtime evidence, test results, proofs
├── Decisions/     # Architecture and product decisions (ADRs)
├── Runtime/       # Runtime config, telemetry summaries, health checks
├── Prompts/       # Reusable AI prompts and templates
├── Contours/      # GSD / planning contour manifests and plans
├── Architecture/  # System architecture docs, API contracts, design notes
├── Audits/        # Audit reports, security reviews, code reviews
├── Backlog/       # Backlog items, epics, parking lot, ideas
├── RAG/           # RAG configuration, index manifests, exclusion rules
└── _Inbox/Triage/ # Staging area for uncertain or new items
```

## Classification Rules

### 1. HANDOFF
**Target:** `ProcessMap/HANDOFF/`

**Criteria:**
- Filename contains `handoff`, `HANDOFF`, `session summary`, `contour handoff`
- Content describes work performed by AI agent in a contour session
- Includes date, contour ID, decisions, open questions
- Root-level handoff files from old vault

**Examples:**
- `2026-05-07 - feature admin ai provider settings and product actions prompt v1.md`
- `feature-discussions-attention-acknowledgement-v1.md`

### 2. AUDITS
**Target:** `ProcessMap/Audits/`

**Criteria:**
- Filename contains `audit`, `AUDIT`, `forensic`, `investigation`
- Security audit, performance audit, code review
- Filename contains `proof` but describes audit/verification activity
- Root-level audit files from old vault

**Examples:**
- `2026-04-22 - Stage extension-state BPMN properties conflict bounded contour.md`
- `Frontend loading audit — session, BPMN, revisions, versions.md`

### 3. ARCHITECTURE
**Target:** `ProcessMap/Architecture/`

**Criteria:**
- API contracts, data models, system design
- `PROJECT ATLAS/` docs (backend API map, CAS map, performance map)
- `source truth`, `source map`, `architecture` in filename
- Deployment and environment docs
- ProcessMap flow documents

**Examples:**
- `06_Backend API карта.md`
- `05_Карта сохранения и CAS.md`
- `Processmap flow.md`
- `contract_project_api.md`

### 4. DECISIONS
**Target:** `ProcessMap/Decisions/`

**Criteria:**
- Filename contains `decision`, `decisions`, `ADR`, `журнал решений`
- Explicit decision records with context and consequences
- Architecture decision records

**Examples:**
- `16_Журнал решений.md`
- Files under `docs/decompose/` that are decision records

### 5. RUNTIME
**Target:** `ProcessMap/Runtime/`

**Criteria:**
- Filename contains `runtime`, `evidence`, `proof`, `healthcheck`, `telemetry`
- Runtime configuration summaries
- Test result evidence (not audit reports)
- Stage freshness proofs
- Deployment verification notes

**Examples:**
- `14_Журнал runtime evidence.md`
- `runtime product action properties stage save reload proof v1.md`
- `server-sync-test.md`

### 6. EVIDENCE
**Target:** `ProcessMap/Evidence/`

**Criteria:**
- Test artifacts, screenshots descriptions, verification outputs
- Performance benchmarks
- Bug reproduction steps
- Forensic artifacts that are not audit reports

**Note:** Borderline with Runtime. If the file is about system health/telemetry → Runtime. If about specific bug/test evidence → Evidence.

### 7. CONTOURS
**Target:** `ProcessMap/Contours/<contour-id>/`

**Criteria:**
- Files from `.planning/contours/`
- PLAN.md, EXECUTOR_PROMPT.md, REVIEWER_PROMPT.md, STATE.json
- Contour-specific documentation

**Structure:**
```
ProcessMap/Contours/
├── tooling/
│   ├── mcp-servers-inventory-and-repair-v1/
│   └── project-atlas-sync-and-rag-bootstrap-v1/
```

**Note:** Only copy markdown and json files. Do NOT copy READY_FOR_EXECUTION markers or binary artifacts.

### 8. PROMPTS
**Target:** `ProcessMap/Prompts/`

**Criteria:**
- Reusable AI prompts
- System prompt templates
- Prompt engineering notes
- Files explicitly labeled as prompts

### 9. BACKLOG
**Target:** `ProcessMap/Backlog/`

**Criteria:**
- Epic tracking files
- Backlog items
- Parking lot entries
- Feature requests not yet in execution
- `ACTIVE TASKS.md`

**Sub-structure:**
```
ProcessMap/Backlog/
├── EPICS/
│   ├── Active/
│   ├── Backlog/
│   ├── Blocked/
│   └── Closed/
└── Tasks/
```

### 10. RAG
**Target:** `ProcessMap/RAG/`

**Criteria:**
- RAG configuration docs
- Index manifests
- Exclusion rule definitions
- Files about RAG strategy and setup

### 11. _Inbox/Triage
**Target:** `ProcessMap/_Inbox/Triage/`

**Criteria:**
- Unclear classification
- Draft or incomplete notes
- Duplicate candidates needing review
- Notes that may be outdated
- `Untitled *.md` files
- Files with ambiguous names

## Server-Side Source Mapping

| Source Path | Target Folder | Notes |
|-------------|--------------|-------|
| `/opt/processmap-test/PROCESSMAP/HANDOFF/*.md` | `ProcessMap/HANDOFF/` | Curated server handoffs |
| `/opt/processmap-test/docs/*.md` | `ProcessMap/Architecture/` or `ProcessMap/Audits/` | Classify by content |
| `/opt/processmap-test/docs/obsidian_fallback/project_atlas_updates/*/*.md` | `ProcessMap/Architecture/` / `Runtime/` / `Decisions/` / `Backlog/` | Classify by subdir name |
| `/opt/processmap-test/docs/decompose/*.md` | `ProcessMap/Architecture/` | Decomposition docs |
| `/opt/processmap-test/docs/gsd/*.md` | `ProcessMap/Contours/` | GSD discussion docs |
| `/opt/processmap-test/.planning/contours/*/*.md` | `ProcessMap/Contours/<id>/` | Contour plans |
| `/opt/processmap-test/.planning/contours/*/STATE.json` | `ProcessMap/Contours/<id>/` | State metadata |

## Exclusions (Do NOT Import)

- `.env`, `.env.*`
- `*.pem`, `*.key`, `id_rsa`, `id_ed25519`
- `node_modules/`, `.venv/`, `venv/`
- Raw logs > 1MB
- Binary files (images, videos, archives)
- Build outputs
- Temporary files
- AI draft suggestions unless curated

## Filename Collision Rules

1. Calculate SHA256 of source file
2. If same filename + same SHA256 already exists in target → skip
3. If same filename but different SHA256 → copy with suffix `-from-server-YYYYMMDD` or `-from-imported-YYYYMMDD`
4. Log all collisions in import manifest
