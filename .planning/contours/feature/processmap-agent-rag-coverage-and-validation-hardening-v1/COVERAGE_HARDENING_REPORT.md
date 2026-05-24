# COVERAGE_HARDENING_REPORT

**Contour:** `feature/processmap-agent-rag-coverage-and-validation-hardening-v1`
**Date:** 2026-05-16

---

## Problem

Previous contour used a 500-file capped manifest. Sources were processed in registry order:
1. `project-atlas` (727 files) → filled most of the cap.
2. `planning-contours` (40 contours) → partially excluded.
3. `docs-curated`, `handoff-notes`, `frontend-src`, `backend-src`, `tools-src`, `scripts-src` → rarely included.

This caused:
- q2 (perf contour history) to fail because contour reports were not in sample.
- q4/q5 (policy/path queries) to fail because registry/policy docs competed with generic executor prompts.
- q6 (runtime query) to fail because RUNTIME_NAVIGATION files were drowned by prompts.

## Solution

Implemented `--full` mode in `pm-rag-build-manifest.mjs`:
- No cap; includes all allowed files from all 8 sources.
- Build time: ~4 seconds.
- Index build time: ~10 seconds.
- Index JSON size: ~93 MB.

All thresholds (30s build, 200MB index) are well within limits.

## Source Representation

| Source | Files | Category | Priority |
|--------|-------|----------|----------|
| project-atlas | 260 | project_atlas | critical |
| planning-contours | 399 | contour | critical |
| docs-curated | 124 | docs | high |
| handoff-notes | 11 | docs | normal |
| frontend-src | 713 | code | critical |
| backend-src | 173 | code | critical |
| tools-src | 23 | code | normal |
| scripts-src | 80 | code | normal |

**No source dominates.** `project-atlas` contributes 260/1,783 = 14.6%.

## Per-Source Stats

See `RAG_COVERAGE_REPORT.json` and `.md` for detailed per-source file counts, chunk counts, class distributions, top contours, and latest contours.

## Verification

- [x] All 8 sources represented in manifest.
- [x] Coverage report generated.
- [x] No source exceeds 50% of total.
