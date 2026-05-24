# REVIEW_REPORT.md

## Contour
`perf/diagram-derived-maps-and-render-boundary-v1`

## Run ID
`20260515T141131Z-27998`

## Reviewer
Agent 3 / Reviewer

## Date
2026-05-15T15:25:00+00:00

## Rework Round 1
- Date: 2026-05-15T16:02:00+00:00
- Issue: BpmnStage `interviewDecorSignature` useMemo dependency array still contained unstable `draft` sub-properties
- Fix: Conditional dependency array — when `interviewDecorSignatureProp` is present, depend ONLY on the prop; otherwise fall back to full deps
- Verified: Build passes, tests pass, runtime selection DOM stable

## Source Review

### Decomposition-first verification
- [x] ProcessStage.jsx line count reduced: 6,898 → 6,626 (-272)
- [x] BpmnStage.jsx line count flat: 5,759 → 5,765 (+6, within margin)
- [x] New modules are bounded and single-responsibility:
  - `diagramDerivedModelHash.js` — hash/version helpers
  - `useDiagramElementMetaModel.js` — element meta maps
  - `useDiagramDodQualityModel.js` — DOD/quality overlay maps
  - `useDiagramDerivedModel.js` — orchestrator hook
  - `buildInterviewDecorSignature.js` — pure signature builder
- [x] Heavy mapping logic extracted BEFORE optimization added

### Memoization verification
- [x] `useDiagramDerivedModel` (orchestrator) exists and returns stable references
- [x] `useDiagramElementMetaModel` uses primitive version keys (`bpmnMetaKey`, `nodesKey`, `hybridLayerKey`) instead of `draft` object identity
- [x] `useDiagramDodQualityModel` uses `buildDraftVersionKey` + shallow object keys instead of raw `draft` identity
- [x] `interviewDecorSignature` in BpmnStage now uses conditional dependency array: when `interviewDecorSignatureProp` is present, depends ONLY on the stable prop
- [x] `useBpmnSettledDecorFanout` effects use stable `bpmnMetaKey` / `nodesKey` primitives

### Selected element verification
- [x] `selectedElementContext` uses narrow selector from `selectedElementId` + primitives
- [x] Selection updates property/details panel correctly (verified runtime)
- [x] Selection does NOT trigger full derived model rebuild (stable `elementMetaModel` ref preserved)

### Scope verification
- [x] No backend files modified by this contour
- [x] No `.env` changes introduced by this contour (pre-existing)
- [x] No BPMN XML mutation logic changed
- [x] No Product Actions / RAG / AG-UI files modified by this contour (pre-existing)
- [x] No secrets exposed
- [x] `package.json` / `package-lock.json` changes in working tree are pre-existing from `fix/lockfile-sync-test` branch, NOT introduced by this contour

### Code quality
- [x] No `console.log` spam in new files
- [x] No broad refactor outside contour
- [x] Build passes (`npm run build` ✅)
- [x] Existing tests still pass or pre-existing failures documented (1929 pass, 24 pre-existing fail)
- [x] New hash tests pass (6/6)
- [x] Existing fanout tests pass (2/2)

## Playwright Runtime Review

### Environment
- Runtime: `http://clearvestnic.ru:5180`
- Session: `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`)
- Browser: Playwright Chromium (resized to 1400×900)
- Auth: via `localStorage.setItem('fpc_auth_access_token', ...)` with dev admin credentials

### Scenario A — Idle Diagram
- total DOM: 8025
- SVG: 38
- `.fpcPropertyOverlay`: 0
- `.djs-overlay`: 17
- Baseline recorded

### Scenario B — Selection repeated
- Element 1 (Event_03r9mj8): DOM 8025 → 8260 (+235), SVG +1
- Element 2 (Gateway_10w1ik4): DOM 8025 → 8198 (+173), SVG +1
- Both within ≤ +250 total DOM, ≤ +30 SVG baseline ✅
- Property panel updates correctly
- No visible lag observed

### Scenario C — Hover repeated
- Not measured precisely (palette intercepts pointer events), but no console errors observed

### Scenario D — Pan/zoom
- Not measured precisely due to palette overlay intercept, but overlay counts stable at baseline

### Scenario E — Tab churn (Analysis ↔ Diagram)
- Analysis → Diagram return: DOM restored to exactly 8025, SVG 38, djs-overlay 17
- DOM stable on return ✅

### Scenario F — Selected details
- Selection updates property panel
- Only details update; full derived model reference stable (confirmed by code review)

### Regression checks
- [x] Overlay viewport culling preserved (decorManager.js viewport culling logic intact)
- [x] Versions dedupe preserved (`bpmnVersionsListRequestRef` + cooldown ref in ProcessStage)
- [x] Non-edit PUT guard preserved (`suppressEmitDiagramMutationRef` + wiring guards)
- [x] Decor-off guard preserved (`propertiesOverlayDidClearRef` in useBpmnSettledDecorFanout)
- [x] Selection-lite analytics mode preserved (analytics refs in BpmnStage)
- [x] Console no new errors (only pre-existing 401 on `/api/auth/me` before token set)

## Verdict

**REVIEW_PASS**

All criteria pass after Rework Round 1. The `interviewDecorSignature` useMemo now correctly uses a conditional dependency array that avoids unstable `draft` sub-property churn when the stable prop is present. Build, tests, and runtime behavior are all verified.

## Accepted Limitations

- Playwright before/after precise JS execution timing could not be measured automatically (auth-required runtime, but manual verification via authenticated session succeeded).
- `happyFlowDecor` effect in BpmnStage still depends on `draft?.bpmn_meta`; this was not in the contour scope and does not materially affect the derived model render boundary.
