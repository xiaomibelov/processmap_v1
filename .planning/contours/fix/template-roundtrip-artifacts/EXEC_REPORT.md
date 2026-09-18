# EXEC REPORT — fix/template-roundtrip-artifacts

## Goal

Eliminate silent artifact loss in template copy/paste and template apply round-trips:
E1 (crash / raw `isGeneric` error on tab switch after apply), E2 (dataStore / dataObject /
data associations dropped), E3 (unsafe BPMN types sent to backend as plain `shape.create`).
Plus UX copy hardening (§4) and H1 verification (stage org template pack round-trip semantics).

## Implemented scope

- **E1 semantic sanitizer**: unknown semantic namespaces no longer restore as descriptor-less moddle objects; safe `bpmn/camunda/zeebe/pm` behavior preserved.
- **Safe saveXML + UX**: one bounded strip/recovery attempt, explicit warning on stripped template data, stripped XML validated before return, no raw JS errors in user copy.
- **Native BPMN transfer capture**: `pack.transfer` stores `bpmnXml` + copyPaste `nativeTree`; source namespace prefixes are bound; capture failure falls back to pack-only with `transferWarnings`.
- **Native-tree apply with pack fallback**: apply reuses bpmn-js paste id regeneration and remap; validates transfer XML; falls back to pack with `template_native_tree_fallback`; partial entry/exit remap is loudly warned.
- **E3 full-save guards**: unsafe BPMN artifact types require full-save for create and update paths; backend refuses unsafe shape/connection ops with explicit `full_save_required_for_bpmn_type`.
- **Full-save fallback status copy**: clarified copy, no raw error strings surfaced.
- **E2E matrix**: template artifact roundtrip matrix written and statically checked; runtime execution blocked by local stack.
- **H1 verdict doc**: BLOCKED, awaiting owner stage credentials; credential-free runbook committed.

## Tests / evidence

| Suite | Result |
|---|---|
| `node --test` templateSemanticPayload + templateBpmnXmlTransfer + templatePackAdapter + commandToOps + saveBeforeSwitchDiagnostics + saveStatusSlotModel.ops-stages | **134/134 pass** after rebase |
| Backend `pytest tests/test_ops_applier.py -q` (.venv) | **13 passed** (1 pre-existing DeprecationWarning) after rebase |
| `npm run build` | **✓ built in 12.71s** after rebase (existing chunk-size/Browserslist warnings only) |
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

- Branch: `fix/template-roundtrip-artifacts` (rebased on `origin/main @ 771c3703`; ahead 18)
- Diff vs `origin/main...HEAD`: 21 files, **+2333 / −86**
- Tree clean except untracked `.vite/` (build cache, ignored from commit)
- HEAD at report time: `a0abd298` fix(save): require full save for unsafe BPMN types in updateProperties/updateLabel

## Risks / rollback

| Risk | Rollback |
|---|---|
| Native-tree apply loses exact DI/waypoints | Keep `bpmnXml` validation; disable `pack.transfer` branch via feature flag / fallback to pack |
| copyPaste tree service-field bloat | JSON-serializability validated pre-save; capture failure → pack fallback |
| Pool/lane inconsistency | Explicit warning + full-save; remove nativeTree branch if prod telemetry disagrees |
| Backend rejects previously accepted ops | 422 handled as full-save in frontend; revert backend validation only on prod evidence |
| H1 unresolved | Do not deploy prod until H1 verdict or explicit owner acceptance |

## Handoff

Status: **ready-for-PR** (code-level). Final whole-branch review: PASS_FOR_PR; final Important fix re-reviewed clean.
Before merge/release: run e2e matrix on a live stack and obtain H1 stage verdict. PR may be opened as draft/ready for review with these blockers explicitly listed; merge/deploy remain blocked until blockers and user approve are resolved.
