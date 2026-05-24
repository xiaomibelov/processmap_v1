# Preflight CLI Report

**Contour:** `feature/processmap-agent-rag-agent-preflight-integration-v1`  
**Date:** 2026-05-16  
**Agent 2 / Executor**

## Tool

`tools/rag/pm-rag-agent-preflight.mjs`

## Implementation Summary

- **Node.js built-ins only** — no external dependencies.
- **Facts-first** — loads all structured facts from `tools/rag/facts/` (`*.json`, `*.ndjson`).
- **BM25-second** — spawns `pm-rag-search.mjs` with `--json` output for supporting documents.
- **Role-aware scoring** — applies type-specific boosts for `planner`, `executor`, `reviewer`.
- **Contour boost** — when `--contour` is provided, facts matching that `contour_id` receive +3.
- **Area filtering** — when `--area` is provided, tokens are included in scoring.
- **Deduplication** — BM25 docs referencing fact source paths are deprioritized.
- **Redaction** — same regex-based secret redaction as `pm-rag-search.mjs`.
- **Compact output** — caps at 20 facts + `top-k` BM25 docs.

## Argument Matrix

| Arg | Required | Tested |
|-----|----------|--------|
| `--role` | Yes | planner, executor, reviewer |
| `--contour` | No | `perf/process-stage-baseline-jank-v1` |
| `--area` | No | `Diagram performance lag` |
| `--query` | No | Multiple test queries |
| `--top-k` | No | 3, 5, 8 |
| `--format` | No | `md`, `json` |
| `--out` | No | Multiple contour sample files |

## Output Sections Verified

| Section | md | json | Notes |
|---------|----|------|-------|
| `# ProcessMap Agent RAG Preflight` | ✅ | N/A | Header always present |
| `## Input` | ✅ | ✅ | role, contour, area/query, generated_at |
| `## Structured Facts` | ✅ | ✅ | 7 subsections |
| `## Supporting Documents` | ✅ | ✅ | rank, score, path, title, snippet, why_matched |
| `## Required Gates` | ✅ | ✅ | Role-specific checklists |
| `## Warnings` | ✅ | ✅ | User rejections, deprecated, coverage, secrets |
| `## Suggested Next Queries` | ✅ | ✅ | 3–5 follow-up commands |

## Performance

| Operation | Approx Time |
|-----------|-------------|
| Facts load (53 facts) | < 50 ms |
| Facts scoring | < 20 ms |
| BM25 search (spawn) | ~500–1500 ms |
| Total | < 2 s |

## Known Limitations

1. BM25 search spawns a child process; could be optimized by loading the index directly if latency becomes an issue.
2. Facts scoring is lexical/token-based; no semantic matching.
3. Top-k cutoff for facts is hardcoded at 20; may need tuning for larger fact registries.
