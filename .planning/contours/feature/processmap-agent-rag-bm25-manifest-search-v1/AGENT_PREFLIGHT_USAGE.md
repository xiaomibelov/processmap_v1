# AGENT_PREFLIGHT_USAGE

**Contour:** `feature/processmap-agent-rag-bm25-manifest-search-v1`  
**Date:** 2026-05-16

---

## Purpose

Before starting work, Agents 1/2/3 should query the RAG corpus to discover relevant context, prior contours, and canonical rules. This reduces duplication and ensures decisions are evidence-based.

---

## Quick Commands

### Generic Pre-Flight

```bash
node tools/rag/pm-rag-search.mjs "<keywords>" --top-k 5
```

### Planner Pre-Flight

```bash
node tools/rag/pm-rag-search.mjs \
  "contour category:perf keywords:diagram drag lag truth:canonical" \
  --top-k 5
```

### Executor Pre-Flight

```bash
node tools/rag/pm-rag-search.mjs \
  "file:ProcessStage.jsx regression|test|proof" \
  --top-k 5
```

### Reviewer Pre-Flight

```bash
node tools/rag/pm-rag-search.mjs \
  "contour:{contour_id} acceptance|criteria|fail|proof" \
  --top-k 5
```

---

## Output Formats

- **Default:** Human-readable plain text (good for quick scanning)
- **`--json`:** Machine-readable array (good for scripting)
- **`--format md`:** Markdown table + snippets (good for reports)

---

## Query Tips

1. **Use specific terms** — BM25 is lexical; exact terms score higher.
2. **Include contour IDs** — If you know the contour, include it for a +3.0 boost.
3. **Include verdict keywords** — `REVIEW_PASS`, `CHANGES_REQUESTED` get +2.0 boost.
4. **Check recency** — Files modified within 30 days get +0.5 boost.
5. **Redaction** — Snippets auto-redact secrets; safe to include in reports.

---

## Agent Preflight Helper Script

**Status:** Not implemented in this contour (documented as next contour proposal).

A dedicated `tools/rag/pm-rag-agent-preflight.mjs` helper could provide:

```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --area "diagram performance" \
  --contour "perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1"
```

Output would include:
- Suggested queries based on role + area
- Top results pre-formatted as compact context block
- Links to relevant Project Atlas pages

**Next contour:** `feature/processmap-agent-rag-preflight-helper-v1`
