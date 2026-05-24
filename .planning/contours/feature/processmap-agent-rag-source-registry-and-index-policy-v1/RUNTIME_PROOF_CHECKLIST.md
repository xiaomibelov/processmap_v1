# RUNTIME_PROOF_CHECKLIST — feature/processmap-agent-rag-source-registry-and-index-policy-v1

- [ ] Agent 1 GSD discipline recorded
- [ ] Previous architecture contour reviewed (REVIEW_PASS)
- [ ] Source/runtime truth captured (pwd, branch, HEAD, origin/main, health checks)
- [ ] Source registry scope defined (8 roots, concrete paths)
- [ ] Index policy scope defined (include/exclude/secrets/AI drafts/deprecated/raw logs)
- [ ] Secrets scanner scope defined (path + content patterns, no value printing)
- [ ] Metadata schema scope defined (18 fields, types, required flags)
- [ ] Classifier rules scope defined (10 classes, rule-based heuristics)
- [ ] Manifest builder scope defined (JSON+MD output, sha256, sample limit)
- [ ] Hard exclusions defined (.env, keys, node_modules, dist, __pycache__, .git, _Imported)
- [ ] No secrets printing policy defined
- [ ] Project Atlas RAG update planned (INDEX_SOURCES.md, INDEXING_POLICY.md, Metadata Schema.md, Validation Queries.md)
- [ ] Validation commands defined (registry validate, secrets scan, manifest build, exclusion verify)
- [ ] No product runtime changes (tooling/docs only)
- [ ] No package install (Node built-ins only)
- [ ] No embeddings/vector DB (BM25/source manifest only)
- [ ] No auto-mutation (read-only boundary explicit)
- [ ] Agent 3 GSD review required (Reviewer GSD Discipline — Mandatory)
