# RUNTIME_NAVIGATION — feature/processmap-agent-rag-structured-facts-registry-v1

## Server Info

| Property | Value |
|----------|-------|
| Host | clearvestnic.ru |
| Working directory | /opt/processmap-test |
| User | root |

## Test Runtime Endpoints

| Endpoint | URL | Status |
|----------|-----|--------|
| Frontend | http://clearvestnic.ru:5180 | HTTP 200 OK (nginx, no-cache) |
| API Health | http://clearvestnic.ru:8088/health | `{"ok":true,"status":"ok",...}` |

## Project Atlas Paths

| Path | Purpose |
|------|---------|
| `/srv/obsidian/project-atlas/ProcessMap/RAG/` | RAG knowledge layer docs |
| `/Users/mac/Documents/Obsidian/ProjectAtlas` | Local Project Atlas (Mac) |

## Contour Root

`/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/`

## Commands for Facts Tooling

### Validate facts
```bash
cd /opt/processmap-test
node tools/rag/pm-rag-validate-facts.mjs
```

### Search facts
```bash
cd /opt/processmap-test
node tools/rag/pm-rag-search-facts.mjs "<query>" [--type <type>] [--status <status>] [--top-k N] [--json]
```

### Facts to context (bridge)
```bash
cd /opt/processmap-test
node tools/rag/pm-rag-facts-to-context.mjs --role <planner|executor|reviewer> --query "<query>" || true
```

### Secrets scan
```bash
cd /opt/processmap-test
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json || true
node tools/rag/pm-rag-scan-secrets.mjs --path tools/rag/facts/ || true
```

## Note

This contour is tooling/docs only. No frontend UI proof is required because the contour does not touch product runtime.
