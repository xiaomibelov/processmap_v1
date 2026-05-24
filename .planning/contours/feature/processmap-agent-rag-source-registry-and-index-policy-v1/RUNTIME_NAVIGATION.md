# RUNTIME_NAVIGATION — feature/processmap-agent-rag-source-registry-and-index-policy-v1

This contour is tooling/docs only. No frontend UI runtime proof is required.

---

## Server Root

`/opt/processmap-test`

## Project Atlas (Obsidian Mirror)

`/srv/obsidian/project-atlas/ProcessMap/RAG`

## Test Runtime Endpoints

- Frontend: `http://clearvestnic.ru:5180` (nginx, HTTP 200 OK, no-cache)
- Backend health: `http://clearvestnic.ru:8088/health` (redis healthy)

## Agent 2 Validation Commands

```bash
cd /opt/processmap-test

# Registry + policy validation
node tools/rag/pm-rag-validate-policy.mjs

# Secrets scanner dry run
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json

# Sample manifest build
node tools/rag/pm-rag-build-manifest.mjs --sample --limit 200
```

## Contour Output Directory

`.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/`

## Tooling Output Directories

- `tools/rag/` — scripts and config
- `docs/rag/` — policy documentation
- `scripts/rag/` — alternative location if repo convention requires

## Notes

- No frontend UI proof required unless tooling touches runtime, which it should not.
- No backend API calls required for this contour.
- All validation is CLI-based.
- RAG remains read-only; no mutation of product runtime.
