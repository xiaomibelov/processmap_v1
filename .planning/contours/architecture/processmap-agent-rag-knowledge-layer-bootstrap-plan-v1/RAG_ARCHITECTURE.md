# RAG_ARCHITECTURE — ProcessMap Agent RAG / Knowledge Layer

Contour: architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1

---

## 1. Source Registry Manifest

See also: `INDEX_SOURCES.md` draft in Project Atlas.

### Registry Fields (per source)

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | Absolute or repo-relative path |
| `category` | enum | `project_atlas` \| `contour` \| `docs` \| `code` \| `runtime_evidence` |
| `rule` | enum | `include` \| `exclude` |
| `owner` | string | Who is responsible for freshness (contour_id or team) |
| `freshness` | object | `{ last_updated: ISO, auto_sync: frequency }` |
| `truth_level` | enum | `canonical` \| `evidence` \| `draft` \| `deprecated` |
| `indexing_priority` | enum | `critical` \| `high` \| `normal` \| `low` |
| `chunking_strategy` | enum | `by_heading` \| `by_file` \| `by_function` \| `summary_only` |
| `excluded_sensitive` | boolean | Must be `false` with proof |

### Example Registry Entries

```yaml
sources:
  - path: /srv/obsidian/project-atlas/ProcessMap/Architecture/Processmap flow.md
    category: project_atlas
    rule: include
    owner: architecture-team
    truth_level: canonical
    indexing_priority: critical
    chunking_strategy: by_heading

  - path: /opt/processmap-test/.planning/contours/*/EXEC_REPORT.md
    category: contour
    rule: include
    owner: contour-executor
    truth_level: evidence
    indexing_priority: critical
    chunking_strategy: by_heading

  - path: /opt/processmap-test/docs/bpmnstage_factpack.md
    category: docs
    rule: include
    owner: product-team
    truth_level: canonical
    indexing_priority: critical
    chunking_strategy: by_heading

  - path: /opt/processmap-test/backend/app/rag/*.py
    category: code
    rule: include
    owner: backend-team
    truth_level: canonical
    indexing_priority: critical
    chunking_strategy: by_function

  - path: "**/.env*"
    category: any
    rule: exclude
    reason: secrets_policy
```

---

## 2. Document Classifier Rules

Every document is classified before indexing.

| Class | Definition | Priority | Metadata Tag |
|-------|------------|----------|--------------|
| `source_truth` | ADR, contracts, canonical API docs, fact packs | critical | `truth:canonical` |
| `evidence` | Runtime proof, screenshots, profiles, before/after reports | high | `truth:evidence` |
| `decision` | ADR, review verdicts, go/no-go decisions | critical | `truth:canonical` |
| `prompt_template` | Agent prompts, checklists, skill bindings | high | `type:prompt` |
| `code_map` | Export/import maps, module summaries, architecture notes | high | `type:code_map` |
| `audit` | Performance audits, security audits, baseline profiles | high | `truth:evidence` |
| `backlog` | Prioritized work items, epics, active tasks | normal | `type:backlog` |
| `draft` | WIP notes, unreviewed suggestions | low | `truth:draft` |
| `deprecated` | Outdated docs kept for historical search | low | `truth:deprecated` |
| `raw_log` | Summarized only; never raw bulk | low | `type:log` |

### Classifier Logic

```
if path contains "ADR" or "factpack" or "contract":
    class = source_truth
elif path contains "RUNTIME_EVIDENCE" or "BASELINE" or "PROFILE":
    class = evidence
elif path contains "REVIEW_PASS" or "CHANGES_REQUESTED":
    class = decision
elif path contains "PROMPT" or "SKILL":
    class = prompt_template
elif extension in (.py, .jsx, .js) and lines > 200:
    class = code_map
elif path contains "AUDIT" or "audit":
    class = audit
elif path contains "BACKLOG" or "EPIC":
    class = backlog
elif path contains "draft" or "wip":
    class = draft
else:
    class = draft  # default conservative
```

---

## 3. Chunking Strategy per Source Type

### Docs (Markdown, fact packs, contracts)

- **Primary**: By headings (H1 → H2 → H3)
- **Preserve**: File path, title, contour id, date, mtime
- **Preserve**: Verdict markers (REVIEW_PASS, CHANGES_REQUESTED)
- **Preserve**: Source refs (internal links to other docs)
- **Overlap**: None between heading blocks; links in metadata
- **Max chunk size**: 2000 tokens

### Code (Python, JS, JSX)

- **Small files** (<200 lines): By file, one chunk
- **Large files** (≥200 lines): By function/class/module boundary
- **Include**: Path, exports/imports, risk tags
- **Do not mix**: Unrelated functions from different modules in one chunk
- **Metadata**: `language`, `module`, `risk_area`, `lines`
- **Max chunk size**: 1500 tokens

### Contour Reports (EXEC_REPORT, REVIEW_REPORT)

- **Primary**: By section heading
- **Preserve**: Contour id, verdict, agent role, execution date
- **Special**: `CHANGES_REQUESTED` and `REWORK_REQUEST` sections get high-priority boost
- **Max chunk size**: 2000 tokens

### Runtime Evidence (profiles, screenshots, logs)

- **Summarized only**: Human-readable summary + key metrics
- **Raw data**: Not indexed; summary chunk references raw file path
- **Metadata**: `evidence_type`, `runtime_date`, `metrics_json`

---

## 4. Metadata Schema (per chunk)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chunk_id` | UUID | yes | Unique identifier |
| `path` | string | yes | Source file path |
| `title` | string | yes | Document title or inferred heading |
| `contour_id` | string | if applicable | e.g., `fix/diagram-canvas-reload-loop-v1` |
| `project` | string | yes | Always `ProcessMap` |
| `category` | enum | yes | `project_atlas` \| `contour` \| `docs` \| `code` \| `runtime_evidence` |
| `date` | ISO | yes | Document creation or capture date |
| `mtime` | ISO | yes | File modification time |
| `verdict` | enum | if contour | `REVIEW_PASS` \| `CHANGES_REQUESTED` \| `REVIEW_BLOCKED` |
| `source_type` | enum | yes | `markdown` \| `python` \| `javascript` \| `json` \| `yaml` |
| `truth_level` | enum | yes | `canonical` \| `evidence` \| `draft` \| `deprecated` |
| `tags` | string[] | yes | e.g., `["diagram", "perf", "save", "regression"]` |
| `excluded_sensitive` | boolean | yes | Must be `false` |
| `excluded_sensitive_proof` | object | yes | Scanner evidence (see INDEXING_POLICY.md) |
| `language` | string | if code | `python`, `javascript`, `jsx` |
| `module` | string | if code | e.g., `backend.app.rag.search` |
| `risk_area` | string | if code | `diagram`, `save`, `session`, `bpmn_xml` |
| `lines_start` | int | if code | Start line in source file |
| `lines_end` | int | if code | End line in source file |

---

## 5. Retrieval Use Cases per Agent Role

### Agent 1 / Planner

| Query Intent | Expected Sources | Retrieval Boost |
|--------------|------------------|-----------------|
| Planning context from similar past contours | Contour PLAN.md, EXEC_REPORT.md | +boost same category/keyword |
| Architecture decisions | Atlas Architecture/, docs `*factpack*` | +boost `truth:canonical` |
| Forbidden changes list | AGENTS.md, ADR, contour STATE.json | +boost `truth:canonical` |
| Acceptance criteria patterns | Past PLAN.md `Acceptance Criteria` sections | +boost `REVIEW_PASS` |
| User preferences and hard rules | AGENTS.md, Decisions/ADR | +boost `truth:canonical` |

### Agent 2 / Executor

| Query Intent | Expected Sources | Retrieval Boost |
|--------------|------------------|-----------------|
| Source maps for files to touch | `SOURCE_MAP.md`, code export maps | +boost `type:code_map` |
| Prior fixes and known regressions | `REGRESSION_ROOT_CAUSE.md`, `EXEC_REPORT.md` | +boost `CHANGES_REQUESTED` |
| Test commands and runtime proof | `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md` | +boost `truth:evidence` |
| Rollback notes | `REWORK_REQUEST.md`, `REWORK_RESPONSE.md` | +boost `truth:evidence` |

### Agent 3 / Reviewer

| Query Intent | Expected Sources | Retrieval Boost |
|--------------|------------------|-----------------|
| User-visible scenario definitions | PLAN.md `Acceptance Criteria` | +boost `truth:canonical` |
| Previous user rejections | `CHANGES_REQUESTED`, `REWORK_REQUEST.md` | +boost `verdict:changes_requested` |
| Exact fail conditions | `REVIEW_REPORT.md`, `RUNTIME_PROOF_CHECKLIST.md` | +boost `truth:evidence` |
| Version proof requirements | `RUNTIME_NAVIGATION.md`, `VERSION_*_PROOF.md` | +boost `truth:evidence` |
| Metrics thresholds | `PERFORMANCE_AUDIT_REPORT.md`, `BASELINE_*.md` | +boost `type:audit` |

---

## 6. Read-Only Boundary Enforcement

### Allowed (RAG/RAK can return)

- Context snippets from indexed sources
- Suggestions (e.g., "prior fix in contour X used approach Y")
- Warnings (e.g., "this file had 3 regressions before")
- References to source truth (paths, contour ids, line numbers)
- Summaries of evidence

### Forbidden (RAG/RAK must NOT do)

- Auto-mutate code
- Auto-save files
- Write BPMN XML
- Apply Product Actions automatically
- Override human review verdict
- Index secrets
- Generate auto-mutation suggestions without human review
- Treat AI drafts as canonical truth

### Enforcement

- Agent prompts include explicit boundary text (see AGENT_INTEGRATION_PLAN.md)
- RAG API returns `suggestion` type only; no `action` type
- RAG context is logged but never auto-applied

---

## 7. Freshness / Update Workflow

### Trigger Events

1. **Contour completion**
   - EXEC_REPORT / REVIEW_REPORT mirrored to Project Atlas via `./tools/pm-agent-mirror-report.sh`
   - RAG update job picks up curated reports (not all raw files)
   - `CHANGES_REQUESTED` indexed as high-priority warning
   - `REVIEW_PASS` indexed as normal-priority evidence

2. **Code merge to `main`**
   - Incremental re-index of changed code files
   - Not on every WIP commit

3. **Manual refresh**
   - Admin can trigger full re-index via existing RAG admin page

### Freshness Rules

| Source Type | Max Age Before Stale Flag | Update Trigger |
|-------------|---------------------------|----------------|
| Contour reports | 30 days | contour completion mirror |
| Project Atlas notes | 30 days | sync pipeline |
| Code (key files) | 7 days | merge to main |
| Docs | 90 days | manual or doc update PR |
| Runtime evidence | 14 days | contour completion |

### Stale Handling

- Stale chunks are **not deleted**; they are down-ranked in retrieval
- `deprecated` truth_level chunks are always down-ranked
- Fresh chunks get `+recency_boost` in BM25 scoring

