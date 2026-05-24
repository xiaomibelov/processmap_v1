# Rework request

Run ID: `20260519T090224Z-17699`
Contour: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`
Source: `REVIEW_REPORT.md`
Verdict: `CHANGES_REQUESTED`

## Required rework

Rebuild the architecture source map from the canonical checkout:

- workspace: `/Users/mac/PycharmProjects/processmap_canonical_main`
- branch: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`
- base: `origin/main=d805e1c64c1107b9e3fe6854e031694bf741b187`

## Blocking issue

The current artifacts still depend on facts from the old dirty `/opt/processmap-test` workspace. In the clean canonical branch, `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx` does not exist, but the plan and worker reports cite it as current source truth.

## Expected correction

- Remove or rewrite all claims that depend on non-existent canonical files.
- Reclassify Properties Registry as absent/future in the canonical baseline unless a valid canonical source file exists.
- If the Properties Registry comes from another unmerged contour, record that explicit dependency instead of treating it as `origin/main` baseline.
- Regenerate affected docs and recreate `READY_FOR_REVIEW` only after canonical source truth is consistent.
