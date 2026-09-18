# EXEC REPORT — fix/template-roundtrip-artifacts

## Goal

Eliminate silent artifact loss in template copy/paste and template apply round-trips:
E1 (crash / raw `isGeneric` error on tab switch after apply), E2 (dataStore / dataObject /
data associations dropped), E3 (unsafe BPMN types sent to backend as plain `shape.create`).
Plus UX copy hardening (§4) and H1 verification (stage org template pack round-trip semantics).

## Implemented scope

- **Native BPMN XML transfer capture** (`0b2ad2e0`): template transfer captures full `bpmnXml`
  native tree alongside legacy copyPaste tree; ns prefixes bound at capture.
- **Native tree apply with pack fallback** (`dc534ffb`): apply prefers `bpmnXml` native tree;
  falls back to pack with explicit `native_entry_exit_fallback` warning; createdNodes shape stabilized.
- **Transfer fragment hardening** (`008549b5`): JSON-serializability validated before save;
  capture failure returns `template_transfer_capture_failed` and falls back to pack.
- **Full-save fallback status copy** (`f5fd3dfb`): clarified copy, no raw error strings surfaced.
- **E2E matrix** (`adef77d7`, `9fc8c789`): template artifact roundtrip matrix on real XML
  workbench tab (scenario 1 switched from mock to real tab).
- **Backend guard** (earlier commits): unsafe BPMN types refused; 422 on plain `shape.create`
  of unsupported types; frontend guard deployed together, 422 handled as full-save.
- **H1 verdict doc** (`965e0d9e`): BLOCKED, awaiting owner stage credentials.

## Tests / evidence

| Suite | Result |
|---|---|
| `node --test` templateSemanticPayload + templateBpmnXmlTransfer + templatePackAdapter + commandToOps + saveBeforeSwitchDiagnostics + saveStatusSlotModel.ops-stages | **124/124 pass** |
| Extended save suite: `opsOutbox/*.test.mjs` + `save/*.test.mjs` | **192/192 pass** |
| Backend `pytest tests/test_ops_applier.py -q` (.venv) | **13 passed** (1 pre-existing DeprecationWarning) |
| `npx vite build` | **✓ built in 11.17s** (only chunk-size warnings) |
| E2E specs `template-roundtrip-artifacts.spec.mjs`, `template-apply-artifacts.spec.mjs` | written; **runtime execution blocked — local stack down** |

## Known blockers

1. **Runtime e2e (Task 10):** local Docker stack is down; playwright specs not executed
   against live app. No Docker was started per instruction.
2. **H1 stage verification (Task 11):** BLOCKED — owner stage credentials unavailable
   (`E2E_USER`/`E2E_PASS`/`PROCESSMAP_STAGE_*` all UNSET). Verdict and credential-free
   runbook committed in `H1_VERDICT.md` + `evidence/h1-dump-runbook.sh`.
   No stage mutation performed; release to prod must stay blocked until H1 verdict or
   explicit owner acceptance of code-level verdict.

## Git proof

- Branch: `fix/template-roundtrip-artifacts` (ahead of `origin/main` by 16 commits)
- Diff vs `origin/main...HEAD`: 19 files, **+2186 / −84**
- Tree clean except untracked `.vite/` (build cache, ignored from commit)
- HEAD at report time: `965e0d9e` docs(templates): H1 verdict BLOCKED awaiting owner stage credentials

## Risks / rollback

| Risk | Rollback |
|---|---|
| Native-tree apply loses exact DI/waypoints | Keep `bpmnXml` validation; disable `pack.transfer` branch via feature flag / fallback to pack |
| copyPaste tree service-field bloat | JSON-serializability validated pre-save; capture failure → pack fallback |
| Pool/lane inconsistency | Explicit warning + full-save; remove nativeTree branch if prod telemetry disagrees |
| Backend rejects previously accepted ops | 422 handled as full-save in frontend; revert backend validation only on prod evidence |
| H1 unresolved | Do not deploy prod until H1 verdict or explicit owner acceptance |

## Handoff

Status: **ready-for-final-review** (code-level). Reviewer: fill `REVIEW_REPORT.md`.
Before merge/release: run e2e matrix on a live stack, obtain H1 stage verdict.
