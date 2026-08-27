# RAG Preflight — feature/canvas-search-improvements

**Role:** executor  
**Contour:** feature/canvas-search-improvements  
**Area:** frontend/canvas/search  
**Query:** canvas diagram search inline elements properties bpmn focus initialization debounce instant list advanced search  
**Generated at:** 2026-08-27T20:43:24.007Z

## Summary

- BM25 search returned no supporting documents for the query (facts-only mode active).
- Structured facts surfaced critical rules: RAG is read-only, no auto-mutation of BPMN XML, large god files require decomposition-first.
- No direct prior art for this exact search improvement was found in the index.

## Structured Facts (relevant)

### Agent Rules
- [critical] RAG is read-only suggestion/context layer. Forbidden: auto-mutating code, auto-saving files, writing BPMN XML, or applying Product Actions automatically based on RAG output.
- [critical] Large god files require decomposition-first before adding new logic.

### Decisions
- Version marker must not overlay the BPMN canvas.
- Product Actions durable truth source is `interview.analysis.product_actions[]`.
- RAG must not write or mutate BPMN XML.

### Required Gates
- [ ] Source/runtime truth confirmed before implementation
- [ ] Bounded contour scope respected
- [ ] No product runtime changes unless explicitly allowed
- [ ] No secrets printed in output
- [ ] No auto-mutation of BPMN XML or Product Actions
- [ ] RAG read-only boundary respected
- [ ] Runtime evidence collected for Agent 3

## Conclusion

Proceeding from first principles with the existing search module (`frontend/src/features/process/stage/search/`) as the bounded contour. No BPMN XML mutations; no backend migrations; only read-only client-side search enhancements.
