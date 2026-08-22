# FIX.md — RBAC 5 core features

> This file will be populated during Phase 2 after AUDIT.md is finalized and approved.

## Patch list

| # | Feature | Gap | Patch location | Status |
|---|---------|-----|----------------|--------|
| 1 | Templates | Granular `edit`/`delete` not checked | TBD | pending audit |
| 2 | Sessions | `delete_session` only owner/admin; `patch_session` no `edit` flag | TBD | pending audit |
| 3 | Session versions | `bpmn_restore`/`bpmn_clear` no granular flag check | TBD | pending audit |
| 4 | BPMN elements | node/edge mutations use role-name checks | TBD | pending audit |
| 5 | Notes/mentions | write access uses `can_edit_workspace` role names; no comment ownership check | TBD | pending audit |

## Patch template

For each patch:
- **Motivation:** why the gap is critical.
- **Change:** file and function diff.
- **Backward compatibility:** how existing tests stay green.
- **Test:** test file and test name covering the patch.
