# FACTS_REGISTRY_REPORT

**Contour:** `feature/processmap-agent-rag-structured-facts-registry-v1`
**Date:** 2026-05-16

---

## Registry File Layout

```
tools/rag/facts/
  processmap-facts.schema.json      — JSON Schema for all fact types
  processmap-runtime-facts.json     — runtime_fact array (9 facts)
  processmap-agent-rules.json       — agent_rule array (8 facts)
  processmap-contour-facts.ndjson   — contour_fact lines (9 facts)
  processmap-user-rejections.ndjson — user_rejection_fact lines (5 facts)
  processmap-decisions.ndjson       — decision_fact lines (10 facts)
  processmap-validation-facts.json  — validation_fact array (8 facts)
  processmap-bottleneck-facts.ndjson — bottleneck_fact lines (4 facts)
```

## Counts Per Fact Type

| Fact Type | Count | Format |
|-----------|-------|--------|
| runtime_fact | 9 | JSON array |
| agent_rule | 8 | JSON array |
| contour_fact | 9 | NDJSON |
| user_rejection_fact | 5 | NDJSON |
| decision_fact | 10 | NDJSON |
| validation_fact | 8 | JSON array |
| bottleneck_fact | 4 | NDJSON |
| **Total** | **53** | — |

## Coverage by Area

| Area | Fact Count |
|------|------------|
| RAG | 23 |
| Diagram | 18 |
| Frontend | 2 |
| Product / General | 10 |

## source_refs Summary

All 53 facts have at least one source_ref.
Total unique source_ref paths: ~40
All local paths were verified to exist at validation time.

Key referenced documents:
- `AGENTS.md` — 7 refs
- `RAG_ARCHITECTURE.md` — 3 refs
- `REVIEW_REPORT.md` (various contours) — 25+ refs
- `VALIDATION_QUERY_RESULTS.md` — 8 refs
- `RUNTIME_NAVIGATION.md` — 6 refs

## Status Distribution

| Status | Count |
|--------|-------|
| active | 53 |
| superseded | 0 |
| rejected | 0 |
| draft | 0 |
| deprecated | 0 |

## Confidence / Severity Distribution

| Value | Count |
|-------|-------|
| critical | 9 |
| high | 14 |
| medium | 1 |
| low | 0 |
| n/a | 29 |

## Rationale for JSON/NDJSON Mix

- JSON arrays for small, stable sets (runtime, rules, validation) — easy to load whole file
- NDJSON for larger or append-oriented sets (contours, rejections, decisions, bottlenecks) — easy to grep/append without rewriting entire files
