# Rework request

Run ID: `20260519T090224Z-17699`
Contour: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`
Verdict: `CHANGES_REQUESTED`

## Required rework

1. Use only canonical source truth:
   - workspace `/Users/mac/PycharmProjects/processmap_canonical_main`
   - remote `git@github.com:xiaomibelov/processmap_v1.git`
   - branch `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`
   - base `origin/main`

2. Rebuild the current source map from that checkout.

3. Correct all artifacts that treat `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx` as existing baseline source. It is not present in canonical source.

4. If Properties Registry is an unmerged dependency, state that explicitly and keep the API/roadmap language dependency-aware.

5. Regenerate affected architecture artifacts and `SOURCE_REVIEW_HANDOFF.md`.

## Do not change

- Product runtime code.
- Backend/frontend package files.
- Schema/migrations.
- Deploy, PR, merge, or release state.

