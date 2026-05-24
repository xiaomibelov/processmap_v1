# BRANCH_HYGIENE_CHECKLIST

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Run ID:** `20260517T144447Z-92350`

## Current truth

- `pwd`: `/opt/processmap-test`
- branch: `fix/lockfile-sync-test`
- `HEAD`: `5b20bc2d1292f419647238eaf37dac55f9315942`
- `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- staged diff: none
- tracked dirty files: 20 frontend files
- untracked files: planning artifacts, screenshots, tools, generated/public assets, process notes, agent folders

## Classification gates

| Gate | Required before release |
|---|---|
| Analytics Hub pre-existing | Prove it is required for `Analytics -> Реестр действий` route or split into prior contour |
| Registry redesign | Keep only registry page/panel/components/tests/styles required for this contour |
| Current rework | Keep `.planning/contours/...` and AgentReports as non-product artifacts |
| Unrelated/unsafe | Exclude or move to separate contour before merge/release |

## Unsafe until proven related

- BPMN stage/runtime/orchestration changes.
- InterviewStage/ProcessStage changes not necessary for registry route.
- Legacy BPMN CSS changes.
- RAG/tooling/generated/public/env backup artifacts.
- Raw screenshots/profiles unless intentionally attached as review evidence.

## Verdict

Current checkout is acceptable for Part 2 artifact work only. It is not acceptable as a merge/release source without clean branch isolation from `origin/main`.
