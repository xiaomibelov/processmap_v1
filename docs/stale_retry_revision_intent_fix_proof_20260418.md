# Stale-retry revision-intent fix proof (2026-04-18)

## Before (proven from stage audit)
- `Создать новую ревизию` clean path: request persisted as `source_action=publish_manual_save`.
- stale-retry path: first request had publish intent, replay request could run without publish marker.
- persisted result could end as `manual_save`, losing explicit revision intent.

## After (this slice)
- queued replay reason now preserves original save intent via `:queued` suffix.
- `publish_manual_save` replay becomes `publish_manual_save:queued`.
- `manual_save` replay becomes `manual_save:queued`.
- API canonicalization keeps `source_action` from these prefixed reasons.

## Targeted tests
- `createBpmnCoordinator.precedence.test.mjs`
  - queued replay keeps publish intent marker.
  - conflict-like retry branch keeps publish intent marker.
  - queued replay keeps manual save intent marker.
  - existing stale-conflict tests still enforce no hidden retry for explicit 409 conflict.
- `api.bpmn.test.mjs`
  - `publish_manual_save:queued` -> `source_action=publish_manual_save`.
  - `manual_save:queued` -> `source_action=manual_save`.

## Command
- `node --test frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.precedence.test.mjs frontend/src/lib/api.bpmn.test.mjs`
- Result: `18 passed, 0 failed`.

## Conclusion
- Intent is no longer downgraded by queued replay naming.
- Explicit revision action remains distinguishable from ordinary session save in replay branch.
