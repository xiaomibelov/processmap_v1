# RUNTIME_PROOF_CHECKLIST.md

- [ ] GSD discipline recorded
- [ ] Previous audit/review read
- [ ] Source/runtime truth captured
- [ ] Baseline `/bpmn/versions?limit=1` count captured
- [ ] Source map captured
- [ ] Root cause identified
- [ ] Fix scoped to versions head-check dedupe
- [ ] History modal still fetches versions
- [ ] Normal Diagram idle does not spam versions
- [ ] Pan/zoom/overlays do not spam versions
- [ ] Tab switch does not spam versions
- [ ] No PUT/PATCH mutations introduced
- [ ] No backend changes
- [ ] No BPMN XML mutation
- [ ] No Product Actions/RAG/AG-UI changes
- [ ] Overlay viewport-culling not regressed
- [ ] Agent 3 Playwright review required
