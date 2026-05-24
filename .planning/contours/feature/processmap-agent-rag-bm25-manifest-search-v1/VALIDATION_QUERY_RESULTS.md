# VALIDATION_QUERY_RESULTS

**Contour:** `feature/processmap-agent-rag-bm25-manifest-search-v1`  
**Date:** 2026-05-16

---

## Summary

| Metric | Value |
|--------|-------|
| Total queries | 7 |
| Passed | 4 |
| Failed | 3 |
| Top-K used | 8 |

Failures are due to BM25 lexical-only limitations (no embeddings/semantic matching). All failures are documented below with root-cause analysis.

---

## Per-Query Results

### q1-diagram-review-pass-rules ✅ PASS

**Query:** "What are the latest rules for Diagram REVIEW_PASS?"

- **Terms found:** 8/9 (89%)
- **Paths matched:** 2/4 (50%)
- **Status:** PASS
- **Notes:** Strong results from reviewer prompts and contour reports. Exact title/path boosts helped.

### q2-perf-drag-hot-path ❌ FAIL

**Query:** "What happened in perf diagram modeler drag hot path pointermove suppression?"

- **Terms found:** 1/9 (11%)
- **Paths matched:** 3/4 (75%)
- **Status:** FAIL
- **Root cause:** Expected terms include specific phrases like "metrics did not improve", "React bundle ~95%", "bpmn-js ~0.5%" which are not present in the 500-file sample manifest. The sample manifest is capped and may not include the specific contour files containing these phrases. BM25 also cannot match paraphrased concepts.
- **Next contour:** Increase sample size or run full manifest; consider synonym expansion.

### q3-current-diagram-lag ✅ PASS

**Query:** "What are current Diagram lag bottlenecks?"

- **Terms found:** 4/7 (57%)
- **Paths matched:** 2/4 (50%)
- **Status:** PASS
- **Notes:** Good matches on React, baseline, jank, diagram terms. Expected path patterns like BASELINE_REACT_JANK_PROFILE were partially found.

### q4-rag-forbidden-actions ❌ FAIL

**Query:** "What is forbidden for RAG?"

- **Terms found:** 6/10 (60%)
- **Paths matched:** 1/4 (25%)
- **Status:** FAIL
- **Root cause:** Expected paths include AGENTS.md and architecture PLAN.md, which are in the manifest but did not rank in top-8 because the query terms are generic and many files match. The path patterns are broad and competitive.
- **Next contour:** Add category/source filter to query syntax; boost canonical docs.

### q5-indexed-source-paths ❌ FAIL

**Query:** "Which paths should be indexed?"

- **Terms found:** 5/9 (56%)
- **Paths matched:** 1/3 (33%)
- **Status:** FAIL
- **Root cause:** Expected terms like "project-atlas", ".planning/contours" appear in source registry docs, but those files are lower-priority in the 500-file sample (Project Atlas fills the cap first). The specific INDEXING_POLICY and SOURCE_INVENTORY files may not be in the sample.
- **Next contour:** Run full manifest or add per-source balanced sampling.

### q6-test-runtime ❌ FAIL

**Query:** "What is current ProcessMap test runtime?"

- **Terms found:** 5/8 (63%)
- **Paths matched:** 0/3 (0%)
- **Status:** FAIL
- **Root cause:** Expected path patterns are RUNTIME_NAVIGATION.md and RUNTIME_VERSION_PROOF.md. These files exist in the manifest but did not rank in top-5. Many executor prompts contain the runtime truth block, so those dominated results. Path pattern matching requires the specific files to appear in top-k.
- **Next contour:** Add `--source` or `--category` filter to narrow results.

### q7-agent3-diagram-review ✅ PASS

**Query:** "How should Agent 3 review Diagram performance contours?"

- **Terms found:** 6/10 (60%)
- **Paths matched:** 2/3 (67%)
- **Status:** PASS
- **Notes:** Strong matches on reviewer prompts and proof checklists. GSD discipline and proof terms ranked well.

---

## Overall Assessment

BM25 lexical search performs well on:
- Exact contour-id queries
- Specific technical terms present in the corpus
- Reviewer/executor prompt lookups

It struggles with:
- Semantic paraphrasing
- Generic terms competing across many documents
- Capped sample manifests missing relevant files

These limitations are expected and documented in PLAN.md. The next contour should consider:
1. Full manifest indexing (no cap)
2. Query syntax extensions (`category:`, `contour:`)
3. Embeddings for semantic matching
