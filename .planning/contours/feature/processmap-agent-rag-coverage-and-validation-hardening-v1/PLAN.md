# feature/processmap-agent-rag-coverage-and-validation-hardening-v1

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
- Contour is bounded to RAG tooling/docs hardening only.
- RAG remains read-only.
- Agent 2 / Agent 3 gates are prepared in this planning pack.

## Source / Runtime Truth

| Property | Value |
|----------|-------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `date -Is` | `2026-05-16T15:16:41+00:00` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --name-only` | 8 pre-existing frontend files (unrelated to this contour) |
| `git diff --stat` | 8 files changed, 55 insertions(+), 9 deletions(-) |
| `curl -s http://clearvestnic.ru:8088/health` | `{"ok":true,"status":"ok","redis":...}` |
| `curl -I http://clearvestnic.ru:5180` | HTTP/1.1 200 OK (nginx, no-cache) |

**Important:** The current branch `fix/lockfile-sync-test` contains 8 modified frontend files unrelated to this contour. Per AGENTS.md §3, this does NOT block this contour because no product runtime changes are planned. Agent 2 is forbidden from modifying product runtime files.

## Previous BM25 Search Source Truth

Previous contour: `feature/processmap-agent-rag-bm25-manifest-search-v1`
Status: `REVIEW_PASS`

What exists and is reused:

| Artifact | Path | Status |
|----------|------|--------|
| Source registry | `tools/rag/processmap-rag-sources.json` | 8 sources, 16 global excludes |
| Indexing policy | `docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md` | 9 sections, read-only boundary explicit |
| Secrets scanner | `tools/rag/pm-rag-scan-secrets.mjs` | 10 path rules + 10 content rules, fail-closed |
| Manifest builder | `tools/rag/pm-rag-build-manifest.mjs` | Produces JSON + MD, 18 metadata fields |
| Search index builder | `tools/rag/pm-rag-build-search-index.mjs` | 329 lines, BM25 + chunking |
| Search CLI | `tools/rag/pm-rag-search.mjs` | 297 lines, plain/JSON/MD output |
| Validation runner | `tools/rag/pm-rag-run-validation-queries.mjs` | 226 lines, spawns search CLI |
| Validation fixture | `tools/rag/processmap-rag-validation-queries.json` | 7 queries + criteria |
| Policy validator | `tools/rag/pm-rag-validate-policy.mjs` | 27 checks, exit 0 on pass |
| Project Atlas mirrors | `/srv/obsidian/project-atlas/ProcessMap/RAG/` | 7 files exist |

Known blocking issues from previous contour (must be fixed in this contour):
1. **Validation pass rate 3/7** — below acceptable threshold for agent preflight integration.
2. **500-file sample bias** — Project Atlas fills the cap first; contour reports, docs, and code are under-represented.
3. **Agent 2 reporting discrepancy** — EXEC_REPORT claims "4 pass, 3 fail"; actual is 3 pass, 4 fail.
4. **Generic query ranking** — q4 ("What is forbidden for RAG?") and q5 ("Which paths should be indexed?") lose to executor prompts containing generic terms.
5. **Missing coverage report** — no per-source inclusion counts exist.
6. **Agent preflight helper** — `pm-rag-agent-preflight.mjs` deferred; remains deferred until validation hardening passes.

## Problem Statement

Agents 1/2/3 need a retrieval layer reliable enough for preflight integration.

Current state:
- BM25 lexical search works but is limited by sample bias and generic-query competition.
- 3/7 validation queries pass.
- Agent 2 cannot claim 4/7 when actual is 3/7.
- Source-balanced coverage does not exist.

Goal: improve coverage, ranking, validation accuracy, and reporting consistency so pass rate reaches ≥6/7 before any preflight integration.

## Implementation Scope

### In Scope

1. **Source-balanced manifest / index mode** — remove 500-file sample bias; implement `--source-balanced`, `--per-source-limit N`, `--min-per-source N`, or `--full` mode.
2. **Coverage report** — per-source/category/class file counts, included/skipped stats, top contour IDs, latest contours.
3. **Ranking / boost improvements** — exact contour id, path/filename, verdict/status, recent contour, REVIEW_REPORT/CHANGES_REQUESTED/REWORK_REQUEST, source category, role-specific boosts.
4. **Validation fixture hardening** — precise expected terms, path patterns, top-k thresholds, query types, failure explanation fields.
5. **Validation runner accuracy** — pass/fail count computed from JSON results; EXEC_REPORT reads computed summary; no manual mismatch.
6. **Search output quality** — heading-aware snippets, contour-aware snippets, term highlighting, verdict/status inclusion, source class, why-matched reasoning.
7. **Optional full manifest mode** — if safe, support full manifest/index build over allowed sources.
8. **Project Atlas RAG docs** — update coverage, validation, and search docs.

### Out of Scope (Non-Goals)

- No full RAG server/API yet.
- No Agent 1/2/3 mandatory integration yet.
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

## Source-Balanced Coverage Plan

### Problem

Current manifest builder uses order-dependent `--limit 500`. Sources are processed in registry order:
1. `project-atlas` (727 files) → fills most/all of the cap.
2. `planning-contours` (40 contours, many files) → partially or fully excluded.
3. `docs-curated`, `handoff-notes`, `frontend-src`, `backend-src`, `tools-src`, `scripts-src` → rarely included.

This causes:
- q2 (perf contour history) to fail because contour reports are not in sample.
- q4/q5 (policy/path queries) to fail because registry/policy docs compete with generic executor prompts.
- q6 (runtime query) to fail because RUNTIME_NAVIGATION/PROOF files are drowned by prompts.

### Solution Options (Agent 2 chooses, must document)

**Option A: `--source-balanced`**
- Compute per-source quota = limit / number_of_sources.
- Fill each source up to quota.
- Remaining slots distributed by `indexing_priority`.

**Option B: `--per-source-limit N`**
- Hard cap per source.
- Example: `--per-source-limit 80` × 8 sources = 640 files.

**Option C: `--min-per-source N`**
- Guarantee at least N files per source.
- Remaining slots filled by priority.

**Option D: `--full`**
- No cap; index all allowed files from all sources.
- Index may be large (~100+ MB). Must be stored in contour output or `/tmp`, not in product repo.
- Preferred if runtime/memory allows.

**Recommended:** Try Option D (`--full`) first. If index size or build time is prohibitive (>30s, >200MB), fall back to Option A (`--source-balanced`).

### Coverage Report Requirements

Generate `RAG_COVERAGE_REPORT.json` and `.md` with:

| Field | Description |
|-------|-------------|
| `source_id` | Registry source ID |
| `source_category` | project_atlas / contour / docs / code |
| `files_total` | Total files found by glob |
| `files_included` | Files added to manifest |
| `files_skipped` | Files excluded by glob/rule |
| `files_sensitive` | Files flagged by secrets scanner |
| `chunks` | Total chunks produced |
| `avg_chunk_tokens` | Average tokens per chunk |
| `top_contour_ids` | Most frequent contour IDs in source |
| `latest_contours` | Contours with most recent mtime |
| `class_distribution` | Count per document class |

## Ranking / Boost Hardening Plan

### Current Boosts (baseline)
- Exact contour id match: +3.0
- Exact path match: +2.0
- Exact title/heading match: +2.0
- Verdict exact match: +2.0
- Source category match: +1.0
- Recency (mtime < 30 days): +0.5

### Required Improvements

1. **Exact contour id boost** — keep +3.0; ensure it triggers on both `contour_id` metadata and path tokens.
2. **Path / filename boost** — boost when query term matches file basename or directory name (+1.5).
3. **Verdict / status boost** — boost `REVIEW_PASS`, `CHANGES_REQUESTED`, `REWORK_REQUEST`, `EXEC_BLOCKED` when query implies review/execution status (+1.5).
4. **Recent contour boost** — boost files modified within last 14 days (+1.0); within 30 days (+0.5). Use mtime from manifest.
5. **REVIEW_REPORT / CHANGES_REQUESTED / REWORK_REQUEST boost** — when query contains "review", "pass", "fail", "changes", boost documents with these classes/verdicts (+1.0).
6. **User rejection / runtime proof / reviewer GSD terms boost** — when query contains "runtime", "proof", "gsd", boost `source_truth`, `evidence`, `decision` classes (+1.0).
7. **Source category boost by role/use case**:
   - Planner queries → boost `project_atlas`, `contour` (plans, decisions).
   - Executor queries → boost `contour` (EXEC_REPORT), `code`.
   - Reviewer queries → boost `contour` (REVIEW_REPORT), `project_atlas` (policies).
   - Policy queries → boost `docs`, `project_atlas`.
8. **Heading-aware boost** — when query term appears in chunk heading/title, boost higher than body match (+2.0).
9. **Why-matched field** — search output should include `why_matched` array: `['exact_contour_id', 'heading_match', 'verdict_boost', 'recent_file']`.

### Boost Application Rules
- All boosts are additive.
- Maximum total boost cap: +8.0 (to prevent any single factor from overwhelming BM25).
- Boosts applied at query time, not index time (keeps index reusable).

## Validation Query Hardening Plan

### Fixture Updates

Update `tools/rag/processmap-rag-validation-queries.json`:

1. **Add `query_type`** to each query:
   - `contour_lookup` (q1, q2, q3, q7)
   - `policy_lookup` (q4, q5)
   - `runtime_lookup` (q6)
   - `review_rules` (q1, q7)
   - `current_bottleneck` (q3)

2. **Refine expected_terms** to be more precise and less generic:
   - q1: add `diagram`, `reviewer`, `discipline`, `real`, `drag`, `version`, `proof`, `source`, `pass`
   - q2: add `v1.0.129`, `react`, `bundle`, `95`, `bpmn`, `0.5`, `baseline`, `jank`
   - q3: add `react`, `baseline`, `jank`, `processstage`, `app`, `shell`, `unresolved`
   - q4: add `secrets`, `auto`, `mutation`, `bpmn`, `xml`, `product`, `actions`, `drafts`, `truth`
   - q5: add `project-atlas`, `.planning/contours`, `docs`, `handoff`, `frontend`, `backend`, `exclusions`
   - q6: add `clearvestnic`, `opt`, `processmap`, `test`, `5180`, `8088`, `version`, `proof`
   - q7: add `gsd`, `reviewer`, `discipline`, `fresh`, `5180`, `proof`, `real`, `user`, `scenario`, `metrics`

3. **Refine expected_path_patterns** to match actual file naming conventions:
   - Use exact or glob patterns that exist in the manifest.
   - Remove patterns that are unlikely to match (e.g., overly broad `*perf*`).

4. **Add `failure_explanation` field** (empty string for pass; filled by runner on fail):
   - `missing_terms: [...]`
   - `missing_paths: [...]`
   - `root_cause_hint: "..."`

### Runner Accuracy Fix

Update `tools/rag/pm-rag-run-validation-queries.mjs`:

1. Compute pass/fail by iterating over JSON results programmatically.
2. Write `RAG_SEARCH_VALIDATION_RESULTS.json` with machine-readable per-query results.
3. Compute summary counts from the JSON, not from manual constants.
4. `EXEC_REPORT.md` must reference the computed summary (e.g., "Validation pass rate: X/Y as computed by validation runner").
5. No manual override of counts allowed.

### Target Thresholds

| Query | Current | Target | Minimum |
|-------|---------|--------|---------|
| q1 | PASS | PASS | PASS |
| q2 | FAIL | PASS | PASS |
| q3 | PASS | PASS | PASS |
| q4 | FAIL | PASS | PASS |
| q5 | FAIL | PASS | PASS |
| q6 | FAIL | PASS | PASS |
| q7 | PASS | PASS | PASS |

**Overall target: 7/7 pass.**
**Minimum acceptable: 6/7 with exact documented reason for remaining failure and concrete next fix.**
**If still 3/7 or 4/7: no REVIEW_PASS.**

## Reporting Consistency Plan

### Discrepancy Fix

Previous contour discrepancy:
- Agent 2 EXEC_REPORT: "4 pass, 3 fail"
- Agent 3 REVIEW_REPORT: "3 pass, 4 fail"
- Actual JSON results: 3 pass, 4 fail

Fix:
1. Validation runner must write `RAG_SEARCH_VALIDATION_RESULTS.json` with `summary.pass_count` and `summary.fail_count` computed from per-query `status` fields.
2. `EXEC_REPORT.md` must quote the exact computed numbers.
3. Agent 3 must recompute independently and verify the numbers match.
4. If any discrepancy is found, it is treated as a bug in the runner or report template and must be fixed.

### Required Reports

Agent 2 must create:
- `EXEC_REPORT.md` — summary with computed validation counts.
- `COVERAGE_HARDENING_REPORT.md` — source-balanced implementation details.
- `SOURCE_BALANCED_MANIFEST_REPORT.md` — manifest build behavior and per-source stats.
- `SEARCH_RANKING_IMPROVEMENTS.md` — boost changes and observed effects.
- `VALIDATION_HARDENING_RESULTS.md` — fixture changes and rationale.
- `VALIDATION_QUERY_RESULTS.md` — per-query analysis.
- `SECRETS_AND_EXCLUSIONS_RECHECK.md` — scan results and exclusion verification.
- `RUNTIME_BEHAVIOR_IMPACT.md` — confirmation of no product runtime changes.
- `IMPLEMENTATION_NOTES.md` — technical decisions, deviations, next contours.

## Secrets / Exclusions Recheck

- Reuse `tools/rag/pm-rag-scan-secrets.mjs` before building index.
- Reuse registry global excludes (16 globs).
- Reuse manifest builder exclusion logic.
- Verify `.env`, keys, `node_modules`, `dist`, caches, `.agents`, `.playwright-mcp` are NOT in manifest/index.
- Search CLI must redact or skip any content flagged sensitive.
- Search output must never print secret values.
- If new false positives appear, document them; do not weaken scanner globally.

## Project Atlas Update Plan

Create or update:

| File | Purpose |
|------|---------|
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Coverage and Validation Hardening.md` | Overview of source-balanced manifest, coverage report, ranking improvements |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/Search Validation Results.md` | Updated validation results for this contour |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/BM25 Manifest Search.md` | Update if search CLI or indexing behavior changed |

## Acceptance Criteria

Agent 3 should pass only if ALL of the following are true:

1. Source-balanced manifest/index mode exists or equivalent full coverage exists.
2. Coverage report exists with counts by source/category/class.
3. Validation runner executes all 7 queries.
4. Validation pass rate is at least 6/7.
5. 7/7 attempted and failures are specific.
6. If only 6/7, remaining failure has precise root cause + next fix.
7. Search results include ranked score/metadata/snippet/why-matched.
8. Exact contour ID lookup improves.
9. Latest Diagram lag/bottleneck queries return recent relevant contours.
10. RAG forbidden behavior query returns policy/exclusion docs.
11. Runtime query returns clearvestnic.ru / 5180 / 8088 info.
12. Agent 3 review query returns reviewer GSD + real drag/fresh runtime proof rules.
13. Secrets scanner still passes or findings are false positives documented.
14. Excluded files do not appear in manifest/index/search.
15. No secret values printed.
16. No product runtime changes.
17. No backend/frontend app changes.
18. No package install.
19. No embeddings/vector DB.
20. No auto-mutation.
21. Project Atlas RAG docs updated.
22. Reporting discrepancy fixed: computed validation summary matches reports.
23. Tooling commands are repeatable.

No REVIEW_PASS if:
- validation remains 3/7 or 4/7;
- source coverage remains biased;
- results are generic;
- secrets/exclusions weakened;
- runtime files changed out of scope.

## Non-Goals

See Implementation Scope / Out of Scope section above.

## Agent 2 Execution Plan

1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json.
2. Read previous RAG BM25 reports (REVIEW_REPORT, EXEC_REPORT, VALIDATION_QUERY_RESULTS, SEARCH_INDEX_REPORT, SEARCH_CLI_REPORT, SECRETS_AND_EXCLUSIONS_RECHECK, IMPLEMENTATION_NOTES).
3. Confirm source/runtime truth matches Agent 1 capture.
4. Reproduce previous 3/7 validation baseline using existing tooling.
5. Implement source-balanced or full manifest mode in `tools/rag/pm-rag-build-manifest.mjs`.
6. Implement coverage report generation in manifest builder or a new script.
7. Improve ranking/boosts in `tools/rag/pm-rag-search.mjs`.
8. Harden validation fixture in `tools/rag/processmap-rag-validation-queries.json`.
9. Fix validation runner accuracy in `tools/rag/pm-rag-run-validation-queries.mjs`.
10. Re-run secrets scan before index build.
11. Build source-balanced or full search index.
12. Run all 7 validation queries.
13. Verify computed pass/fail count matches JSON and report.
14. If pass rate < 6/7, iterate on boosts/fixtures/coverage; document attempts.
15. Document false positives behavior (no global weakening).
16. Create contour reports:
    - `EXEC_REPORT.md`
    - `COVERAGE_HARDENING_REPORT.md`
    - `SOURCE_BALANCED_MANIFEST_REPORT.md`
    - `SEARCH_RANKING_IMPROVEMENTS.md`
    - `VALIDATION_HARDENING_RESULTS.md`
    - `VALIDATION_QUERY_RESULTS.md`
    - `SECRETS_AND_EXCLUSIONS_RECHECK.md`
    - `RUNTIME_BEHAVIOR_IMPACT.md`
    - `IMPLEMENTATION_NOTES.md`
17. Generate artifacts:
    - `RAG_MANIFEST_BALANCED.json`
    - `RAG_MANIFEST_BALANCED.md`
    - `RAG_SEARCH_INDEX_BALANCED.json`
    - `RAG_SEARCH_INDEX_BALANCED.md`
    - `RAG_SEARCH_VALIDATION_RESULTS.json`
    - `RAG_SEARCH_VALIDATION_RESULTS.md`
    - `RAG_COVERAGE_REPORT.json`
    - `RAG_COVERAGE_REPORT.md`
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
   - `node tools/rag/pm-rag-build-manifest.mjs ...`
   - `node tools/rag/pm-rag-build-search-index.mjs ...`
   - `node tools/rag/pm-rag-search.mjs ...`
   - `node tools/rag/pm-rag-run-validation-queries.mjs ...`
5. Independently run at least these searches:
   - `"What are the latest rules for Diagram REVIEW_PASS?"`
   - `"What happened in perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1?"`
   - `"What are current Diagram lag bottlenecks?"`
   - `"What is forbidden for RAG?"`
   - `"What is current ProcessMap test runtime?"`
6. Verify search results include specific paths/snippets/metadata/why-matched.
7. Verify validation pass count is computed and consistent across JSON/EXEC_REPORT/REVIEW_REPORT.
8. Verify source-balanced coverage (check coverage report; grep manifest for each source id).
9. Verify excluded paths are NOT in index/search results:
   - `.env`, keys, `node_modules`, `dist`, build/cache, `.agents`, `.playwright-mcp`
10. Verify no secret values printed.
11. Verify no product runtime files changed.
12. Verify no embeddings/vector DB/package install.
13. Create `REVIEW_REPORT.md`.
14. If pass: `REVIEW_PASS`.
15. If fail: `CHANGES_REQUESTED` + `REWORK_REQUEST.md` with specific fixes.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Full manifest index too large (>200 MB) | Medium | Store in contour output or `/tmp`; fall back to source-balanced mode |
| BM25 without embeddings still misses semantic matches | Medium | Validation-driven; lexical improvements may not solve all paraphrasing |
| Source-balanced algorithm introduces unexpected exclusions | Low | Coverage report verifies inclusion; manual spot-checks |
| Boost tuning overfits to validation queries | Medium | Keep boosts general (field/domain based); document tuning rationale |
| Tokenization of Russian text incomplete | Low | Use Unicode word regex; test with Russian queries; document limitations |
| Query-time performance slow on large corpus | Low | JSON index in memory is acceptable for CLI tooling (< 3s target for full corpus) |
| False positives in snippets from test/policy docs | Low | Fail-closed scanner; redaction in snippet renderer; do not weaken globally |

## Gates

- [x] **Gate 1** — Agent 1 GSD discipline completed
- [x] **Gate 2** — Previous BM25 contour reviewed
- [x] **Gate 3** — Source/runtime truth captured
- [x] **Gate 4** — Validation failures understood
- [x] **Gate 5** — Source-balanced coverage plan defined
- [x] **Gate 6** — Validation hardening plan defined
- [x] **Gate 7** — Ranking/boost plan defined
- [x] **Gate 8** — Reporting-discrepancy fix plan defined
- [x] **Gate 9** — No-secrets/no-mutation boundaries defined
- [x] **Gate 10** — No product runtime changes locked
- [x] **Gate 11** — Agent 2 executor prompt ready
- [x] **Gate 12** — Agent 3 reviewer prompt with GSD ready
- [x] **Gate 13** — READY_FOR_EXECUTION marker created (final step)
