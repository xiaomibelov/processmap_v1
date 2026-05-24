# RUNTIME_NAVIGATION — feature/processmap-agent-rag-bm25-manifest-search-v1

## Server

- **Host:** `clearvestnic.ru`
- **Working directory:** `/opt/processmap-test`
- **User:** `root`

## Product Runtime Endpoints

| Service | URL | Status |
|---------|-----|--------|
| Frontend (nginx) | http://clearvestnic.ru:5180 | HTTP 200 OK, no-cache |
| Backend health | http://clearvestnic.ru:8088/health | `{"ok":true,"redis":"healthy"}` |

## Project Atlas

- **Path:** `/srv/obsidian/project-atlas/ProcessMap/RAG/`
- **Mirror script:** `./tools/pm-agent-mirror-report.sh "<contour-id>" <role>`

## RAG Tooling Commands

### Policy Validation
```bash
node tools/rag/pm-rag-validate-policy.mjs
```

### Secrets Scan
```bash
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json
```

### Manifest Build
```bash
node tools/rag/pm-rag-build-manifest.mjs --sample --limit 500
```

### Search Index Build
```bash
node tools/rag/pm-rag-build-search-index.mjs \
  --manifest .planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json
```

### Search Query
```bash
node tools/rag/pm-rag-search.mjs "<query>" [--top-k N] [--json] [--format md]
```

### Validation Query Runner
```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```

## Notes

- This contour is tooling/docs only. No frontend UI proof required.
- No backend API changes.
- No product runtime behavior changes.
- RAG tools run as CLI utilities, not services.
