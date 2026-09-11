# PLAN — Prod runtime/source truth alignment

**Contour:** `audit/prod-runtime-source-truth-20260615`
**Date:** 2026-06-15
**Agent role:** Executor (retroactive audit + deploy)

## Goal
Make the deployed ProcessMap prod on `http://clearvestnic.ru:5177` match the canonical git state on `origin/main`.

## RAG preflight summary
- **RAG manifest:** `/opt/processmap-test/.agents/rag-index/work-20260615T162609Z/RAG_MANIFEST_BALANCED.json`
- **RAG size:** 2897 total files, 2855 indexed entries, ~242 MB search index.
- **Query:** `prod server error git truth deploy`
- **Top findings:**
  - Prior contour `premium-urgent-task-analytics-ui-ux-addi-mqdketwb` already documented source/runtime truth for `/opt/processmap-test` and `/root/processmap_v1` gateway source.
  - AGENTS.md release flow policy: branch → push → PR → user approval → merge → stage verify → manual prod deploy.
  - RAG is read-only; no auto-mutation allowed.

See `RAG_PREFLIGHT_PLANNER.md` for full output.

## Evidence collected
- `pwd`: `/root/processmap_v1`
- `git remote -v`: `new-origin -> git@github.com:xiaomibelov/processmap_v1.git`
- `git branch --show-current`: `fix/discussion-element-pencil-overlay`
- `git rev-parse HEAD`: `38d4b3664e4de30733cc454fb6e006cce75d7eb5`
- `git rev-parse new-origin/main`: `38d4b3664e4de30733cc454fb6e006cce75d7eb5`
- Runtime: `processmap_v1-api-1` and `processmap_v1-gateway-1` healthy on ports `8011` and `5177`.

## Findings
1. Two worktrees existed: `/opt/processmap-test` (branch `feature/analytics-fields-export`, HEAD `4e8c0939`) and `/root/processmap_v1` (branch `fix/discussion-element-pencil-overlay`).
2. Docker Compose was running from `/opt/processmap-test` but volumes mounted `/root/processmap_v1/backend` and `/root/processmap_v1/deploy/nginx/default.conf` into containers.
3. Frontend served by `gateway` was built from commit `540dd6ad`; `/version` reported `540dd6ad`; git HEAD was `5337b733`.
4. `build-info.json` in the gateway was stale (`8fa9c6b7`) and did not match the actual build.

## Actions taken
1. Fetched `new-origin/main` → `24c529c6` (PR #388).
2. Merged `new-origin/main` into local branch → `38d4b366`.
3. Pushed `38d4b366` to `new-origin/main`.
4. Ran `./deploy/deploy.sh` from `/root/processmap_v1`.
5. Verified `/version` and frontend JS `VITE_BUILD_ID` now report `38d4b366`.

## Verification
- `curl http://clearvestnic.ru:5177/version` → `38d4b366`
- `curl http://clearvestnic.ru:8011/version` → `38d4b366`
- `docker ps` shows `processmap_v1-api-1` and `processmap_v1-gateway-1` healthy.

## Risks / follow-up
- `build-info.json` remains stale (`8fa9c6b7`) because it is generated separately from `vite build`. Recommend regenerating it from the same `BUILD_ID` used by `/version`.
- This work was done retroactively outside the normal PR/approval flow. Future runtime/source fixes must follow AGENTS.md §7.
