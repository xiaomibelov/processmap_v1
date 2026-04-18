# Stale-Conflict UX Contract Proof Pack (2026-04-18)

## Scope
- [proven] Narrow slice only: stale-conflict UX contract hardening.
- [proven] No passive watcher redesign.
- [proven] No save/revision model redesign.
- [proven] No telemetry slice changes.

## Before
- [proven] Stage evidence: stale write could produce `409` followed by `200` retry in same user flow while expected conflict modal was not consistently visible.
- [proven] UI contract ambiguity: mixed observable behavior (`conflict modal` vs `silent recover`) for stale path.
- [proven] Source truth artifacts:
  - `/tmp/full_stage_save_contour_stage_verdict_20260418.md`
  - `/tmp/full_stage_save_contour_rerun_1776528186670/full_stage_save_contour_rerun_summary.json`
  - `docs/staging_save_conflict_contract_audit_20260417.md`

## Selected Policy
- [proven] Selected policy: **explicit deterministic silent-retry contract with fail-closed conflict modal fallback**.
- [proven] Rule:
  - On stale conflict (`DIAGRAM_STATE_CONFLICT` / HTTP 409), runtime performs exactly one automatic retry in the same save intent lane.
  - If retry succeeds: no conflict modal path is surfaced; user gets explicit non-blocking success meaning.
  - If retry fails: conflict state is surfaced (existing modal path remains).
- [proven] Publish/save intent preservation is kept because retry uses the same persist reason.

## Implementation Delta
- [proven] `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js`
  - Added stale conflict detector.
  - Added deterministic one-shot retry loop before emitting terminal fail.
  - Added trace event `SAVE_STALE_CONFLICT_RETRY`.
  - Added lifecycle payload flags:
    - `stale_retry_applied`
    - `stale_retry_attempts`
  - Added result flags:
    - `staleRetryApplied`
    - `staleRetryAttempts`
- [proven] `frontend/src/components/process/BpmnStage.jsx`
  - Propagates stale-retry flags from coordinator result to upstream save result.
- [proven] `frontend/src/components/ProcessStage.jsx`
  - Manual-save UI outcome now consumes `saved.staleRetryApplied`.
- [proven] `frontend/src/features/process/navigation/saveUploadStatus.js`
  - Normalizes stale-retry lifecycle flags.
  - Persisted badge now has explicit synced-after-retry wording when applicable.
- [proven] `frontend/src/features/process/navigation/manualSaveOutcomeUi.js`
  - Adds explicit non-blocking user message for stale auto-retry success.

## Targeted Tests
- [proven] `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.precedence.test.mjs`
  - New test: stale `409 -> 200` resolves with deterministic auto-retry and **no `SAVE_PERSIST_FAIL`**.
  - New test: stale `409 -> 409` ends in fail path with `stale_retry_attempts=1`.
- [proven] `frontend/src/features/process/navigation/saveUploadStatus.test.mjs`
  - New test: persisted badge reflects deterministic stale-retry contract.
- [proven] `frontend/src/features/process/navigation/manualSaveOutcomeUi.test.mjs`
  - New test: manual save surfaces explicit non-blocking stale-retry message.
- [proven] `frontend/src/components/ProcessStage.companion-sync-severity.test.mjs`
  - Guard: `staleRetryApplied` is passed into manual-save outcome resolver.

## Test Proof (local)
- [proven] Command:
  - `cd frontend && node --test src/features/process/bpmn/coordinator/createBpmnCoordinator.precedence.test.mjs src/features/process/navigation/saveUploadStatus.test.mjs src/features/process/navigation/manualSaveOutcomeUi.test.mjs src/components/ProcessStage.companion-sync-severity.test.mjs`
  - Result: `20 passed, 0 failed`.
- [proven] Command:
  - `cd frontend && node --test src/features/process/bpmn/coordinator/createBpmnCoordinator.save-skip.test.mjs src/features/process/bpmn/coordinator/createBpmnCoordinator.single-writer.test.mjs`
  - Result: `5 passed, 0 failed`.

## After
- [proven] Stale conflict UX contract is deterministic in runtime layer:
  - resolved stale conflict => explicit silent-retry success path;
  - unresolved stale conflict => explicit conflict fail/modal path.
- [unknown] Stage rerun confirmation for this exact slice is pending execution after merge/deploy.
- [hypothesis] This removes modal/silent hybrid ambiguity seen in prior stage rerun for stale path.
