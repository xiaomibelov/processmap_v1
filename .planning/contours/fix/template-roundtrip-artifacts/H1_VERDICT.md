# H1 Verdict — stage org template pack round-trip semantics

## Status: BLOCKED — awaiting owner stage credentials

## What happened
Owner stage credentials are **not available** in this environment:
- `E2E_USER` — UNSET
- `E2E_PASS` — UNSET
- `PROCESSMAP_STAGE_EMAIL` — UNSET
- `PROCESSMAP_STAGE_PASSWORD` — UNSET

A prior audit found no valid bearer token. Therefore the H1 dump was **NOT performed**:
`evidence/h1-template-pack.json` **does not exist** and is intentionally not fabricated.
Only this verdict and a credential-free runbook (`evidence/h1-dump-runbook.sh`) are committed.

## Commands to run after owner provides credentials

```bash
cd server-backup/opt/processmap-test-worktrees/fix-template-roundtrip-artifacts-v1
export E2E_USER="..." E2E_PASS="..."        # or PROCESSMAP_STAGE_EMAIL / PROCESSMAP_STAGE_PASSWORD
bash .planning/contours/fix/template-roundtrip-artifacts/evidence/h1-dump-runbook.sh
# then update this file with the verdict below
```

The runbook logs in (no secret output), lists `GET /api/templates?scope=org&limit=100`,
saves `evidence/templates-org.json`, dumps the newest pack to
`evidence/h1-template-pack.json`, and prints classification hints. Exit codes:
`0` ok, `2` missing credentials, `3` login failed (invalid credentials), `4` no org templates.

## Classification criteria

Compare pack `created_at` against deploy time of PR #995 (full-save/round-trip fix; deployed to stage ~2026-09):

- `legacy_pack` — pack `created_at` predates the #995 stage deploy. Its payload semantics
  (`isGeneric` artifacts, dropped `dataInputAssociation`/pool-lane/TextAnnotation round-trips)
  reflect the old serializer. Action: re-capture — create a replacement template from an
  equivalent current selection, then verify apply → save → F5 persistence end-to-end.
- `new_pack_with_unknown_semantics` — pack `created_at` is after the #995 deploy, but the
  payload still contains markers of unknown/lossy semantics (e.g. `isGeneric`, unresolved
  artifact refs). Action: treat as a separate gap; analyze which round-trip path produced it
  before re-capture.
- `current_gap_confirmed` — pack is new yet a round-trip element known to be transferred
  post-#995 (`dataInputAssociation`, `dataStoreReference`, participant/lane, TextAnnotation +
  Association) is absent from the pack despite being present in the source selection, with no
  warning copy. Action: this is a live product bug; route back to the fix contour.

## Open items
- [ ] Run the runbook with owner credentials.
- [ ] Fill in verdict (`legacy_pack` / `new_pack_with_unknown_semantics` / `current_gap_confirmed`) with `created_at` vs #995 deploy time.
- [ ] If `legacy_pack`: re-capture replacement template and verify apply/save/F5.
