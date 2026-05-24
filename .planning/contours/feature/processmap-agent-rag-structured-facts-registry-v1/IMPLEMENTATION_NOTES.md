# IMPLEMENTATION_NOTES

**Contour:** `feature/processmap-agent-rag-structured-facts-registry-v1`
**Date:** 2026-05-16

---

## Design Decisions

1. **JSON Schema Draft 7** — Chosen for broad compatibility and explicit `const` support in `oneOf` branches.
2. **Mixed JSON/NDJSON** — JSON arrays for small stable sets; NDJSON for append-oriented sets. Both are line-oriented and grep-friendly.
3. **Node.js built-ins only** — No npm install, no external dependencies, consistent with previous RAG contours.
4. **Field-weighted lexical search** — Simple but deterministic. No embeddings/vector DB per contour boundaries.
5. **Role boost in bridge** — Heuristic weights favor rules and rejections relevant to the requesting agent role.

## Known Limitations

1. **Manual curation** — Facts are hand-written by Agent 2. Future contours may add auto-extraction helpers, but curated facts remain the canonical layer.
2. **No freshness automation** — `updated_at` is static. Future contour should add timestamp verification or contour-completion triggers.
3. **Schema strictness** — New fact types require schema update. This is intentional for quality control.
4. **Bridge subprocess overhead** — `--append-bm25` spawns `pm-rag-search-facts.mjs`. Direct module import would be faster.
5. **No caching** — Facts are reloaded from disk on every validator/search/bridge invocation. Acceptable for 53 facts; may need optimization at scale.

## Next Contour Proposals

1. **`feature/processmap-agent-rag-agent-preflight-integration-v1`**
   - Integrate facts lookup into agent launcher scripts
   - Add `--format json` to bridge
   - Cache fact loads
   - Direct BM25 integration without subprocess

2. **`tooling/project-atlas-server-docs-import-and-triage-v1`**
   - Triage ~300 unclassified imported Project Atlas files
   - Update source registry with new paths

3. **`feature/processmap-agent-rag-query-syntax-extensions-v1`**
   - Add `category:`, `contour:`, `type:` filters to BM25 search
   - Improve generic query ranking

4. **`feature/processmap-agent-rag-embeddings-semantic-search-v1`**
   - Address remaining BM25 semantic limitations
   - Hybrid lexical + semantic retrieval

## Files Changed

```
tools/rag/facts/processmap-facts.schema.json
tools/rag/facts/processmap-runtime-facts.json
tools/rag/facts/processmap-agent-rules.json
tools/rag/facts/processmap-contour-facts.ndjson
tools/rag/facts/processmap-user-rejections.ndjson
tools/rag/facts/processmap-decisions.ndjson
tools/rag/facts/processmap-validation-facts.json
tools/rag/facts/processmap-bottleneck-facts.ndjson
tools/rag/pm-rag-validate-facts.mjs
tools/rag/pm-rag-search-facts.mjs
tools/rag/pm-rag-facts-to-context.mjs
.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/*.md
/srv/obsidian/project-atlas/ProcessMap/RAG/*.md
```
