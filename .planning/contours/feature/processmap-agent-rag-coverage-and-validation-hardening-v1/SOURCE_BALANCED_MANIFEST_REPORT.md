# SOURCE_BALANCED_MANIFEST_REPORT

**Contour:** `feature/processmap-agent-rag-coverage-and-validation-hardening-v1`
**Date:** 2026-05-16

---

## Manifest Builder Changes

File: `tools/rag/pm-rag-build-manifest.mjs`

### New Flags

| Flag | Behavior |
|------|----------|
| `--full` | No cap; include all allowed files |
| `--source-balanced` | Distribute `--limit` evenly across sources |
| `--per-source-limit N` | Hard cap per source |
| `--min-per-source N` | Guarantee minimum inclusion per source |
| `--output-dir <path>` | Output directory for manifest files |

### Algorithm (Full Mode)

1. **Phase 1 — Collect**: Walk each source directory, apply include/exclude globs, collect all eligible files with stats.
2. **Phase 2 — Select**: If `--full`, include all. Otherwise apply chosen strategy (balanced, per-source-limit, min-per-source, or default registry-order fill).
3. **Phase 3 — Build**: Read content, classify, compute SHA256, infer title, build entry.

### Coverage Tracking

During build, per-source stats are collected:
- `files_total`, `files_included`, `files_skipped`
- `class_distribution`
- `top_contour_ids` (frequency-based)
- `latest_contours` (mtime-based)

These are written into the manifest JSON for downstream coverage report generation.

### Output

- `RAG_MANIFEST_BALANCED.json` (machine-readable)
- `RAG_MANIFEST_BALANCED.md` (human-readable table)

### Verification

```bash
node tools/rag/pm-rag-build-manifest.mjs --full --output-dir .planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1
```

Result: 1,783 files, all 8 sources, ~4 seconds.
