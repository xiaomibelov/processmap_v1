# architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1

ProcessMap Agent RAG / Knowledge Layer — Architecture and Planning Contour

---

## GSD Discipline

- GSD availability result: **AVAILABLE**
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
  - `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `CODEX_GSD_TOOLS_FOUND`
  - 50+ GSD skills present in `/root/.codex/skills`
- GSD tools CLI (`gsd-tools.cjs`) does not accept `--help`; requires no-arg invocation.
- Mode: **GSD_PROCESSMAP_WRAPPER_PLANNING**
- Implementation не выполнялся.
- Product files не менялись.
- Contour bounded.
- RAG remains read-only.
- Agent 2 / Agent 3 gates prepared.

---

## Source / Runtime Truth

| Plane | Value |
|-------|-------|
| pwd | /opt/processmap-test |
| whoami | root |
| hostname | clearvestnic.ru |
| date | 2026-05-16T14:00:54+00:00 |
| branch | fix/lockfile-sync-test |
| HEAD | a9a9d9c5f468d9da63415306da6d34dcd605aa0d |
| origin/main | d805e1c64c1107b9e3fe6854e031694bf741b187 |
| uncommitted | 8 files (55 insertions, 9 deletions) |
| :8088/health | ok, redis healthy |
| :5180 | HTTP 200 OK via nginx |
| Project Atlas | /srv/obsidian/project-atlas/ProcessMap exists, ~715 files |

---

## Problem Statement

Агенты ProcessMap не всегда используют Project Atlas / Obsidian как canonical source truth. Они забывают прошлые contour findings, повторяют неверные гипотезы, а Agent 3 иногда ставит REVIEW_PASS без user-visible proof. Нужен server-side RAG / knowledge retrieval layer, который:

1. Индексирует curated knowledge (Project Atlas, contours, docs, selected code).
2. Даёт контекст Agent 1/2/3 до начала работы.
3. Остаётся read-only suggestion layer — без auto-mutation.
4. Связан с текущим workflow contours + Obsidian mirror.

Это НЕ fine-tuning модели. Это RAG/RAK инфраструктура.

---

## RAG / RAK Definition

- **RAG** (Retrieval-Augmented Generation): агент перед планированием/кодом/ревью запрашивает релевантный контекст из индекса; индекс строится из curated sources.
- **RAK** (Retrieval-Augmented Knowledge): read-only слой знаний, который агенты используют для проверки гипотез, поиска прецедентов, понимания архитектурных решений.
- **Boundary**: RAG/RAK может возвращать только suggestions и context. Никаких auto-mutation, auto-save, BPMN XML writes, Product Actions auto-apply.

---

## Source Inventory Plan

### A. Project Atlas / Obsidian
Root: `/srv/obsidian/project-atlas/ProcessMap`

Include candidates (curated, not raw bulk):
- `AgentReports/` — contour reports mirrored from `.planning/contours/`
- `Architecture/` — архитектурные заметки, ADR
- `Audits/` — аудиты производительности, baseline profiles
- `Contours/` — заметки о контурах
- `Decisions/` — ADR, решения
- `Evidence/` — runtime evidence, proof screenshots
- `HANDOFF/` — handoff notes (curated, not all drafts)
- `Prompts/` — agent prompts, templates
- `RAG/` — существующие RAG/RAK заметки
- `Runtime/` — sync reports, runner bindings, runtime logs (summarized)
- `Backlog/` — приоритизированный backlog
- `_Imported/20260514/` — только после triage и curator review

Exclude:
- Любые файлы с secrets/tokens
- Raw browser storage dumps
- Неотсортированные массовые импорты
- AI draft suggestions как source truth

### B. Planning Contours
Root: `/opt/processmap-test/.planning/contours`

Include:
- `PLAN.md` — план контура
- `EXECUTOR_PROMPT.md` / `REVIEWER_PROMPT.md` — prompt contracts
- `EXEC_REPORT.md` — отчёт исполнителя
- `REVIEW_REPORT.md` — отчёт ревьюера
- `REVIEW_PASS` / `CHANGES_REQUESTED` — вердикт
- `REWORK_REQUEST.md` — запрос на доработку
- `RUNTIME_NAVIGATION.md` / `RUNTIME_PROOF_CHECKLIST.md`
- `STATE.json`
- Любые `ROOT_CAUSE`, `SOURCE_MAP`, `PERFORMANCE`, `RUNTIME` reports

Exclude:
- Raw huge logs unless summarized
- Temporary backup files inside contours

### C. Code
Roots: `frontend/src`, `backend`, `tools`, `scripts`

Include carefully:
- `package.json`, `vite.config.js`, `Dockerfile`, `docker-compose.yml` (если есть)
- Backend routers, RAG modules, models
- Key frontend components (AppShell, ProcessStage, diagram controllers)
- Test files (as evidence of expected behavior)
- Build scripts (`scripts/generate-build-info.mjs`)
- Agent tools (`tools/pm-agent-*.sh`)

Code indexing priority:
- Function/module summaries
- Export/import maps
- Known risk areas (diagram, BPMN, session save)
- Source maps
- Full file bodies only for small critical files; large files → summaries + signatures

Exclude:
- `node_modules/`, `frontend/dist/`, `.git/`
- `__pycache__/`, `*.pyc`
- Raw binary assets unless referenced

### D. Docs
Root: `/opt/processmap-test/docs`, `/opt/processmap-test/PROCESSMAP/HANDOFF`

Include:
- Architecture docs (`docs/bpmnstage_factpack.md`, `docs/processstage_factpack.md`)
- API contracts (`docs/contract_*.md`)
- Decomposition docs (`docs/decompose/`)
- GSD discussions (`docs/gsd/`)
- Interview/test catalogs (`docs/INTERVIEW_ACTIONS_CATALOG.md`)
- RBAC matrices, migration plans
- `PROCESSMAP/HANDOFF/DEPLOY_STATUS.md`

Exclude:
- Raw screenshots unless curated
- Debug JSON dumps unless summarized
- Stale drafts beyond retention

---

## Exclusions / Secrets Policy

Hard excludes (never index):
- `.env` / `.env.*`
- `*.pem`, `*.key`, `id_rsa`, `id_ed25519`
- `secrets/**`
- Raw DB dumps
- Tokens, cookies, session storage state
- `node_modules/**`, `frontend/dist/**`, `build/**`, `cache/**`, `.git/**`
- Huge raw logs unless summarized
- AI draft suggestions as source truth
- Product Actions draft suggestions
- Browser cookies/session tokens
- Any file matching `*secret*`, `*token*`, `*password*`, `*credential*`

Policy enforcement:
- Every indexed chunk must have `excluded_sensitive=false` proof in metadata.
- Indexing pipeline must run a secrets scanner before insert.
- If a file contains a secret, skip the file entirely (do not redact-in-place to avoid partial leaks).

---

## RAG Architecture Plan

### 1. Source Registry
Manifest: `ProcessMap/RAG/INDEX_SOURCES.md` (Obsidian) + local copy.

Fields per source:
- `path` — absolute or repo-relative path
- `category` — project_atlas | contour | docs | code | runtime_evidence
- `include/exclude` — explicit rule
- `owner` — кто отвечает за актуальность
- `freshness` — last updated / auto-sync frequency
- `truth_level` — canonical | evidence | draft | deprecated
- `indexing_priority` — critical | high | normal | low

### 2. Document Classifier
Each document classified before indexing:
- `source_truth` — ADR, contracts, canonical API docs
- `evidence` — runtime proof, screenshots, profiles
- `decision` — ADR, review verdicts
- `prompt_template` — agent prompts, checklists
- `code_map` — exports, module summaries
- `audit` — performance audits, security audits
- `backlog` — prioritized work items
- `draft` — WIP notes (index with low priority, mark as draft)
- `deprecated` — outdated, kept for historical search only
- `raw_log` — summarized only, never raw bulk

### 3. Chunking Strategy

Docs:
- By headings (H1/H2/H3) when possible
- Preserve contour id in metadata
- Preserve file path, title, date, mtime
- Preserve verdict (REVIEW_PASS, CHANGES_REQUESTED)
- Preserve source refs (links to other docs)

Code:
- By file for small files (<200 lines)
- By function/module for large files
- Include path, exports/imports, risk tags
- Do not mix unrelated code in one chunk
- Add `language`, `module`, `risk_area` tags

### 4. Metadata (per chunk)
- `path`
- `title`
- `contour_id` (if present)
- `project = ProcessMap`
- `category`
- `date` / `mtime`
- `verdict` (for contours)
- `source_type`
- `truth_level`
- `tags`
- `excluded_sensitive = false` (with proof)

### 5. Retrieval Use Cases

Agent 1 / Planner:
- Planning context from similar past contours
- Architecture decisions and ADR
- Forbidden changes list
- Acceptance criteria patterns
- User preferences and hard rules

Agent 2 / Executor:
- Source maps for files to touch
- Prior fixes and known regressions
- Test commands and runtime proof requirements
- Rollback notes

Agent 3 / Reviewer:
- User-visible scenario definitions
- Previous user rejections (CHANGES_REQUESTED)
- Exact fail conditions
- Version proof requirements
- Metrics thresholds

### 6. Read-only Boundary
RAG can return only:
- Context snippets
- Suggestions
- Warnings (e.g., "this file had 3 regressions before")
- References to source truth

RAG must NOT:
- Auto-mutate code
- Auto-save files
- Write BPMN XML
- Apply Product Actions automatically
- Override human review verdict

### 7. Freshness / Update Workflow
After each contour completes:
1. EXEC_REPORT / REVIEW_REPORT mirrored to Project Atlas via `./tools/pm-agent-mirror-report.sh`.
2. RAG update job picks up curated reports (not all raw files).
3. `CHANGES_REQUESTED` and user rejection indexed as high-priority warnings.
4. `REVIEW_PASS` does NOT override later user rejection — both states kept.
5. Code index updated on merge to `main` (not on every WIP commit).

---

## Agent 1/2/3 Integration Plan

### Agent 1 / Planner RAG Preflight
Before planning, query RAG for:
- Previous contours with same area (search by keywords + contour category)
- Relevant source maps (files likely to be touched)
- Architecture decisions (ADR matching topic)
- Known rejected approaches (contours with CHANGES_REQUESTED / REWORK_REQUEST)
- Runtime/version/test rules (from RUNTIME_NAVIGATION.md patterns)
- User preferences and hard rules (from AGENTS.md, decisions)

Planner must log in PLAN.md:
```
## RAG Preflight
- query terms: <terms used>
- retrieved sources: <list>
- accepted context: <what influenced the plan>
- rejected/deprecated context: <what was discarded and why>
- how it changed plan: <delta>
```

### Agent 2 / Executor RAG Preflight
Before code, query RAG for:
- Files touched before in similar contours
- Known regressions (search file path + "regression" + contour id)
- Tests (existing test files for target modules)
- Runtime proof requirements (version badge, health checks)
- Source maps (module boundaries, exports)
- Rollback notes (REWORK_REQUEST.md references)

Executor must log in EXEC_REPORT.md:
```
## RAG Context Used
- sources: <list>
- how used: <which decisions were influenced>
- limitations: <what RAG did not cover>
```

### Agent 3 / Reviewer RAG Preflight
Before review, query RAG for:
- User-visible scenario (acceptance criteria from PLAN.md)
- Previous user rejections (contours with CHANGES_REQUESTED on same area)
- Fail conditions (explicit from PLAN.md + past REVIEW_REPORT.md)
- Version proof requirements (runtime navigation patterns)
- Metrics thresholds (perf contours, baseline numbers)

Reviewer must log in REVIEW_REPORT.md:
```
## RAG Review Context
- sources used: <list>
- exact acceptance criteria enforced: <criteria>
- pass type: <user-visible vs bounded/source-level>
```

---

## Validation Query Plan

Agent 2 must prepare test queries and expected answers. Minimum set:

1. **"What are the latest rules for Diagram REVIEW_PASS?"**
   Expected: GSD reviewer discipline; real drag required; version proof required; no source-only pass.

2. **"What happened in perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1?"**
   Expected: v1.0.129; metrics no improvement; React bundle 95%; next perf/process-stage-baseline-jank-v1.

3. **"What are current Diagram lag bottlenecks?"**
   Expected: React baseline jank; ProcessStage/App shell; not bpmn-js engine based on profiler; drag still unresolved.

4. **"What is forbidden for RAG?"**
   Expected: no secrets; no auto-mutation; no BPMN XML writes; no AI drafts as truth.

5. **"Which paths should be indexed?"**
   Expected: Project Atlas; contours; docs; selected code; excludes.

6. **"What is current ProcessMap test runtime?"**
   Expected: clearvestnic.ru:5180; /opt/processmap-test; build-info/version proof.

---

## Read-only Boundary

RAG/RAK layer is strictly read-only suggestion/context provider.

| Allowed | Forbidden |
|---------|-----------|
| Retrieve context | Auto-mutate code |
| Suggest prior fixes | Auto-save files |
| Warn about regressions | Write BPMN XML |
| Reference ADR | Apply Product Actions automatically |
| Build prompts | Override human verdict |
| Summarize evidence | Index secrets |

---

## Implementation Contour Proposal

This planning contour (Agent 1) produces architecture and policy.
Next implementation should be split into bounded contours:

1. **implementation/rag-source-registry-and-indexer-v1**
   - Build SOURCE_REGISTRY manifest
   - Implement document classifier
   - Implement chunking pipeline for docs + code
   - Secrets scanner pre-filter
   - No vector DB yet; extend existing BM25 or add simple embeddings

2. **implementation/rag-agent-prompt-integration-v1**
   - Add RAG preflight blocks to Agent 1/2/3 prompts
   - Implement query templates per agent role
   - Add RAG context logging to reports

3. **implementation/rag-project-atlas-sync-pipeline-v1**
   - Auto-detect new contour reports
   - Mirror to Project Atlas
   - Trigger incremental re-index

4. **implementation/rag-validation-and-test-queries-v1**
   - Run validation queries
   - Measure precision/recall
   - Tweak chunking and metadata

This contour (architecture) does NOT implement any of the above.

---

## Acceptance Criteria

- [x] PLAN.md contains all 14 gates
- [x] GSD discipline recorded
- [x] Source/runtime truth captured
- [x] Source inventory covers Project Atlas, contours, docs, code
- [x] Exclusions/secrets policy is strict and actionable
- [x] RAG architecture has classifier, chunking, metadata, retrieval use cases
- [x] Agent 1/2/3 integration has concrete preflight blocks
- [x] Validation queries are concrete with expected answers
- [x] Read-only boundary is explicit
- [x] Implementation contour proposal is bounded and actionable
- [x] No product code changes
- [x] No package install
- [x] No indexing service start
- [x] AGENT_RUN_ID written

---

## Non-goals

- Fine-tuning LLM weights
- Replacing existing Agent 1/2/3 workflow
- Auto-applying RAG suggestions without human review
- Real-time streaming indexing
- Multi-tenant vector DB for org customers (org-scoped RAG already exists for BPMN/product actions; agent RAG is internal)
- MCP server repair
- GSD tooling fixes

---

## Agent 2 Execution Plan

Agent 2 must:
1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json.
2. Perform concrete source inventory:
   - List actual files in Project Atlas per category
   - List actual contours with their verdicts
   - List actual docs and code candidates with paths
3. Define exclusions/secrets policy with file patterns.
4. Design RAG architecture:
   - Source Registry manifest (`INDEX_SOURCES.md`)
   - Document classifier rules
   - Chunking strategy per source type
   - Metadata schema
5. Design agent integration:
   - Prompt blocks for Agent 1/2/3
   - Query templates
6. Define validation queries with expected answers.
7. Propose next implementation contour(s).
8. Create reports:
   - `EXEC_REPORT.md`
   - `SOURCE_INVENTORY.md`
   - `RAG_ARCHITECTURE.md`
   - `INDEXING_POLICY.md`
   - `AGENT_INTEGRATION_PLAN.md`
   - `VALIDATION_QUERIES.md`
   - `IMPLEMENTATION_CONTOUR_PROPOSAL.md`
   - `READY_FOR_REVIEW`

Constraints:
- No product code changes.
- No package install.
- No indexing service start.
- No BPMN XML mutation.
- No secrets read/output.

---

## Agent 3 Review Plan

Agent 3 must:
1. Run Reviewer GSD Discipline.
2. Read all Agent 2 reports.
3. Verify:
   - Source inventory is concrete (actual paths, not generics).
   - Exclusions are strict and cover secrets.
   - Secrets policy is adequate.
   - RAG read-only boundary is clear and enforced.
   - Agent 1/2/3 integration is concrete (actual prompt blocks).
   - Validation queries are concrete with expected answers.
   - Implementation contour proposal is actionable and bounded.
   - Project Atlas RAG notes are created.
4. Fail if:
   - Plan is generic (no actual source paths).
   - No exclusions or secrets policy.
   - No agent integration.
   - Suggests auto-mutation.
   - Indexes secrets/drafts as truth.
   - Implementation plan tries to do too much in one contour.
5. If pass:
   - Write `REVIEW_REPORT.md`
   - Write `REVIEW_PASS`

---

## Risks

| Risk | Mitigation |
|------|------------|
| Project Atlas is large (~715 files); indexing everything creates noise | Curated inclusion list + classifier + priority tiers |
| Secrets leak into index | Hard exclude list + pre-index scanner + metadata proof field |
| RAG becomes stale | Freshness workflow: mirror on contour completion + incremental update |
| Agent ignores RAG context | Mandatory preflight block in prompts + log in reports |
| Over-engineering vector DB | Start with existing BM25 + simple embeddings; upgrade later in bounded contour |
| Existing backend RAG is org-scoped; agent RAG is internal | Keep agent RAG separate from customer-facing RAG endpoints |

---

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — source/runtime truth captured
- [x] Gate 3 — Project Atlas source inventory completed
- [x] Gate 4 — contour reports source inventory completed
- [x] Gate 5 — code/docs source inventory completed
- [x] Gate 6 — exclusions/secrets policy defined
- [x] Gate 7 — RAG architecture defined
- [x] Gate 8 — Agent 1/2/3 integration defined
- [x] Gate 9 — indexing/update workflow defined
- [x] Gate 10 — validation/proof plan defined
- [x] Gate 11 — implementation contour proposal defined
- [x] Gate 12 — Agent 2 executor prompt ready
- [x] Gate 13 — Agent 3 reviewer prompt ready
- [x] Gate 14 — READY_FOR_EXECUTION marker created
