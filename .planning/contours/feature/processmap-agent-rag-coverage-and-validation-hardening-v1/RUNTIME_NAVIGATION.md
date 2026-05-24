# RUNTIME_NAVIGATION — feature/processmap-agent-rag-coverage-and-validation-hardening-v1

## Server

- **Root:** `/opt/processmap-test`
- **User:** `root`
- **Host:** `clearvestnic.ru`

## Project Atlas

- **RAG docs:** `/srv/obsidian/project-atlas/ProcessMap/RAG`
- **ProcessMap root:** `/srv/obsidian/project-atlas/ProcessMap`

## Test Runtime

- **Frontend:** http://clearvestnic.ru:5180
- **API health:** http://clearvestnic.ru:8088/health

## RAG Tooling Commands

### Policy validation
```bash
node tools/rag/pm-rag-validate-policy.mjs
```

### Secrets scan
```bash
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json
```

### Balanced manifest build
```bash
node tools/rag/pm-rag-build-manifest.mjs --source-balanced --per-source-limit 100
# or
node tools/rag/pm-rag-build-manifest.mjs --full
```

### Search index build
```bash
node tools/rag/pm-rag-build-search-index.mjs \
  --manifest .planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_MANIFEST_BALANCED.json
```

### Search query
```bash
node tools/rag/pm-rag-search.mjs "<query>" [--top-k N] [--json] [--format md]
```

### Validation query runner
```bash
node tools/rag/pm-rag-run-validation-queries.mjs \
  --top-k 8 \
  --manifest .planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_MANIFEST_BALANCED.json
```

## Notes

- This contour is tooling/docs only.
- No frontend UI proof required unless tooling touches runtime, which it should not.
- All generated artifacts go into the contour output directory or `/tmp`.
