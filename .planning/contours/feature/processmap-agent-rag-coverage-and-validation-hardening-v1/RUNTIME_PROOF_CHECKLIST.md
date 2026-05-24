# RUNTIME_PROOF_CHECKLIST — feature/processmap-agent-rag-coverage-and-validation-hardening-v1

## Agent 1 Planning Gates

- [x] Agent 1 GSD discipline recorded
- [x] previous BM25 contour reviewed
- [x] previous 3/7 validation result documented
- [x] source/runtime truth captured
- [x] source-balanced coverage scope defined
- [x] balanced manifest/index plan defined
- [x] coverage report planned
- [x] ranking/boost hardening planned
- [x] validation fixture hardening planned
- [x] validation runner consistency planned
- [x] expected 6/7 or 7/7 threshold defined
- [x] secrets scanner reuse required
- [x] exclusions recheck required
- [x] no product runtime changes
- [x] no package install
- [x] no embeddings/vector DB
- [x] no auto-mutation
- [x] Project Atlas RAG docs planned
- [x] Agent 3 GSD review required

## Agent 2 Execution Gates (to be checked by Agent 2)

- [ ] Source-balanced manifest built and includes all 8 sources
- [ ] Coverage report generated
- [ ] Ranking/boost improvements implemented
- [ ] Validation fixture hardened
- [ ] Validation runner computes counts from JSON
- [ ] All 7 validation queries executed
- [ ] Pass rate ≥ 6/7 (target 7/7)
- [ ] Reporting discrepancy fixed
- [ ] Secrets scan passed or findings documented
- [ ] Excluded paths absent from manifest/index
- [ ] No secret values in search output
- [ ] No product runtime files changed
- [ ] Project Atlas updated
- [ ] READY_FOR_REVIEW created

## Agent 3 Review Gates (to be checked by Agent 3)

- [ ] Reviewer GSD discipline recorded
- [ ] All Agent 2 reports read
- [ ] Changed files inspected
- [ ] Validation commands run independently
- [ ] Manual searches run (at least 5 queries)
- [ ] Search results verified specific
- [ ] Validation pass count computed and consistent
- [ ] Source-balanced coverage verified
- [ ] Excluded paths verified absent
- [ ] No secret values printed
- [ ] No product runtime files changed
- [ ] No embeddings/vector DB/package install
- [ ] REVIEW_REPORT.md created
- [ ] Verdict: REVIEW_PASS or CHANGES_REQUESTED
