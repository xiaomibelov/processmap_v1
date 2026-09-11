# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: commit-current-build
- **area/query**: commit push current build state / commit push fix/bpmn-drilldown-ui current build state
- **generated_at**: 2026-06-19T09:11:33.141Z

## Structured Facts

### Runtime Facts
- **current_git_branch**: fix/lockfile-sync-test (test, high)

### Agent Rules
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)

### Contour Facts
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)

### Bottlenecks
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

### Validation Facts
- RAG coverage hardening summary → PASS (1,803 files indexed across 8 sources; 7/7 validation queries PASS; previous state was 3/7 on 500-file sample)
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- What happened in perf diagram modeler drag hot path pointermove suppression? → PASS (7/7 PASS on full manifest with improved ranking)
- What are current Diagram lag bottlenecks? → PASS (7/7 PASS on full manifest with improved ranking)
- What is forbidden for RAG? → PASS (7/7 PASS on full manifest with improved ranking)
- Which paths should be indexed? → PASS (7/7 PASS on full manifest with improved ranking)
- What is current ProcessMap test runtime? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Build Verification
- **score**: 27.527
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/viewport-persistence/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## *B*ui*ld* Verification
- `npm run *b*ui*ld*`: ✅ passes with 0 errors - `frontend/dist/` exists and contains *current* *b*ui*ld* artifacts - Served *b*ui*ld* on `:5177` was stale (*commit* `f4966da7`); reviewer reb*ui*lt from *current* HEAD (`2a0a99c8`) and copied to gateway container - Post-deploy *b*ui*ld*-info confirms: branch `*fix*/viewport-persistence`, sha `2a0a99c8`, timestamp `2026-06-05T21:46:04Z`
```

### #2 — 2.7 Not Allowed
- **score**: 26.794
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/diagram-5180-version-proof-and-canvas-lag-regression-v1/EXECUTOR_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match
- **snippet**:
```
- Backend changes. - Package changes unless *b*ui*ld* flow explicitly req*ui*res. - *BPMN* XML mutation. - Product Actions / RAG / AG-*UI*. - Stage/prod deploy. - *Commit*/*push*/PR.
```

### #3 — Required to Unblock
- **score**: 26.435
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/api-patch-version-handling/REVIEW_BLOCKED.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d
- **snippet**:
```
## Req*ui*red to Unblock
- Deploy `*fix*/api-patch-version-handling` *b*ui*ld* (*commit* `c223078a`) to stage (`clearvestnic.ru:5177`) - Re-run functional gate: 1. Open session with saved *BPMN* 2. Toggle drawio visibility 3. Verify `PATCH /api/sessions/{id}/*bpmn*_meta` response contains `diagram_*state*_version` 4. Drag a *BPMN* node 5. Verify subsequent `PATCH /api/sessions/{id}` returns 200 (not 409) 6. Repeat cycle 3 times - Re-request review once runtime proof is available
```

### #4 — 6. Post-Review Actions
- **score**: 25.568
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/product-actions-registry-ui-emergency-v1/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_30d
- **snippet**:
```
- Создан `REVIEW_PASS`. - PR в stage **не создан** — отсутствует GitHub-аутентификация (`gh auth status` → not logged in) и SSH-ключи для `git *push*`. Для создания PR необходимо вручную выполнить: ```bash git add frontend/src/features/analytics/ProductActionsRegistryPanel.jsx frontend/src/styles/tailwind.css git *commit* -m "*fix*: emergency registry *UI* — clean metrics, horizontal filters, visible table" git *push* origin cleanup/analytics-single-source-of-truth-v1 gh pr create --base main --head cleanup/analytics-single-source-of-truth-v1 \ --title "*fix*: emergency registry *UI* — clean metrics, horizo
```

### #5 — step_02_fix_docker_build_v1.sh
- **score**: 25.427
- **path**: `/opt/processmap-test/scripts/step_02_fix_docker_build_v1.sh`
- **source/category**: scripts-src / code
- **why_matched**: path_match, heading_match, category_role
- **snippet**:
```
## step_02_*fix*_docker_*b*ui*ld*_v1.sh
set -euo pipefail cd "$(git rev-parse --show-toplevel)" TS="$(date +%F_%H%M%S)" git tag -a "cp/step_02_start_${TS}" -m "checkpoint: step_02 start (${TS})" >/dev/null 2>&1 || true echo "== git ==" git status -sb || true git show -s --format='%ci %h %d %s' HEAD || true BR="$(git branch --show-*current*)" if [ "$BR" != "feat/mvp-runner-v1" ]; then echo "wrong branch: $BR" false fi if [ -n "$(git status --porcelain)" ]; then git stash *push* -u -m "wip: before step_02 *fix* docker *b*ui*ld*" fi mkdir -p workspace/processes : > workspace/.keep : > workspace/processes/.keep c…
```

### #6 — Checks performed
- **score**: 25.092
- **path**: `/opt/processmap-test/.planning/contours/stage5/test-git-fix-20260612T231759Z/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, recent_14d
- **snippet**:
```
[contour: test-git-*fix*-20260612T231759Z] 1. **Branch**: *current* branch is `*fix*/session-presence-test-timeout`. 2. ***Commit* count**: `git log origin/main..HEAD --oneline` shows exactly one *commit* (`2d3f9cd2`). 3. ***Commit* scope**: `git show --stat HEAD` changes only: - `frontend/src/features/process/stage/presence/useSessionPresence.js` - `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs` 4. **Clamp removal**: `useSessionPresence.js` no longer uses `Math.max(5000, ...)`. 5. ***Commit* message**: follows conventional-*commit* style: `*fix*(tests): remove 5000 ms heartbeat clamp…
```

### #7 — Checks performed
- **score**: 25.092
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/stage5/test-git-fix-20260612T231759Z/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d
- **snippet**:
```
1. **Branch**: *current* branch is `*fix*/session-presence-test-timeout`. 2. ***Commit* count**: `git log origin/main..HEAD --oneline` shows exactly one *commit* (`2d3f9cd2`). 3. ***Commit* scope**: `git show --stat HEAD` changes only: - `frontend/src/features/process/stage/presence/useSessionPresence.js` - `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs` 4. **Clamp removal**: `useSessionPresence.js` no longer uses `Math.max(5000, ...)`. 5. ***Commit* message**: follows conventional-*commit* style: `*fix*(tests): remove 5000 ms heartbeat clamp and speed up useSessionPresence tests`. 
```

## Required Gates
- [ ] Source/runtime truth confirmed before implementation
- [ ] Bounded contour scope respected
- [ ] No product runtime changes unless explicitly allowed
- [ ] No secrets printed in output
- [ ] No auto-mutation of BPMN XML or Product Actions
- [ ] RAG read-only boundary respected
- [ ] Runtime evidence collected for Agent 3

## Warnings
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "commit push current build state" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "commit push current build state" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "commit-current-build" --area "commit push current build state" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
