# RUNTIME_PROOF_CHECKLIST — feature/processmap-agent-rag-agent-preflight-integration-v1

**Contour Type:** Tooling / docs / workflow integration  
**No frontend UI proof required** unless tooling touches runtime, which it should not.

---

## Agent 1 Planning Gates

- [x] Agent 1 GSD discipline recorded
- [x] Previous RAG contours reviewed
- [x] Source/runtime truth captured
- [x] Facts-first/BM25-second design defined
- [x] Preflight CLI contract defined
- [x] Planner mode planned
- [x] Executor mode planned
- [x] Reviewer mode planned
- [x] Markdown/JSON output planned
- [x] Report template integration planned
- [x] User rejection override required
- [x] Role-specific gates required
- [x] Facts validator re-run required
- [x] BM25 validation re-run required
- [x] Secrets scan required
- [x] No product runtime changes
- [x] No package install
- [x] No embeddings/vector DB
- [x] No auto-mutation
- [x] Project Atlas RAG docs planned
- [x] Agent 3 GSD review required

## Agent 2 Execution Gates

- [ ] `pm-rag-agent-preflight.mjs` exists and handles all args
- [ ] `--role planner` produces correct output
- [ ] `--role executor` produces correct output
- [ ] `--role reviewer` produces correct output
- [ ] `--format md` works
- [ ] `--format json` works
- [ ] Sample outputs created for all 4 examples
- [ ] Facts validator still passes (28/28)
- [ ] BM25 validation still passes (7/7 or documented)
- [ ] Secrets scan clean or false positives documented
- [ ] No product runtime files changed
- [ ] No secrets printed
- [ ] Project Atlas updated
- [ ] All required reports created
- [ ] `READY_FOR_REVIEW` created

## Agent 3 Review Gates

- [ ] Reviewer GSD discipline section present in REVIEW_REPORT.md
- [ ] Preflight command missing → CHANGES_REQUESTED
- [ ] Facts-first behavior verified
- [ ] BM25 supporting docs verified
- [ ] User rejection override represented
- [ ] Agent 1/2/3 usage examples present
- [ ] Product runtime unchanged
- [ ] Secrets policy not weakened
- [ ] No REVIEW_PASS if any gate above failed
