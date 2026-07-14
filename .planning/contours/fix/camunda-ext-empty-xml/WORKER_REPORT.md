# fix/camunda-ext-empty-xml — Executor Report

## Goal
Eliminate `[CAMUNDA-EXT-SAVE] status=error error=empty_xml metaDiff=true` when saving Camunda extension properties while `draft.bpmn_xml` is not yet loaded.

## Root cause
`persistCamundaExtensionsViaCanonicalXmlBoundary` built the canonical XML before checking the meta-only PATCH path. With an empty `currentXmlRaw` the resulting `nextXml` was empty, so the boundary failed with `empty_xml` before reaching `PATCH /sessions/meta`.

## Fix
- If `forceMetaPatch === true` or `currentXml` is empty, the boundary now goes directly to `PATCH /sessions/meta` (or `/sessions/properties`) without building XML.
- Empty XML + no meta diff → skipped.
- Property-only payload no longer contains `bpmn_xml`.

## Files changed
- `frontend/src/features/process/camunda/camundaExtensionsSaveBoundary.js`
- `frontend/src/features/process/camunda/camundaExtensionsSaveBoundary.test.mjs`

## Verification
- `node --test src/features/process/camunda/camundaExtensionsSaveBoundary.test.mjs` → 18 passed.
- `node --test src/app/camundaPropertiesSave.architecture-contract.test.mjs` → 1 passed.
- `npm run build` → ✅.

## Deploy / runtime proof
- PR #424 merged into `main` (merge commit `2e1ee9b4`).
- GitHub Actions `Deploy to Stage` run `28281004773` succeeded.
- Stage `https://stage.processmap.ru/build-info.json` reports `sha: 2e1ee9b4`, `branch: main`, `env: stage`.
- Playwright smoke: login page loads, no JS runtime errors, served bundle fingerprint matches `2e1ee9b4`.

## Notes / risks
- End-to-end `[CAMUNDA-EXT-SAVE] status=success` browser-console proof requires an authenticated session; not performed due to missing stage credentials.
- Backend was not changed: `PATCH /api/sessions/{id}/meta` already accepts `bpmn_meta_json` without `bpmn_xml`.
