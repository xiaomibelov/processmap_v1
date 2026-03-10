# Draw.io Regression Gate

This document defines the compact, repeatable C10 regression gate for the draw.io boundary.

## Authoritative set

### Backend

- `PYTHONPATH=backend python3 -m unittest backend.tests.test_bpmn_meta -q`

Contracts held:
- `C1 BPMN-First`
- backend shared `bpmn_meta` preservation around draw.io-only patch

### Frontend unit/invariant

- `cd frontend && node --test src/features/session-meta/sessionMetaBoundary.test.mjs src/features/process/drawio/controllers/useDrawioEditorBridge.test.mjs src/features/process/drawio/runtime/drawioOverlayPointerOwnership.test.mjs src/features/process/drawio/runtime/useDrawioPersistHydrateBoundary.test.mjs src/features/process/drawio/domain/drawioVisibilitySelectionContract.test.mjs`

Contracts held:
- `C1 BPMN-First` frontend write envelope
- `overlay pointer ownership / blank-space event gating`
- `C5/C6 lifecycle minimum`
- `C7 visibility / selection / opacity`
- `C9 persist sequencing`

### Browser smoke

- `E2E_DRAWIO_SMOKE=1 ./scripts/e2e_enterprise.sh e2e/drawio-fresh-session-closure.spec.mjs e2e/drawio-overlay-runtime-entry-contract.spec.mjs e2e/drawio-browser-runtime-anchoring.spec.mjs e2e/drawio-stage1-boundary-smoke.spec.mjs e2e/drawio-ghost-materialization-boundary.spec.mjs`

Contracts held:
- `C2 Entry-Point`
- `C4 Anchoring`
- `viewport transform / scale parity for fresh runtime-created draw.io objects`
- `C5/C6 lifecycle minimum`
- `C7 visibility / selection / opacity`
- `C8 materialization boundary`
- `fresh-session viewport pointer ownership truth`

## Recommended entrypoint

- `./scripts/drawio_regression_gate.sh`
  - backend + frontend unit/invariant gate
- `./scripts/drawio_regression_gate.sh --browser`
  - backend + frontend unit/invariant gate
  - authoritative browser smoke subset

## What is intentionally outside the authoritative gate

These checks may still be useful for forensics, evidence gathering, or extended confidence, but they are not required for the minimal C10 gate:

- perf evidence / browser trace specs
- visual scale parity evidence
- runtime placement breadth checks beyond the minimal smoke
- hybrid-layer-only specs
- draw.io forensics scripts and factpacks

## Environment notes

- Browser smoke uses `scripts/e2e_enterprise.sh`, which can start frontend/backend locally if they are not already running.
- Browser smoke is slower and more environment-sensitive than backend/unit coverage. Treat it as authoritative for user-visible boundary behavior, not as the fastest inner-loop command.
- The minimal default gate is backend + frontend unit/invariant coverage. Use browser smoke before merging draw.io boundary work.
