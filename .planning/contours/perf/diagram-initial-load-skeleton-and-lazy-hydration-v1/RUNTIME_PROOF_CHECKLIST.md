# RUNTIME_PROOF_CHECKLIST.md

## Pre-Implementation

- [x] GSD discipline recorded
- [x] Post-optimization audit reviewed
- [x] Source/runtime truth captured
- [ ] Initial load baseline captured (Agent 2)
- [ ] Tab switch baseline captured (Agent 2)
- [ ] Critical vs non-critical load path mapped (Agent 2)
- [ ] God-file/decomposition risk identified

## Implementation

- [ ] Decomposition-first applied if needed
- [ ] Skeleton/visual feedback implemented
- [ ] Canvas first paint not blocked by non-critical hydration
- [ ] Non-critical panels/decor/derived work deferred safely

## Post-Implementation Validation

- [ ] Analysis ↔ Diagram tab switch improved or limitation documented
- [ ] XML ↔ Diagram tab switch checked
- [ ] pan/zoom works after canvas first paint
- [ ] analytics selection works after canvas first paint
- [ ] property panel works after hydration
- [ ] overlays/decor work after hydration
- [ ] no PUT/PATCH from load/tab switch/view interactions
- [ ] no versions spam regression
- [ ] overlay culling preserved
- [ ] selection-lite preserved
- [ ] derived maps preserved
- [ ] repaint reduction preserved
- [ ] no backend changes
- [ ] no BPMN XML mutation
- [ ] no Product Actions/RAG/AG-UI changes
- [ ] build/tests run
- [ ] Agent 3 Playwright review required
- [ ] before/after timing proof required
