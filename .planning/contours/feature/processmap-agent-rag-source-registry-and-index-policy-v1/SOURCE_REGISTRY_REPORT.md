# SOURCE_REGISTRY_REPORT

**Contour:** `feature/processmap-agent-rag-source-registry-and-index-policy-v1`  
**Run ID:** `20260516T142047Z-97868`

---

## Registry File

`tools/rag/processmap-rag-sources.json`

## Summary

| Metric | Value |
|--------|-------|
| Version | 1.0.0 |
| Project | ProcessMap |
| Source roots | 8 |
| Global exclude globs | 16 |

## Sources by Category

| Category | Count | IDs |
|----------|-------|-----|
| `project_atlas` | 1 | project-atlas |
| `contour` | 1 | planning-contours |
| `docs` | 2 | docs-curated, handoff-notes |
| `code` | 4 | frontend-src, backend-src, tools-src, scripts-src |

## Source Details

| ID | Path | Truth Level | Priority | Owner |
|----|------|-------------|----------|-------|
| project-atlas | `/srv/obsidian/project-atlas/ProcessMap` | canonical | critical | architecture-team |
| planning-contours | `/opt/processmap-test/.planning/contours` | evidence | critical | contour-executor |
| docs-curated | `/opt/processmap-test/docs` | canonical | high | product-team |
| handoff-notes | `/opt/processmap-test/PROCESSMAP/HANDOFF` | evidence | normal | devops-team |
| frontend-src | `/opt/processmap-test/frontend/src` | canonical | critical | frontend-team |
| backend-src | `/opt/processmap-test/backend` | canonical | critical | backend-team |
| tools-src | `/opt/processmap-test/tools` | canonical | normal | devops-team |
| scripts-src | `/opt/processmap-test/scripts` | canonical | normal | devops-team |

## Global Exclude Globs (16)

1. `**/.env*`
2. `**/*.pem`
3. `**/*.key`
4. `**/id_rsa`
5. `**/id_ed25519`
6. `**/node_modules/**`
7. `**/frontend/dist/**`
8. `**/__pycache__/**`
9. `**/*.pyc`
10. `**/.git/**`
11. `**/.playwright-mcp/**`
12. `**/.agents/**`
13. `**/*.backup*`
14. `/srv/obsidian/project-atlas/ProcessMap/_Imported/**`
15. `**/debug-*.mjs`
16. `**/run-*.mjs`

## Per-Source Include Globs

| ID | Include Globs |
|----|---------------|
| project-atlas | `**/*.md` |
| planning-contours | `**/*.md`, `**/*.json`, `**/*.mjs`, `**/*.js`, `**/*.py`, `**/*.sh`, `**/*.yml`, `**/*.yaml` |
| docs-curated | `**/*.md` |
| handoff-notes | `**/*.md` |
| frontend-src | `**/*.js`, `**/*.jsx`, `**/*.ts`, `**/*.tsx`, `**/*.mjs` |
| backend-src | `**/*.py`, `**/*.md`, `**/*.json`, `**/*.yml`, `**/*.yaml`, `**/*.sh` |
| tools-src | `**/*.sh`, `**/*.mjs`, `**/*.js`, `**/*.py`, `**/*.md` |
| scripts-src | `**/*.sh`, `**/*.mjs`, `**/*.js`, `**/*.py`, `**/*.md` |

## Verification

- All 8 source paths exist and are directories: ✅
- All sources have required fields (id, path, category, truth_level, indexing_priority): ✅
- All sources have exclude_globs arrays: ✅
- Global exclude globs non-empty: ✅
