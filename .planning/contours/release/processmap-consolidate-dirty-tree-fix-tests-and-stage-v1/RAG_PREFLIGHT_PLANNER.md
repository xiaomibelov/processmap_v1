# RAG Preflight Planner

- run_id: `20260521T090400Z-76203`
- contour: `release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1`
- generated_by: `processmap-agent-pane.sh`
- generated_at: `2026-05-21T09:04:19Z`
- command: `node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1" --area "ProcessMap planning context release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1" --format md --top-k 5`

# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1
- **area/query**: ProcessMap planning context release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1
- **generated_at**: 2026-05-21T09:04:14.676Z

## Structured Facts

### Agent Rules
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — Current planning observation
- **score**: 27.193
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-single-surface-visual-system-v1/BRANCH_SCOPE_CHECKLIST.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: product-actions-registry-single-surface-visual-system-*v1*] ## Current *planning* observation
- Launcher checkout: `/opt/*processmap*-test`. - Branch: `*fix*/lockfile-sync-test`. - *Dirty* *tree*: yes. - Many unrelated frontend and artifact changes are present. - This is a *planning*-only run; Agent 1 did not write product code.
```

### #2 — Input
- **score**: 25.501
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/RAG_PREFLIGHT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: process-*stage*-baseline-jank-*v1*] - **role**: planner - **contour**: perf/process-*stage*-baseline-jank-*v1* - **area/query**: *ProcessMap* *planning* *context* - **generated_at**: 2026-05-16T19:54:38.226Z
```

### #3 — Source/runtime truth
- **score**: 25.132
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1/EXEC_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
- Workspace: `/opt/*processmap*-test` - Branch: `*fix*/lockfile-sync-test` - HEAD: `5b20bc2d1292f419647238eaf37dac55f9315942` - `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187` - *Tree*: *dirty*, with pre-existing product-code modifications and untracked *planning*/runtime artifacts.
```

### #4 — Source/runtime truth status
- **score**: 24.245
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
- Workspace: `/opt/*processmap*-test`. - Branch: `*fix*/lockfile-sync-test`. - HEAD: `5b20bc2d1292f419647238eaf37dac55f9315942`. - `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`. - *Tree*: *dirty*, включая product-code изменения и untracked *planning*/runtime artifacts. - Вывод: product implementation в этом checkout запрещен для данного контура. Разрешены только артефакты в `.*planning*/contours/architecture/analytics-hub-registries-ux-and-server-split-master-plan-*v1*/`.
```

### #5 — Release blocker
- **score**: 23.862
- **path**: `/opt/processmap-test/.planning/contours/tooling/registry-analytics-branch-hygiene-and-merge-scope-v1/RUNTIME_VALIDATION_PRESERVATION_PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: registry-analytics-branch-hygiene-and-merge-scope-*v1*] ## *Release* blocker
Current served runtime is *dirty* (`build-info.json *dirty*=true`) and branch is `*fix*/lockfile-sync-test`. That is acceptable as historical review evidence, but not acceptable as final *release* proof after clean isolation. Final *release* proof must come from the clean branch intended for PR.
```

## Required Gates
- [ ] GSD discipline recorded
- [ ] Source/runtime truth captured
- [ ] Bounded scope defined in PLAN.md
- [ ] Acceptance criteria defined
- [ ] User rejection facts reviewed
- [ ] No product code written by Agent 1
- [ ] No merge/deploy/PR without explicit approval

## Warnings
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "ProcessMap planning context release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "ProcessMap planning context release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1" --area "ProcessMap planning context release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
