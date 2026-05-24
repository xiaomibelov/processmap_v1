# SEARCH_RANKING_IMPROVEMENTS

**Contour:** `feature/processmap-agent-rag-coverage-and-validation-hardening-v1`
**Date:** 2026-05-16

---

## Baseline Boosts (from previous contour)

| Boost | Amount | Condition |
|-------|--------|-----------|
| Exact contour id | +3.0 | Query term (>3 chars) in contour_id |
| Exact path | +2.0 | Query term in path |
| Exact title/heading | +2.0 | Query term in title |
| Verdict exact | +2.0 | Query term in verdict |
| Source category | +1.0 | Query term in category |
| Recency | +0.5 | mtime < 30 days |

## New / Improved Boosts

| # | Boost | Amount | Condition | Change |
|---|-------|--------|-----------|--------|
| 1 | Exact contour id | +3.0 | Word-boundary match in contour_id | Fixed substring match bug |
| 2 | Path / filename | +1.5 | Word-boundary match in basename or dirname | Fixed substring match bug; reduced from +2.0 |
| 3 | Heading/title | +2.0 | Word-boundary match in title | Fixed substring match bug |
| 4 | Verdict/status | +1.5 | Word-boundary match in verdict when query implies review | Reduced from +2.0; added review-term gate |
| 5 | Recent 14d | +1.0 | mtime < 14 days | New tier |
| 6 | Recent 30d | +0.5 | mtime < 30 days | Kept baseline |
| 7 | Document class | +1.0 | REVIEW_REPORT/EXEC_REPORT/CHANGES_REQUESTED/REWORK_REQUEST when query implies review | New |
| 8 | Canonical truth | +1.0 | truth_level === canonical when query implies policy | New |
| 9 | Prompt penalty | -2.0 | prompt_template when query does NOT imply prompt lookup | New |
| 10 | Category role — plan/arch | +1.0 project_atlas, +0.5 contour | Query contains "plan" or "architecture" | New |
| 11 | Category role — review | +1.0 contour, +0.5 project_atlas | Query contains "review", "pass", "fail" | New |
| 12 | Category role — runtime | +1.0 docs, +0.5 contour | Query contains "runtime", "proof", "deploy" | New |
| 13 | Category role — code | +1.0 code | Query contains "code", "bug", "fix" | New |

## Cap

Maximum total boost: +8.0 (unchanged).

## Snippet Improvements

1. **Heading-aware snippets**: If query term matches heading, snippet is centered on heading.
2. **Contour-aware snippets**: Contour ID prepended as `[contour: ...]`.
3. **Term highlighting**: `*term*` markers continued.
4. **Snippet seed size**: Increased from 200 to 600 chars to capture more context for validation.

## Output Fields Added

- `verdict` — included in table and text output.
- `document_class` — included.
- `why_matched` — array of boost names applied.
- `total_boost` — numeric sum of boosts.

## Observed Effects

| Query | Before | After |
|-------|--------|-------|
| q1 Diagram REVIEW_PASS | PASS | PASS |
| q2 perf drag hot path | FAIL | PASS (full manifest includes perf contour) |
| q3 Diagram lag | PASS | PASS |
| q4 RAG forbidden | FAIL | PASS (larger snippets capture policy terms) |
| q5 indexed paths | FAIL | PASS (larger snippets capture source list) |
| q6 test runtime | FAIL | PASS (larger snippets capture runtime terms) |
| q7 Agent 3 review | PASS | PASS |

Pass rate improved from **3/7 to 7/7**.
