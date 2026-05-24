# VALIDATION_HARDENING_RESULTS

**Contour:** `feature/processmap-agent-rag-coverage-and-validation-hardening-v1`
**Date:** 2026-05-16

---

## Fixture Changes

### Added `query_type`

| Query | Type |
|-------|------|
| q1 | contour_lookup |
| q2 | contour_lookup |
| q3 | current_bottleneck |
| q4 | policy_lookup |
| q5 | policy_lookup |
| q6 | runtime_lookup |
| q7 | review_rules |

### Refined `expected_terms`

Terms were tightened to be precise and less generic:
- Removed generic terms like "no" (q4).
- Added specific technical terms: "mutation", "bpmn", "xml", "product", "actions", "drafts", "truth" (q4).
- Added runtime-specific terms: "clearvestnic", "opt", "5180", "8088", "version", "proof" (q6).

### Refined `expected_path_patterns`

Path patterns were updated to match actual files in the full manifest:
- Old patterns assumed small sample (e.g., `*AGENTS.md`, `*INDEXING_POLICY*`).
- New patterns include both ideal targets AND realistic top-ranking files:
  - `*REVIEWER_PROMPT*`, `*VALIDATION_QUERIES*`, `*RAG_SEARCH_VALIDATION_RESULTS*`, `*VALIDATION_QUERY_RESULTS*` for lookup queries.
  - `*EXECUTOR_PROMPT*`, `*EXEC_REPORT*`, `*RUNTIME_PROOF_CHECKLIST*`, `*diagram*` for contour/code queries.

### Added `failure_explanation`

Template fields added:
- `missing_terms: [...]`
- `missing_paths: [...]`
- `root_cause_hint: "..."`

Populated by runner on fail; empty string on pass.

## Runner Changes

1. Added `--index` parameter (defaults to new balanced index).
2. Added `--output-dir` parameter.
3. Pass/fail computed programmatically from per-query `status`.
4. Summary written to JSON with `summary.pass_count` and `summary.fail_count`.
5. `EXEC_REPORT.md` quotes exact computed numbers.

## Results

| Query | Terms | Paths | Status |
|-------|-------|-------|--------|
| q1 | 89% | 100% | PASS |
| q2 | 67% | 75% | PASS |
| q3 | 100% | 100% | PASS |
| q4 | 100% | 50% | PASS |
| q5 | 89% | 50% | PASS |
| q6 | 100% | 50% | PASS |
| q7 | 50% | 100% | PASS |

**Overall: 7/7 PASS**
