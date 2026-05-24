# RUNTIME_PROOF_CHECKLIST.md

## Pre-execution checks
- [x] GSD discipline recorded
- [x] source/runtime truth captured
- [x] current visible version gap documented
- [x] current build-info proof captured

## Agent 2 execution checks
- [ ] visible UI version marker implemented
- [ ] visible marker includes app version + SHA + timestamp
- [ ] build-info.json still works
- [ ] window.__PROCESSMAP_BUILD_INFO__ still works
- [ ] 5180 served assets captured
- [ ] frontend build completed
- [ ] correct test runtime service rebuilt/restarted if required
- [ ] 5180 marker verified by curl
- [ ] 5180 marker verified in fresh browser
- [ ] browser cache-busting proof captured
- [ ] large no-overlays Diagram baseline captured
- [ ] .fpcPropertyOverlay = 0 confirmed
- [ ] pan/zoom baseline captured
- [ ] selection baseline captured
- [ ] tab switch baseline captured
- [ ] current Modeler/Viewer usage mapped
- [ ] root cause identified
- [ ] material lag fix implemented
- [ ] before/after timings captured
- [ ] pan/zoom materially improved
- [ ] selection-lite preserved
- [ ] property panel preserved
- [ ] no PUT/PATCH from view interactions
- [ ] no versions spam regression
- [ ] no backend changes
- [ ] no BPMN XML mutation
- [ ] no Product Actions/RAG/AG-UI changes
- [ ] build/tests run

## Agent 3 review checks
- [ ] Agent 3 fresh-browser Playwright review required
- [ ] visible version required for REVIEW_PASS
- [ ] material performance improvement required for REVIEW_PASS
- [ ] 5180 served marker matches local dist
- [ ] no console errors introduced
- [ ] no network mutation regressions
