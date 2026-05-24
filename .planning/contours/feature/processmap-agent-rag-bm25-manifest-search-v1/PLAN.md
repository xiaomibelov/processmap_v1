# feature/processmap-agent-rag-bm25-manifest-search-v1

## GSD Discipline

| Check | Result |
|-------|--------|
| `command -v gsd` | `/opt/processmap-test/bin/gsd` (found) |
| `command -v gsd-sdk` | `/opt/processmap-test/bin/gsd-sdk` (found) |
| `PROCESSMAP_GSD_WRAPPER_FOUND` | Yes |
| `CODEX_GSD_TOOLS_FOUND` | Yes |
| **GSD Mode** | `GSD_PROCESSMAP_WRAPPER_PLANNING` |

- Implementation code was NOT written by Agent 1.
- Product runtime files were NOT modified.
- Contour is bounded to BM25/lexical search tooling and docs.
- RAG remains read-only.
- Agent 2 / Agent 3 gates are prepared in this planning pack.

## Source / Runtime Truth

| Property | Value |
|----------|-------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `date -Is` | `2026-05-16T14:50:27+00:00` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --name-only` | 8 pre-existing frontend files (unrelated to this contour) |
| `git diff --stat` | 8 files changed, 55 insertions(+), 9 deletions(-) |
| `curl -s http://clearvestnic.ru:8088/health` | `{"ok":true,"status":"ok","redis":...}` |
| `curl -I http://clearvestnic.ru:5180` | HTTP/1.1 200 OK (nginx, no-cache) |

**Important:** The current branch `fix/lockfile-sync-test` contains 8 modified frontend files unrelated to this contour. Per AGENTS.md §3, this does NOT block this contour because no product runtime changes are planned. Agent 2 is forbidden from modifying product runtime files.

## Previous RAG Registry Source Truth

Previous contour: `feature/processmap-agent-rag-source-registry-and-index-policy-v1`
Status: `REVIEW_PASS`

What exists and is reused:

| Artifact | Path | Status |
|----------|------|--------|
| Source registry | `tools/rag/processmap-rag-sources.json` | 8 sources, 16 global excludes |
| Indexing policy | `docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md` | 9 sections, read-only boundary explicit |
| Secrets scanner | `tools/rag/pm-rag-scan-secrets.mjs` | 10 path rules + 10 content rules, fail-closed |
| Manifest builder | `tools/rag/pm-rag-build-manifest.mjs` | Produces JSON + MD, 18 metadata fields |
| Metadata schema | `tools/rag/processmap-rag-metadata-schema.json` | 18 fields, types, enums, conditional requirements |
| Classifier rules | `tools/rag/processmap-rag-classifier-rules.json` | 10 classes with heuristics |
| Policy validator | `tools/rag/pm-rag-validate-policy.mjs` | 27 checks, exit 0 on pass |
| Project Atlas mirrors | `/srv/obsidian/project-atlas/ProcessMap/RAG/` | 4 files created |

Known minor non-blocking issues from previous contour:
1. `scanner --path` fails with `ENOTDIR` on single-file input.
2. `manifest --limit 200` fills Project Atlas first (order-dependent cap).
3. Scanner false positives in test fixtures / policy docs (acceptable fail-closed).

## Problem Statement

Agents 1/2/3 need a working retrieval layer over the existing RAG manifest.

- No embeddings yet.
- No vector DB yet.
- No product runtime changes.
- No package installation.
- Read-only boundary must remain intact.

Goal: implement BM25-like lexical search with CLI tooling so agents can query the knowledge corpus and get ranked, snippet-rich results with metadata.

## Implementation Scope

### In Scope

1. **BM25 search index builder** — reads manifest, tokenizes, computes term stats, writes JSON index.
2. **Search CLI** — accepts query string, returns ranked top-k results with scores, snippets, metadata.
3. **Validation query runner** — runs 7 architecture validation queries, produces pass/fail report.
4. **Validation query fixture** — JSON/MD file with 7 queries + expected terms + pass criteria.
5. **Agent preflight usage docs** — examples for Agent 1/2/3 on how to query RAG before work.
6. **Project Atlas RAG docs** — mirror key findings to Obsidian.
7. **Minor fixes from previous contour** — fix `scanner --path ENOTDIR` if small and safe; document others.

### Out of Scope (Non-Goals)

- No full RAG server/API.
- No embeddings.
- No vector database.
- No external services.
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

## BM25 / Lexical Search Plan

### Index Builder

**Candidate path:** `tools/rag/pm-rag-build-search-index.mjs`

Responsibilities:
- Read manifest JSON from previous contour or regenerate via manifest builder.
- Read safe text content for each manifest entry.
- Skip excluded/sensitive files (reuse exclusions from registry).
- Chunk docs by heading (markdown) or by file (code) per architecture chunking strategy.
- Tokenize normalized terms:
  - lowercase;
  - split on non-alphanumeric Unicode (English + Russian letters/numbers);
  - remove very small stopwords if useful (English: `the`, `and`, `for`, `with`; Russian: `и`, `в`, `на`, `с`).
- Compute BM25-like statistics:
  - `tf` (term frequency per chunk);
  - `df` (document frequency per term across corpus);
  - `idf` (inverse document frequency);
  - `avgdl` (average chunk length in tokens);
  - chunk length normalization.
- Store index as JSON with metadata per chunk.
- Deterministic output (sorted keys, stable tokenization).

**BM25 parameters (suggested defaults):**
- `k1 = 1.2`
- `b = 0.75`

**Boosts (simple field boosts at query time):**
- exact contour id match: +3.0
- exact path match: +2.0
- exact title/heading match: +2.0
- verdict exact match (`REVIEW_PASS`, `CHANGES_REQUESTED`): +2.0
- source category match: +1.0
- role-based category boost (planner/reviewer/executor): +1.0
- recency (mtime within 30 days): +0.5

**Index output path options (Agent 2 decides, must document):**
- `.planning/contours/<CID>/RAG_SEARCH_INDEX_SAMPLE.json`
- `/tmp/processmap-rag/index/processmap-bm25-index.json`
- `tools/rag/.cache/processmap-bm25-index.json`

Preferred: do NOT store large generated index in product repo unless scoped in contour output/cache.

### Search Algorithm

1. Tokenize query using same tokenizer as index builder.
2. For each chunk in index:
   - Compute BM25 score for each query term.
   - Sum term scores.
   - Apply field/exact-match boosts.
3. Sort by score descending.
4. Return top-k.

## Search CLI Contract

**Candidate path:** `tools/rag/pm-rag-search.mjs`

CLI interface:

```bash
node tools/rag/pm-rag-search.mjs "<query>" [--top-k N] [--json] [--format md]
```

Examples:

```bash
node tools/rag/pm-rag-search.mjs "latest rules for Diagram REVIEW_PASS" --top-k 8
node tools/rag/pm-rag-search.mjs "perf diagram modeler drag hot path pointermove suppression" --top-k 10 --json
node tools/rag/pm-rag-search.mjs "current ProcessMap test runtime clearvestnic 5180" --top-k 5 --format md
```

**Flags:**
- `--top-k N` — number of results (default: 5)
- `--json` — output raw JSON array
- `--format md` — output markdown table + snippet blocks
- (default) — human-readable plain text with snippets

**Requirements:**
- No package install.
- Node built-ins only.
- Deterministic results (stable sort).
- Exit 0 on success, 1 on error, 2 on missing index.

## Search Result Format

Each result must include:

| Field | Description |
|-------|-------------|
| `rank` | 1-based rank |
| `score` | Final BM25+boost score (float) |
| `path` | Source file path |
| `title` | Document title or inferred heading |
| `source_id` | Source registry ID |
| `category` | Source category (`project_atlas`, `contour`, `docs`, `code`) |
| `document_class` | Classifier class (`source_truth`, `evidence`, `decision`, etc.) |
| `contour_id` | Detected contour id (if any) |
| `verdict` | `REVIEW_PASS`, `CHANGES_REQUESTED`, `REVIEW_BLOCKED` (if any) |
| `snippet` | Text around matched terms (400–800 chars max) |
| `matched_terms` | Array of query terms that matched |
| `boosts_applied` | Which boosts contributed (exact contour, title, verdict, etc.) |
| `date` / `mtime` | Document dates |
| `metadata_summary` | Key metadata (size_bytes, lines, language if code) |

**Snippet rules:**
- Max 400–800 chars per result.
- No secret values.
- Preserve Russian/English text.
- If content flagged sensitive, skip or redact.
- Highlight matched terms if feasible with plain-text markers (`*term*`).

## Validation Query Plan

**Fixture path:** `tools/rag/processmap-rag-validation-queries.json`

Queries (7 from architecture contour + optional bonus):

1. **Diagram REVIEW_PASS Rules**
   - Query: `"What are the latest rules for Diagram REVIEW_PASS?"`
   - Expected terms: `GSD reviewer discipline`, `real drag`, `version proof`, `no source-only pass`
   - Expected paths: recent Diagram drag/jank contour reports, architecture RAG plan, AGENTS.md

2. **Perf Contour History — Drag Hot Path**
   - Query: `"What happened in perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1?"`
   - Expected terms: `v1.0.129`, `metrics did not improve`, `React bundle ~95%`, `bpmn-js ~0.5%`, `perf/process-stage-baseline-jank-v1`
   - Expected paths: EXEC_REPORT.md, DRAG_HOT_PATH_ROOT_CAUSE.md, REWORK_REQUEST.md

3. **Current Diagram Lag Bottlenecks**
   - Query: `"What are current Diagram lag bottlenecks?"`
   - Expected terms: `React baseline jank`, `ProcessStage/App shell`, `drag unresolved`, `bpmn-js engine limit rejected`
   - Expected paths: BASELINE_REACT_JANK_PROFILE.md, PROFILER_EVIDENCE.md

4. **RAG Forbidden Actions**
   - Query: `"What is forbidden for RAG?"`
   - Expected terms: `no secrets`, `no auto-mutation`, `no BPMN XML writes`, `no Product Actions auto-apply`, `no AI drafts as truth`
   - Expected paths: PLAN.md (architecture), INDEXING_POLICY.md, AGENTS.md

5. **Indexed Source Paths**
   - Query: `"Which paths should be indexed?"`
   - Expected terms: `project-atlas`, `.planning/contours`, `docs`, `PROCESSMAP/HANDOFF`, `frontend/src`, `backend`, `exclusions`
   - Expected paths: SOURCE_INVENTORY.md, INDEXING_POLICY.md

6. **ProcessMap Test Runtime**
   - Query: `"What is current ProcessMap test runtime?"`
   - Expected terms: `clearvestnic.ru`, `/opt/processmap-test`, `:5180`, `:8088`, `version proof`
   - Expected paths: RUNTIME_NAVIGATION.md, RUNTIME_VERSION_PROOF.md

7. **Agent 3 Diagram Performance Review (Bonus)**
   - Query: `"How should Agent 3 review Diagram performance contours?"`
   - Expected terms: `GSD reviewer discipline`, `fresh 5180 proof`, `real user scenario`, `before/after metrics`, `CHANGES_REQUESTED`
   - Expected paths: REVIEW_REPORT.md, RUNTIME_PROOF_CHECKLIST.md

**Pass criteria:**
- Expected terms appear in top-k snippets.
- Expected path patterns appear in top-k results.
- No secret paths/content returned.
- Results are specific, not generic.

**Validation runner path:** `tools/rag/pm-rag-run-validation-queries.mjs`

Responsibilities:
- Read fixture JSON.
- Run each query against search CLI.
- Compare top results against expected terms/paths.
- Produce objective pass/fail.
- Write:
  - `.planning/contours/<CID>/RAG_SEARCH_VALIDATION_RESULTS.json`
  - `.planning/contours/<CID>/RAG_SEARCH_VALIDATION_RESULTS.md`

## Agent Preflight Usage Plan

Agent 1/2/3 should query RAG before work. Document usage in:

- `tools/rag/pm-rag-agent-preflight.mjs` (optional implementation)
- `.planning/contours/<CID>/AGENT_PREFLIGHT_USAGE.md`
- Project Atlas: `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Preflight Usage.md`

**Planner preflight example:**
```bash
node tools/rag/pm-rag-search.mjs \
  "contour category:perf keywords:diagram drag lag truth:canonical" \
  --top-k 5
```

**Executor preflight example:**
```bash
node tools/rag/pm-rag-search.mjs \
  "file:ProcessStage.jsx regression|test|proof" \
  --top-k 5
```

**Reviewer preflight example:**
```bash
node tools/rag/pm-rag-search.mjs \
  "contour:{contour_id} acceptance|criteria|fail|proof" \
  --top-k 5
```

If `pm-rag-agent-preflight.mjs` is too much for this contour, include as **next contour proposal** in IMPLEMENTATION_NOTES.

## Secrets / Exclusions Recheck

- Reuse `tools/rag/pm-rag-scan-secrets.mjs` before building index.
- Reuse registry global excludes (16 globs).
- Reuse manifest builder exclusion logic.
- Verify `.env`, keys, `node_modules`, `dist`, caches, `.agents`, `.playwright-mcp` are NOT in index.
- Search CLI must redact or skip any content flagged sensitive.
- Search output must never print secret values.

## Project Atlas Update Plan

Create or update:

| File | Purpose |
|------|---------|
| `/srv/obsidian/project-atlas/ProcessMap/RAG/BM25 Manifest Search.md` | Overview of BM25 search tooling, CLI usage, index path |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Search Validation Results.md` | Validation query results summary |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Preflight Usage.md` | Agent 1/2/3 preflight query patterns |

## Acceptance Criteria

Agent 3 should pass only if ALL of the following are true:

1. Search index builder exists and runs without error.
2. Search CLI exists and returns ranked results.
3. Validation query runner exists and runs 7+ queries.
4. Validation fixture exists with queries + expected terms + pass criteria.
5. Search reuses manifest/registry/policy from previous contour.
6. Search results include score, metadata, snippet for each hit.
7. At least 7 validation queries run with objective results.
8. Validation results are mostly pass; any failures documented with fix/next-contour plan.
9. Secrets scanner still passes (no new leaks).
10. Excluded files do not appear in search index or results.
11. No secret values printed in search output.
12. No product runtime file changes.
13. No backend/frontend app changes.
14. No package install.
15. No embeddings/vector DB.
16. No auto-mutation.
17. Project Atlas RAG docs updated.
18. Agent 1/2/3 preflight usage documented.
19. Tooling commands are repeatable.
20. Minor scanner `--path` ENOTDIR fixed OR documented why not.

## Non-Goals

See Implementation Scope / Out of Scope section above.

## Agent 2 Execution Plan

1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json.
2. Read previous RAG registry/policy reports.
3. Confirm source/runtime truth matches Agent 1 capture.
4. Implement `tools/rag/pm-rag-build-search-index.mjs`.
5. Implement `tools/rag/pm-rag-search.mjs`.
6. Implement `tools/rag/pm-rag-run-validation-queries.mjs`.
7. Create `tools/rag/processmap-rag-validation-queries.json`.
8. Optionally implement `tools/rag/pm-rag-agent-preflight.mjs`.
9. Reuse registry/policy/secrets scanner.
10. Run secrets scan before index build.
11. Build search index.
12. Run validation queries.
13. If safe and small: fix `scanner --path ENOTDIR`.
14. If safe and small: add `--sample-balanced` or `--per-source-limit` to manifest builder.
15. Document false positives behavior (no global weakening).
16. Create contour reports:
    - `EXEC_REPORT.md`
    - `SEARCH_INDEX_REPORT.md`
    - `SEARCH_CLI_REPORT.md`
    - `VALIDATION_QUERY_RESULTS.md`
    - `AGENT_PREFLIGHT_USAGE.md`
    - `SECRETS_AND_EXCLUSIONS_RECHECK.md`
    - `RUNTIME_BEHAVIOR_IMPACT.md`
    - `IMPLEMENTATION_NOTES.md`
17. Generate artifacts:
    - `RAG_SEARCH_INDEX_SAMPLE.json`
    - `RAG_SEARCH_INDEX_SAMPLE.md`
    - `RAG_SEARCH_VALIDATION_RESULTS.json`
    - `RAG_SEARCH_VALIDATION_RESULTS.md`
18. Update Project Atlas RAG docs.
19. Create `READY_FOR_REVIEW` marker.
20. If blocked, create `EXEC_BLOCKED.md` and do NOT create `READY_FOR_REVIEW`.

## Agent 3 Review Plan

1. Run Reviewer GSD Discipline (commands, mode, source truth).
2. Read all Agent 2 reports.
3. Inspect changed/created files.
4. Run validation commands independently:
   - `node tools/rag/pm-rag-validate-policy.mjs`
   - `node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json`
   - `node tools/rag/pm-rag-build-search-index.mjs ...`
   - `node tools/rag/pm-rag-search.mjs ...`
   - `node tools/rag/pm-rag-run-validation-queries.mjs ...`
5. Manually run at least these searches:
   - `"What are the latest rules for Diagram REVIEW_PASS?"`
   - `"What happened in perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1?"`
   - `"What is forbidden for RAG?"`
6. Verify search results include specific paths, snippets, metadata.
7. Verify excluded paths are NOT in index/search results:
   - `.env`, keys, `node_modules`, `dist`, build/cache, `.agents`, `.playwright-mcp`
8. Verify no secret values printed.
9. Verify no product runtime files changed.
10. Verify no embeddings/vector DB/package install.
11. Create `REVIEW_REPORT.md`.
12. If pass: `REVIEW_PASS`.
13. If fail: `CHANGES_REQUESTED` + `REWORK_REQUEST.md` with specific fixes.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| BM25 without embeddings misses semantic matches | Medium | Validation-driven; acceptable for first retrieval layer; embeddings planned for future contour |
| Index JSON grows large (800+ files) | Low | Store outside repo or in contour output; use sample mode for quick runs |
| Tokenization of Russian text incomplete | Medium | Use Unicode word regex; test with Russian queries; document limitations |
| Query-time performance slow on large corpus | Low | JSON index in memory is acceptable for CLI tooling (< 1s target for 1000 docs) |
| False positives in snippets from test/policy docs | Low | Fail-closed scanner; redaction in snippet renderer; do not weaken globally |
| Single-file scanner fix introduces regression | Low | If fix is not trivial, defer to next contour with explicit documentation |

## Gates

- [x] **Gate 1** — Agent 1 GSD discipline completed
- [x] **Gate 2** — Previous RAG registry/policy contour reviewed
- [x] **Gate 3** — Source/runtime truth captured
- [x] **Gate 4** — BM25/search implementation scope defined
- [x] **Gate 5** — Manifest/chunk source truth defined
- [x] **Gate 6** — No-secrets/no-mutation boundaries defined
- [x] **Gate 7** — Search CLI contract defined
- [x] **Gate 8** — Validation queries defined
- [x] **Gate 9** — Agent 1/2/3 preflight usage defined
- [x] **Gate 10** — No product runtime changes locked
- [x] **Gate 11** — Agent 2 executor prompt ready
- [x] **Gate 12** — Agent 3 reviewer prompt with GSD ready
- [x] **Gate 13** — READY_FOR_EXECUTION marker created (final step)
