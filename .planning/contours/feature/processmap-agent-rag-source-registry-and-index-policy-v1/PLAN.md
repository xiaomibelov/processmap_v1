# feature/processmap-agent-rag-source-registry-and-index-policy-v1

Contour: ProcessMap Agent RAG — Source Registry and Index Policy (Implementation Contour 1)
Previous Architecture Contour: `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1` (REVIEW_PASS)
Planner Run ID: `20260516T142047Z-97868`
Date: 2026-05-16T14:22:00+00:00

---

## GSD Discipline

- **GSD availability result**:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd` (found)
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk` (found, warns about npm package, uses Codex-local wrapper)
  - `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `CODEX_GSD_TOOLS_FOUND`
  - GSD skills: 50+ `gsd-*` directories under `/root/.codex/skills`
- **Commands run**:
  - `gsd --help` → returns usage via wrapper
  - `gsd-sdk --help` → confirms Codex-local wrapper path
- **Mode**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- **Boundaries enforced**:
  - Implementation code was NOT written by Agent 1.
  - Product runtime files were NOT changed.
  - Contour is bounded to tooling/docs/config only.
  - RAG remains read-only in all planning artifacts.
  - Agent 2 / Agent 3 gates are prepared below.

---

## Source / Runtime Truth

| Check | Value |
|-------|-------|
| pwd | `/opt/processmap-test` |
| whoami | `root` |
| hostname | `clearvestnic.ru` |
| date | `2026-05-16T14:21:58+00:00` |
| git branch | `fix/lockfile-sync-test` |
| HEAD | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| uncommitted files | 8 frontend product files (unrelated to this contour) |
| contour artifacts | untracked files in `.planning/contours/` |
| backend health | `{"ok":true,"status":"ok","redis":{"state":"healthy"}}` at `:8088/health` |
| frontend served | HTTP 200 OK at `:5180` via nginx |

**Branch divergence note**: Current branch has 8 modified frontend files unrelated to this RAG contour. Per AGENTS.md §3, this does not block this contour because no product code changes are planned.

---

## Previous Architecture Source Truth

Architecture contour `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1` passed review (REVIEW_PASS, Review Run ID: `20260516T135947Z-95859`).

Key artifacts consumed:
- `SOURCE_INVENTORY.md` — 727 Project Atlas files, 40 contours with verdicts, code candidates with risk tags
- `RAG_ARCHITECTURE.md` — source registry fields, 10-class classifier, chunking strategies, 18-field metadata schema, retrieval mapping per agent
- `INDEXING_POLICY.md` — hard exclude globs/regex, secrets scanner rules, `excluded_sensitive=false` proof template
- `AGENT_INTEGRATION_PLAN.md` — preflight blocks, query templates, logging formats for Agent 1/2/3
- `VALIDATION_QUERIES.md` — 7 validation queries with expected answers and objective pass/fail
- `IMPLEMENTATION_CONTOUR_PROPOSAL.md` — 4 bounded implementation contours with dependency graph

This contour implements **Contour 1** from the proposal, scoped to registry/policy/classifier/schema/manifest **tooling only** (no backend Python modules, no vector DB, no embeddings).

---

## Problem Statement

ProcessMap agents (Agent 1/2/3) need a machine-readable, secrets-safe, read-only knowledge layer over Project Atlas, planning contours, curated docs, and selected code. Before any retrieval or indexing can occur, we need:
1. A concrete source registry with actual paths.
2. A strict indexing policy with hard exclusions.
3. A secrets scanner that fails closed.
4. A document classifier (rule-based/BM25-first).
5. An 18-field metadata schema implementation.
6. A sample manifest builder (no embeddings).

This contour builds the **foundational tooling and policy layer only**.

---

## Implementation Scope

### In Scope (Agent 2)
1. **Source registry JSON** — actual paths, categories, include/exclude globs, truth levels, priorities.
2. **Indexing policy Markdown** — include/exclude rules, secrets policy, draft/deprecated/raw-log policy, read-only boundary.
3. **Secrets scanner script** — Node/mjs, dry-run, detects paths and content patterns, reports only path+rule+severity.
4. **Document classifier rules JSON** — 10 classes from architecture, rule-based logic.
5. **Metadata schema JSON** — 18 fields from architecture, types, required flags.
6. **Manifest builder script** — Node/mjs, reads registry, lists candidates, classifies, attaches metadata, computes sha256, produces JSON+MD manifest.
7. **Validation script** — Node/mjs, validates registry schema, checks paths, runs secrets scan, builds sample manifest, exits non-zero on risk.
8. **Project Atlas RAG docs** — update/create INDEX_SOURCES.md, INDEXING_POLICY.md, Metadata Schema.md, Validation Queries.md.
9. **Contour reports** — EXEC_REPORT.md, SOURCE_REGISTRY_REPORT.md, INDEXING_POLICY_REPORT.md, SECRETS_SCAN_REPORT.md, MANIFEST_BUILD_REPORT.md, VALIDATION_RESULTS.md, IMPLEMENTATION_NOTES.md.

### Out of Scope (Explicit Non-Goals)
- Full RAG search server.
- Vector database or embeddings.
- Package installation.
- Product runtime UI changes.
- Backend API changes.
- Auto-mutation of any kind.
- BPMN XML mutation.
- Product Actions auto-apply.
- Indexing secrets.
- Treating AI drafts as canonical truth.
- MCP repair.
- Stage/prod deploy.
- Commit/push/PR.

---

## Source Registry Plan

**Output file**: `tools/rag/processmap-rag-sources.json`

**Required source roots** (from architecture SOURCE_INVENTORY.md):
- `/srv/obsidian/project-atlas/ProcessMap`
- `/opt/processmap-test/.planning/contours`
- `/opt/processmap-test/docs`
- `/opt/processmap-test/PROCESSMAP/HANDOFF`
- `/opt/processmap-test/frontend/src`
- `/opt/processmap-test/backend`
- `/opt/processmap-test/tools`
- `/opt/processmap-test/scripts`

**Per-source fields**:
- `id` — stable identifier
- `path` — absolute path
- `category` — `project_atlas` | `contour` | `docs` | `code` | `runtime_evidence`
- `include_globs` — array of glob strings
- `exclude_globs` — array of glob strings
- `truth_level` — `canonical` | `evidence` | `draft` | `deprecated`
- `indexing_priority` — `critical` | `high` | `normal` | `low`
- `owner` — team or contour_id
- `notes` — human-readable notes

**Hard exclusions** (must appear in every source's `exclude_globs` or global policy):
- `**/.env*` | `**/*.pem` | `**/*.key` | `**/id_rsa` | `**/id_ed25519`
- `**/node_modules/**` | `**/frontend/dist/**` | `**/__pycache__/**` | `**/*.pyc`
- `**/.git/**` | `**/.playwright-mcp/**` | `**/.agents/**` | `**/*.backup*`
- `/srv/obsidian/project-atlas/ProcessMap/_Imported/**`
- `**/debug-*.mjs` | `**/run-*.mjs`

---

## Indexing Policy Plan

**Output file**: `docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md` (or Project Atlas mirror)

**Sections**:
1. Include rules — what categories are indexed and why.
2. Exclude rules — hard globs + regexes + specific paths.
3. Secrets scanner rules — 5 secret categories, scanner behavior, pre-index checklist.
4. AI drafts policy — never treat as canonical; mark `draft` truth level.
5. Deprecated docs policy — index only if historical search needed; mark `deprecated`.
6. Raw logs policy — summarize only; never index raw bulk.
7. Screenshots/binaries policy — exclude unless curated into evidence docs.
8. Update workflow — mirror trigger, incremental refresh, max age rules.
9. Read-only boundary — explicit allowed/forbidden table.

**Mirror to Project Atlas**: `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEXING_POLICY.md`

---

## Secrets Scanner Plan

**Output file**: `tools/rag/pm-rag-scan-secrets.mjs`

**Requirements**:
- Node.js built-ins only (fs, path, crypto, url).
- Input: `--registry <path>` or `--path <path>`.
- Path risk detection:
  - `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `secrets/`, cookies/session storage files.
- Content pattern detection (without printing values):
  - `token=`, `api_key`, `private key block`, `password=`, `bearer`, JWT-like strings.
- Report format: JSON or Markdown with `path`, `rule_id`, `severity` (critical|high|medium).
- **Never print secret values**.
- Exit code: `0` if clean, `1` if secrets detected, `2` if error.

**Validation**: Run against source registry; ensure `.env.backup_20260514_095731` is flagged.

---

## Document Classifier Plan

**Output file**: `tools/rag/processmap-rag-classifier-rules.json`

**10 classes** (from RAG_ARCHITECTURE.md):
1. `source_truth` — ADR, contracts, canonical API docs, fact packs
2. `evidence` — runtime proof, screenshots, profiles, before/after reports
3. `decision` — ADR, review verdicts, go/no-go decisions
4. `prompt_template` — agent prompts, checklists, skill bindings
5. `code_map` — export/import maps, module summaries, architecture notes
6. `audit` — performance audits, security audits, baseline profiles
7. `backlog` — prioritized work items, epics, active tasks
8. `draft` — WIP notes, unreviewed suggestions
9. `deprecated` — outdated docs kept for historical search
10. `raw_log` — summarized only; never raw bulk

**Rule-based logic** (path/heuristic based, no embeddings):
- Path contains `ADR` or `factpack` or `contract` → `source_truth`
- Path contains `RUNTIME_EVIDENCE` or `BASELINE` or `PROFILE` → `evidence`
- Path contains `REVIEW_PASS` or `CHANGES_REQUESTED` → `decision`
- Path contains `PROMPT` or `SKILL` → `prompt_template`
- Extension in `.py`, `.jsx`, `.js` and lines > 200 → `code_map`
- Path contains `AUDIT` or `audit` → `audit`
- Path contains `BACKLOG` or `EPIC` → `backlog`
- Path contains `draft` or `wip` → `draft`
- Path contains `deprecated` or `obsolete` → `deprecated`
- Extension in `.log` or path contains `raw_log` → `raw_log`
- Default → `draft` (conservative)

---

## Metadata Schema Plan

**Output file**: `tools/rag/processmap-rag-metadata-schema.json`

**18 fields** (from RAG_ARCHITECTURE.md §4):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `chunk_id` | UUID | yes | Unique per chunk |
| `path` | string | yes | Source file path |
| `title` | string | yes | Document title or inferred heading |
| `contour_id` | string | if applicable | e.g., `fix/diagram-canvas-reload-loop-v1` |
| `project` | string | yes | Always `ProcessMap` |
| `category` | enum | yes | `project_atlas` / `contour` / `docs` / `code` / `runtime_evidence` |
| `date` | ISO string | yes | Document creation or capture date |
| `mtime` | ISO string | yes | File modification time |
| `verdict` | enum | if contour | `REVIEW_PASS` / `CHANGES_REQUESTED` / `REVIEW_BLOCKED` |
| `source_type` | enum | yes | `markdown` / `python` / `javascript` / `json` / `yaml` |
| `truth_level` | enum | yes | `canonical` / `evidence` / `draft` / `deprecated` |
| `tags` | string[] | yes | e.g., `["diagram", "perf", "save"]` |
| `excluded_sensitive` | boolean | yes | Must be `false` |
| `excluded_sensitive_proof` | object | yes | Scanner evidence object |
| `language` | string | if code | `python`, `javascript`, `jsx` |
| `module` | string | if code | e.g., `backend.app.rag.search` |
| `risk_area` | string | if code | `diagram`, `save`, `session`, `bpmn_xml` |
| `lines_start` | int | if code | Start line in source |
| `lines_end` | int | if code | End line in source |

Schema JSON must define types, required arrays, and enum values.

---

## Manifest Builder Plan

**Output file**: `tools/rag/pm-rag-build-manifest.mjs`

**Requirements**:
- Node.js built-ins only.
- Read `tools/rag/processmap-rag-sources.json`.
- For each source root, expand globs (using `fs.readdir` recursive or `glob` emulation with built-ins).
- Apply `exclude_globs` — skip excluded files.
- Run classifier rules to assign class.
- Generate metadata per file (18 fields where applicable; file-level metadata, not chunk-level yet).
- Compute `sha256` of file content.
- Produce outputs:
  - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.json`
  - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.md`
- `--sample --limit 200` flag for capped sample runs.
- No embeddings; BM25/source manifest only.

---

## Project Atlas Update Plan

**Target files**:
- `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEX_SOURCES.md` — create from INDEX_SOURCES_DRAFT.md, add concrete registry references
- `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEXING_POLICY.md` — mirror from docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Metadata Schema.md` — document 18-field schema
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Validation Queries.md` — reference architecture validation queries, note they remain theoretical until Contour 4

**After updates**: Run `./tools/pm-agent-mirror-report.sh` if applicable, or document manual update in EXEC_REPORT.md.

---

## Validation Plan

**Validation commands** (exact; names may differ if repo conventions require, but must be documented):

```bash
cd /opt/processmap-test

# 1. Validate registry schema and paths
node tools/rag/pm-rag-validate-policy.mjs

# 2. Run secrets scanner dry-run against registry
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json

# 3. Build sample manifest (capped at 200 files)
node tools/rag/pm-rag-build-manifest.mjs --sample --limit 200

# 4. Verify excluded paths are not in manifest
grep -E "\.env|\.pem|node_modules|dist|__pycache__" .planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.json && echo "FAIL: excluded paths found" || echo "PASS"

# 5. Verify Project Atlas RAG docs exist
ls -la /srv/obsidian/project-atlas/ProcessMap/RAG/INDEX_SOURCES.md
ls -la /srv/obsidian/project-atlas/ProcessMap/RAG/INDEXING_POLICY.md
```

**Pass criteria**:
- Registry validation exits 0.
- Secrets scanner exits 0 (no secrets in included sources).
- Manifest builder exits 0 and produces both JSON and MD.
- Manifest does not contain `.env`, `.pem`, `node_modules`, `dist`, `__pycache__`.
- Project Atlas docs are created/updated.

---

## Acceptance Criteria

1. Source registry exists and contains actual paths.
2. Include/exclude policy exists and is concrete.
3. Hard secret exclusions are present.
4. Secrets scanner exists and does not print secret values.
5. Manifest builder exists and produces sample manifest.
6. Metadata schema exists.
7. Document classifier rules exist.
8. Project Atlas RAG docs updated.
9. No product runtime behavior changed.
10. No backend/frontend app changes unless only harmless tooling import is justified.
11. No package install.
12. No embeddings/vector DB started.
13. No secrets indexed or printed.
14. Read-only boundary explicit.
15. Agent 1/2/3 integration from architecture preserved.
16. Validation commands run and pass.
17. Implementation contour proposal for next step updated.

---

## Non-Goals

- No full RAG search server yet.
- No vector database.
- No embeddings.
- No package installation.
- No product runtime UI changes.
- No backend API changes.
- No auto-mutation.
- No BPMN XML mutation.
- No Product Actions auto-apply.
- No indexing secrets.
- No treating AI drafts as truth.
- No MCP repair.
- No stage/prod deploy.
- No PR/merge/push.

---

## Agent 2 Execution Plan

Agent 2 must:
1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json.
2. Read previous architecture reports for context.
3. Confirm source/runtime truth (pwd, branch, HEAD, git status).
4. Implement:
   - `tools/rag/processmap-rag-sources.json`
   - `docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md`
   - `tools/rag/processmap-rag-metadata-schema.json`
   - `tools/rag/processmap-rag-classifier-rules.json`
   - `tools/rag/pm-rag-scan-secrets.mjs`
   - `tools/rag/pm-rag-build-manifest.mjs`
   - `tools/rag/pm-rag-validate-policy.mjs`
5. Run validation commands; capture output.
6. Update Project Atlas RAG docs.
7. Create all contour reports (EXEC_REPORT.md, etc.).
8. Write READY_FOR_REVIEW.
9. If blocked, write EXEC_BLOCKED.md and do NOT write READY_FOR_REVIEW.

**Agent 2 hard rules**:
- Use Node.js built-ins if possible.
- No product runtime changes.
- No package install.
- No embeddings/vector DB.
- No secrets printed.

---

## Agent 3 Review Plan

Agent 3 must:
1. Run Reviewer GSD Discipline (see REVIEWER_PROMPT.md).
2. Read all Agent 2 reports.
3. Inspect changed files (git diff --name-only).
4. Run validation commands independently.
5. Verify scanner does not print secret values.
6. Verify excluded paths are actually excluded from manifest.
7. Verify manifest sample contains expected safe sources.
8. Verify manifest excludes `.env`, keys, `node_modules`, `dist`, build/cache.
9. Verify no product runtime files changed unless strictly tooling-only.
10. Create REVIEW_REPORT.md.
11. If pass: create REVIEW_PASS.
12. If fail: create CHANGES_REQUESTED + REWORK_REQUEST.md.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Secrets leak via scanner false negative | Fail-closed policy; manual review flag; regex covers 5 secret categories |
| Over-indexing noise | Classifier + priority tiers; capped `--limit 200` for sample |
| File system access failures on large trees | Graceful skip + log; do not crash manifest builder |
| Node.js built-in glob limitations | Implement minimal recursive directory walker; avoid external deps |
| Project Atlas write permissions | Check `/srv/obsidian/project-atlas/ProcessMap/RAG/` writable; log any failure |
| Stale architecture contour references | This contour is scoped to architecture as of 2026-05-16; future architecture changes need new contour |

---

## Gates

- [x] **Gate 1** — GSD discipline completed
- [x] **Gate 2** — Architecture contour reviewed (REVIEW_PASS)
- [x] **Gate 3** — Source/runtime truth captured
- [x] **Gate 4** — Source registry implementation scope defined
- [x] **Gate 5** — Index policy scope defined
- [x] **Gate 6** — Secrets scanner scope defined
- [x] **Gate 7** — Document classifier scope defined
- [x] **Gate 8** — Manifest output scope defined
- [x] **Gate 9** — Validation commands defined
- [x] **Gate 10** — No-mutation/no-secrets boundaries defined
- [x] **Gate 11** — Agent 2 executor prompt ready
- [x] **Gate 12** — Agent 3 reviewer prompt with GSD ready
- [x] **Gate 13** — READY_FOR_EXECUTION marker created
