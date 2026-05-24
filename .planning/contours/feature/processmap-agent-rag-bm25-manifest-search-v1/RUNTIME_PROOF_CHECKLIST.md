# RUNTIME_PROOF_CHECKLIST — feature/processmap-agent-rag-bm25-manifest-search-v1

## Agent 1 Planning Gates

- [x] Agent 1 GSD discipline recorded
- [x] Previous RAG registry/policy contour reviewed
- [x] Source/runtime truth captured
- [x] BM25/search scope defined
- [x] Search index builder scope defined
- [x] Search CLI contract defined
- [x] Result metadata/snippet format defined
- [x] Validation queries defined
- [x] Agent preflight usage planned
- [x] Registry/policy reuse required
- [x] Secrets scanner reuse required
- [x] Exclusions recheck required
- [x] No product runtime changes
- [x] No package install
- [x] No embeddings/vector DB
- [x] No auto-mutation
- [x] Project Atlas RAG docs planned
- [x] Agent 3 GSD review required

## Agent 2 Execution Gates (to be checked by Agent 2)

- [ ] Search index builder implemented
- [ ] Search CLI implemented
- [ ] Validation query runner implemented
- [ ] Validation fixture created
- [ ] Search reuses manifest/registry/policy
- [ ] Search results include score/metadata/snippet
- [ ] 7+ validation queries run
- [ ] Validation results objective
- [ ] Secrets scanner still passes
- [ ] Excluded files not in index
- [ ] No secret values printed
- [ ] No product runtime changes
- [ ] No backend/frontend app changes
- [ ] No package install
- [ ] No embeddings/vector DB
- [ ] Project Atlas RAG docs updated
- [ ] Agent preflight usage documented
- [ ] Tooling commands repeatable

## Agent 3 Review Gates (to be checked by Agent 3)

- [ ] Reviewer GSD discipline recorded
- [ ] All Agent 2 reports read
- [ ] Changed files inspected
- [ ] Validation commands run independently
- [ ] Manual searches run (3+ queries)
- [ ] Search results verified specific
- [ ] Excluded paths verified absent
- [ ] No secret values printed
- [ ] No product runtime files changed
- [ ] No embeddings/vector DB/package install
- [ ] REVIEW_REPORT.md created
- [ ] Verdict: REVIEW_PASS or CHANGES_REQUESTED
