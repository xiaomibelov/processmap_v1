# EXECUTOR_PROMPT — Agent 2 / Executor

**Contour:** `feature/processmap-agent-rag-coverage-and-validation-hardening-v1`
**Run ID:** `20260516T151430Z-2767`
**Agent:** Agent 2 / Executor

---

## Pre-Flight Checklist

Before writing any code:

1. Read `PLAN.md` in this contour directory.
2. Read `RUNTIME_NAVIGATION.md` and `RUNTIME_PROOF_CHECKLIST.md`.
3. Read `STATE.json`.
4. Read previous RAG BM25 reports:
   - `.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEW_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/EXEC_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/VALIDATION_QUERY_RESULTS.md`
   - `.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/SEARCH_INDEX_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/SEARCH_CLI_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/SECRETS_AND_EXCLUSIONS_RECHECK.md`
   - `.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/IMPLEMENTATION_NOTES.md`
5. Confirm source/runtime truth matches Agent 1 capture.
6. Reproduce previous 3/7 validation baseline using existing tooling.

## Source / Runtime Truth

| Property | Value |
|----------|-------|
| `pwd` | `/opt/processmap-test` |
| `hostname` | `clearvestnic.ru` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `curl -s http://clearvestnic.ru:8088/health` | `{"ok":true,...}` |
| `curl -I http://clearvestnic.ru:5180` | HTTP/1.1 200 OK |

**CRITICAL:** Do NOT modify the 8 pre-existing frontend files. They are unrelated to this contour.

## Implementation Tasks

### Task 1 — Source-Balanced Manifest / Index Mode

Implement in `tools/rag/pm-rag-build-manifest.mjs`:

- Add `--source-balanced` flag: distribute `--limit` evenly across sources, then fill remaining by `indexing_priority`.
- Add `--per-source-limit N` flag: hard cap per source.
- Add `--min-per-source N` flag: guarantee minimum inclusion per source.
- Add `--full` flag: no cap; include all allowed files.

If modifying the existing manifest builder is risky, create a wrapper script `tools/rag/pm-rag-build-manifest-balanced.mjs` that post-processes the manifest.

Behavior requirements:
- Each of the 8 sources in `processmap-rag-sources.json` must contribute files to the manifest.
- `project-atlas` must NOT dominate the cap.
- `planning-contours` must include recent Diagram/perf contours.
- `docs-curated`, `handoff-notes`, `frontend-src`, `backend-src`, `tools-src`, `scripts-src` must all have representation.

### Task 2 — Coverage Report

Generate `RAG_COVERAGE_REPORT.json` and `.md` inside the contour directory.

Required fields per source:
- `source_id`, `source_category`, `files_total`, `files_included`, `files_skipped`, `files_sensitive`, `chunks`, `avg_chunk_tokens`
- `top_contour_ids` (array of top 5)
- `latest_contours` (array of top 5 by mtime)
- `class_distribution` (object: class → count)

### Task 3 — Ranking / Boost Improvements

Modify `tools/rag/pm-rag-search.mjs`:

Add or improve boosts:
1. Exact contour id match: +3.0 (ensure triggers on metadata and path tokens).
2. Path / filename match: +1.5 when query term matches basename or directory name.
3. Heading/title match: +2.0 (was +2.0, verify it works).
4. Verdict/status match: +1.5 for `REVIEW_PASS`, `CHANGES_REQUESTED`, `REWORK_REQUEST` when query implies review status.
5. Recent contour boost: +1.0 for mtime < 14 days; +0.5 for < 30 days.
6. Document class boost: +1.0 for `REVIEW_REPORT`, `EXEC_REPORT`, `CHANGES_REQUESTED`, `REWORK_REQUEST` when query terms match.
7. Source category boost by role:
   - If query contains "plan" or "architecture" → boost `project_atlas` +1.0, `contour` +0.5.
   - If query contains "review" or "pass" or "fail" → boost `contour` +1.0, `project_atlas` +0.5.
   - If query contains "runtime" or "proof" or "deploy" → boost `docs` +1.0, `contour` +0.5.
   - If query contains "code" or "bug" or "fix" → boost `code` +1.0.
8. Maximum total boost cap: +8.0.
9. Add `why_matched` array to each search result.

### Task 4 — Validation Fixture Hardening

Update `tools/rag/processmap-rag-validation-queries.json`:

- Add `query_type` to each query.
- Refine `expected_terms` to be precise (see PLAN.md for suggestions).
- Refine `expected_path_patterns` to match actual files in the new balanced manifest.
- Add `failure_explanation` template fields.

### Task 5 — Validation Runner Accuracy

Update `tools/rag/pm-rag-run-validation-queries.mjs`:

- Compute `pass_count` and `fail_count` from per-query `status` fields.
- Write `RAG_SEARCH_VALIDATION_RESULTS.json` with computed summary.
- Ensure `EXEC_REPORT.md` quotes the exact computed numbers.
- No manual count overrides.

### Task 6 — Search Output Quality

Improve `tools/rag/pm-rag-search.mjs` output:

- Heading-aware snippets: center snippet around matched heading if possible.
- Contour-aware snippets: include contour ID in snippet context.
- Term highlighting: continue using `*term*` markers.
- Include verdict/status in output.
- Include source class.
- Include `why_matched` array.

### Task 7 — Secrets / Exclusions Recheck

Run before every index build:

```bash
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json
```

Verify excluded paths are absent from manifest and index.

### Task 8 — Validation Re-Run

After all improvements, run:

```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8 --manifest .planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_MANIFEST_BALANCED.json
```

Target: 7/7 pass. Minimum: 6/7 with exact reason.

If < 6/7, iterate. Document each iteration attempt in `IMPLEMENTATION_NOTES.md`.

## Boundaries (HARD — Do NOT Cross)

| Boundary | Rule |
|----------|------|
| Product runtime | NO changes to `frontend/src/` product code, `backend/app/` API code, `.env`, schema, storage |
| Frontend UI | NO UI component changes, NO CSS changes, NO public asset changes |
| Backend API | NO router changes, NO model changes, NO migration changes |
| Package install | NO `npm install`, NO `pip install`, NO new dependencies |
| Embeddings | NO embedding generation, NO vector DB, NO external AI services |
| Auto-mutation | NO automatic file writes outside RAG tooling output directories |
| BPMN XML | NO mutation of BPMN XML files |
| Product Actions | NO auto-apply of product actions |
| Secrets | NO indexing secrets, NO printing secrets |
| AI drafts | NO treating AI-generated content as canonical truth |
| MCP repair | Do NOT run MCP repair |
| Deploy | NO stage/prod deploy |
| Commit/PR | NO git commit, push, or PR from this session |

## Required Outputs

Inside contour folder, create:

- `EXEC_REPORT.md`
- `COVERAGE_HARDENING_REPORT.md`
- `SOURCE_BALANCED_MANIFEST_REPORT.md`
- `SEARCH_RANKING_IMPROVEMENTS.md`
- `VALIDATION_HARDENING_RESULTS.md`
- `VALIDATION_QUERY_RESULTS.md`
- `SECRETS_AND_EXCLUSIONS_RECHECK.md`
- `RUNTIME_BEHAVIOR_IMPACT.md`
- `IMPLEMENTATION_NOTES.md`
- `READY_FOR_REVIEW`

Generated artifacts:

- `RAG_MANIFEST_BALANCED.json`
- `RAG_MANIFEST_BALANCED.md`
- `RAG_SEARCH_INDEX_BALANCED.json`
- `RAG_SEARCH_INDEX_BALANCED.md`
- `RAG_SEARCH_VALIDATION_RESULTS.json`
- `RAG_SEARCH_VALIDATION_RESULTS.md`
- `RAG_COVERAGE_REPORT.json`
- `RAG_COVERAGE_REPORT.md`

If blocked:
- `EXEC_BLOCKED.md`
- NO `READY_FOR_REVIEW`.

## Project Atlas Updates

Create or update:

- `/srv/obsidian/project-atlas/ProcessMap/RAG/Coverage and Validation Hardening.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Search Validation Results.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/BM25 Manifest Search.md` (if behavior changed)

## Iteration Guidance

If first attempt yields < 6/7:

1. Check coverage report: are the expected files present in manifest?
2. Check search results manually: do the right files rank in top-k?
3. Adjust boosts incrementally (+/- 0.5 at a time).
4. Adjust expected_terms/path_patterns in fixture if they were overly optimistic.
5. Document every adjustment and its effect.
6. Do not overfit: boosts must remain general enough for arbitrary queries.

## Final Verification

Before creating `READY_FOR_REVIEW`:

- [ ] Source-balanced manifest includes files from all 8 sources.
- [ ] Coverage report generated and non-empty.
- [ ] All 7 validation queries run.
- [ ] Pass rate ≥ 6/7 (target 7/7).
- [ ] Computed pass/fail count matches JSON and report.
- [ ] Secrets scan passes (or findings documented as false positives).
- [ ] Excluded paths absent from manifest/index.
- [ ] No secret values in search output.
- [ ] No product runtime files changed.
- [ ] Project Atlas updated.
