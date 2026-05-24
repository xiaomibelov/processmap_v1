# RUNTIME_NAVIGATION — feature/processmap-agent-rag-agent-preflight-integration-v1

**Contour Type:** Tooling / docs / workflow integration  
**No frontend UI proof required** unless tooling touches runtime, which it should not.

---

## Server Root

```
/opt/processmap-test
```

## Project Atlas (Obsidian)

```
/srv/obsidian/project-atlas/ProcessMap/RAG
```

## Test Runtime

- Frontend: `http://clearvestnic.ru:5180`
- API Health: `http://clearvestnic.ru:8088/health`

## Quick Health Checks

```bash
# API health
curl -s http://clearvestnic.ru:8088/health

# Frontend reachable
curl -I http://clearvestnic.ru:5180
```

## RAG Validation Commands

```bash
cd /opt/processmap-test

# Facts validation
node tools/rag/pm-rag-validate-facts.mjs

# BM25 validation
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8

# Secrets scan
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json

# Policy validation
node tools/rag/pm-rag-validate-policy.mjs
```

## Preflight CLI Commands

```bash
cd /opt/processmap-test

# Planner mode
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "perf/process-stage-baseline-jank-v1" \
  --area "Diagram performance lag" \
  --format md

# Executor mode
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --query "What is forbidden for RAG?" \
  --format md

# Reviewer mode
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "perf/process-stage-baseline-jank-v1" \
  --query "Diagram performance review rules" \
  --format json
```

## Index and Manifest Paths

| Artifact | Path |
|----------|------|
| Sources registry | `tools/rag/processmap-rag-sources.json` |
| Metadata schema | `tools/rag/processmap-rag-metadata-schema.json` |
| Classifier rules | `tools/rag/processmap-rag-classifier-rules.json` |
| Validation queries | `tools/rag/processmap-rag-validation-queries.json` |
| Facts schema | `tools/rag/facts/processmap-facts.schema.json` |
| Facts directory | `tools/rag/facts/` |
| Balanced index | `.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_SEARCH_INDEX_BALANCED.json` |

## Important Notes

- This contour is **tooling/docs only**.
- No product runtime files should be modified.
- No frontend UI changes.
- No backend API changes.
- All preflight outputs are read-only advisory context.
