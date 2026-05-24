# ProcessMap Agent RAG Preflight — Worker 2

## Input
- **role**: executor
- **contour**: tooling/processmap-agents-4-agent-workflow-migration-v1
- **area/query**: local Mac launcher 4-agent migration split mode 3-window CID validation dry-run
- **generated_at**: 2026-05-17T00:18:27.714Z

## Structured Facts

### Runtime Facts
- **project_atlas_local_path**: /Users/mac/Documents/Obsidian/ProjectAtlas (local, medium)

### Agent Rules
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)

### Contour Facts
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)
- For TO-BE format, follow only the user-provided document; no invented terms unless marked hypothesis. (All TO-BE modeling and process design contours)

### Bottlenecks
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

### Validation Facts
- What happened in perf diagram modeler drag hot path pointermove suppression? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Validation performed
- **score**: 30.791
- **path**: `/opt/processmap-test/PROCESSMAP/HANDOFF/local-devflow-packaging-automation-v1.md`
- **source/category**: handoff-notes / docs
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## *Validation* performed
- source map of stage/prod workflows and existing deploy scripts - script implemented with worktree-first + clone fallback - *local* *dry*-*run* scenarios planned: - worktree bootstrap path - clone fallback path - *validation* failure stop - success path with commit/push
```

### #2 — 3C. Validation Query Runner
- **score**: 29.929
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-rag-bm25-manifest-search-v1] ## 3C. *Validation* Query *Run*ner
**File:** `tools/rag/pm-rag-*run*-*validation*-queries.mjs` Requirements: - Read `tools/rag/processmap-rag-*validation*-queries.json`. - *Run* each query via search CLI logic (can import or spawn). - Compare top-k results against expected_terms and expected_path_patterns. - Produce pass/fail per query. - Write: - `.planning/contours/<*CID*>/RAG_SEARCH_*VALIDATION*_RESULTS.json` - `.planning/contours/<*CID*>/RAG_SEARCH_*VALIDATION*_RESULTS.md`
```

### #3 — pm-agents-server-tmux.sh
- **score**: 27.880
- **path**: `/opt/processmap-test/tools/pm-agents-server-tmux.sh`
- **source/category**: tools-src / code
- **why_matched**: recent_14d
- **snippet**:
```
## pm-*agent*s-server-tmux.sh
#!/usr/bin/env bash set -euo pipefail ROOT="/opt/processmap-test" *CID*="${1:-tooling/project-atlas-server-docs-import-and-triage-v1}" SESSION="processmap-*agent*s" cd "$ROOT" echo "=== ProcessMap server tmux *launcher* ===" echo "Root: $ROOT" echo "Contour: $*CID*" echo "Session: $SESSION" echo if [ "$(id -u)" -ne 0 ]; then echo "ERROR: *run* as root." exit 2 fi for f in \ "$ROOT/tools/pm-*agent*1-planner.sh" \ "$ROOT/tools/pm-*agent*2-executor-watch.sh" \ "$ROOT/tools/pm-*agent*3-reviewer-watch.sh" \ "$ROOT/tools/pm-*agent*-status.sh" \ do if [ ! -x "$f" ]; then echo "ERROR: missing …
```

### #4 — 3C. Validation Query Runner
- **score**: 26.929
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-bm25-manifest-search-v1/EXECUTOR_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## 3C. *Validation* Query *Run*ner
**File:** `tools/rag/pm-rag-*run*-*validation*-queries.mjs` Requirements: - Read `tools/rag/processmap-rag-*validation*-queries.json`. - *Run* each query via search CLI logic (can import or spawn). - Compare top-k results against expected_terms and expected_path_patterns. - Produce pass/fail per query. - Write: - `.planning/contours/<*CID*>/RAG_SEARCH_*VALIDATION*_RESULTS.json` - `.planning/contours/<*CID*>/RAG_SEARCH_*VALIDATION*_RESULTS.md`
```

### #5 — 4. Validation Commands Agent 2 Must Run
- **score**: 25.346
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-rag-bm25-manifest-search-v1] ## 4. *Validation* Commands *Agent* 2 Must *Run*
*Run* these commands and include outputs in reports: ```bash
```

### #6 — 3. Local Inventory Instructions
- **score**: 25.014
- **path**: `/opt/processmap-test/.planning/contours/tooling/project-atlas-sync-and-rag-bootstrap-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
[contour: project-atlas-sync-and-rag-bootstrap-v1] ## 3. *Local* Inventory Instructions
See `*LOCAL*_*MAC*_INVENTORY_PROMPT.md` for the full *local* *agent* prompt.
```

### #7 — REVIEWER_PROMPT — Agent 3 / Reviewer
- **score**: 24.776
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-agent-rag-coverage-and-validation-hardening-v1] ## REVIEWER_PROMPT — *Agent* 3 / Reviewer
**Contour:** `feature/processmap-*agent*-rag-coverage-and-*validation*-hardening-v1` ***Run* ID:** `20260516T151430Z-2767` ***Agent*:** *Agent* 3 / Reviewer ---
```

### #8 — EXECUTOR_PROMPT — Agent 2 / Executor
- **score**: 24.776
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-agent-rag-coverage-and-validation-hardening-v1] ## EXECUTOR_PROMPT — *Agent* 2 / Executor
**Contour:** `feature/processmap-*agent*-rag-coverage-and-*validation*-hardening-v1` ***Run* ID:** `20260516T151430Z-2767` ***Agent*:** *Agent* 2 / Executor ---
```

### #9 — 4. Independent Validation Commands
- **score**: 24.526
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-rag-bm25-manifest-search-v1] ## 4. Independent *Validation* Commands
*Agent* 3 MUST *run* these independently and record outputs: ```bash
```

### #10 — Independent Validation
- **score**: 24.469
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-rag-source-registry-and-index-policy-v1] ## Independent *Validation*
*Agent* 3 must *run* these commands independently (do not trust *Agent* 2 output alone): ```bash cd /opt/processmap-test
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
node tools/rag/pm-rag-search.mjs "local Mac launcher 4-agent migration split mode 3-window CID validation dry-run" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "local Mac launcher 4-agent migration split mode 3-window CID validation dry-run" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "tooling/processmap-agents-4-agent-workflow-migration-v1" --area "local Mac launcher 4-agent migration split mode 3-window CID validation dry-run" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
