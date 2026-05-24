# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1
- **area/query**: local Mac launcher 4-agent apply smoke split mode CID validation dry-run iTerm
- **generated_at**: 2026-05-17T00:50:36.135Z

## Structured Facts

### Runtime Facts
- **project_atlas_local_path**: /Users/mac/Documents/Obsidian/ProjectAtlas (local, medium)

### Agent Rules
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### Contour Facts
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

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

### #3 — Agent 1 Binding
- **score**: 28.308
- **path**: `/opt/processmap-test/.planning/contours/tooling/gsd-runner-repair-and-agent1-binding-v1/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
[contour: gsd-*run*ner-repair-and-*agent*1-binding-v1] ## *Agent* 1 Binding
Server-side *Agent* 1 script now exports `/opt/processmap-test/bin` ahead of PATH and exposes GSD paths through environment variables before launching Kimi. Its prompt and startup banner show: - GSD command: `/opt/processmap-test/bin/gsd` - Codex-*local* tools: `/root/.codex/get-shit-done/bin/gsd-tools.cjs` - skills: `/root/.codex/skills/gsd-*` - *agent*s: `/root/.codex/*agent*s/gsd-*` The *local* *iTerm* pane wrapper used by the desktop *launcher* now exports the same values into the remote Kimi session.
```

### #4 — Agent 1 Binding
- **score**: 28.308
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/tooling/gsd-runner-repair-and-agent1-binding-v1/EXEC_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
## *Agent* 1 Binding
Server-side *Agent* 1 script now exports `/opt/processmap-test/bin` ahead of PATH and exposes GSD paths through environment variables before launching Kimi. Its prompt and startup banner show: - GSD command: `/opt/processmap-test/bin/gsd` - Codex-*local* tools: `/root/.codex/get-shit-done/bin/gsd-tools.cjs` - skills: `/root/.codex/skills/gsd-*` - *agent*s: `/root/.codex/*agent*s/gsd-*` The *local* *iTerm* pane wrapper used by the desktop *launcher* now exports the same values into the remote Kimi session.
```

### #5 — 1. Reviewer GSD Discipline
- **score**: 27.536
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: recent_14d
- **snippet**:
```
[contour: process-stage-baseline-jank-v1] **GSD availability result**: ALL FOUND ``` PATH=/opt/processmap-test/bin:/root/.*local*/bin:/root/.kimi/bin:/usr/*local*/sbin:/usr/*local*/bin:/usr/sbin:/usr/bin:/sbin:/bin:/Users/*mac*/.nvm/versions/node/v22.19.0/bin:/usr/*local*/opt/postgresql@15/bin:/Users/*mac*/.codeium/windsurf/bin:/usr/*local*/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/*run*/apple.security.cryptexd/codex.system/bootstrap/usr/*local*/bin:/var/*run*/apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/*run*/apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal…
```

### #6 — 1. Reviewer GSD Discipline
- **score**: 27.536
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/perf/process-stage-baseline-jank-v1/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: recent_14d
- **snippet**:
```
**GSD availability result**: ALL FOUND ``` PATH=/opt/processmap-test/bin:/root/.*local*/bin:/root/.kimi/bin:/usr/*local*/sbin:/usr/*local*/bin:/usr/sbin:/usr/bin:/sbin:/bin:/Users/*mac*/.nvm/versions/node/v22.19.0/bin:/usr/*local*/opt/postgresql@15/bin:/Users/*mac*/.codeium/windsurf/bin:/usr/*local*/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/*run*/apple.security.cryptexd/codex.system/bootstrap/usr/*local*/bin:/var/*run*/apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/*run*/apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/Applications/VMware Fusion.app/Conte
```

### #7 — 3C. Validation Query Runner
- **score**: 26.929
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-bm25-manifest-search-v1/EXECUTOR_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## 3C. *Validation* Query *Run*ner
**File:** `tools/rag/pm-rag-*run*-*validation*-queries.mjs` Requirements: - Read `tools/rag/processmap-rag-*validation*-queries.json`. - *Run* each query via search CLI logic (can import or spawn). - Compare top-k results against expected_terms and expected_path_patterns. - Produce pass/fail per query. - Write: - `.planning/contours/<*CID*>/RAG_SEARCH_*VALIDATION*_RESULTS.json` - `.planning/contours/<*CID*>/RAG_SEARCH_*VALIDATION*_RESULTS.md`
```

### #8 — How Agent 1 Sees GSD
- **score**: 25.834
- **path**: `/srv/obsidian/project-atlas/ProcessMap/Runtime/GSD Runner Binding on clearvestnic.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
## How *Agent* 1 Sees GSD
`tools/pm-*agent*1-planner.sh` exports: ```bash export PATH="/opt/processmap-test/bin:$PATH" export PROCESSMAP_GSD_BIN="/opt/processmap-test/bin/gsd" export PROCESSMAP_CODEX_GSD_TOOLS="/root/.codex/get-shit-done/bin/gsd-tools.cjs" export PROCESSMAP_GSD_SKILLS_DIR="/root/.codex/skills" export PROCESSMAP_GSD_*AGENT*S_DIR="/root/.codex/*agent*s" ``` The *local* *iTerm* pane wrapper also exports the same values for the current desktop *launcher* flow.
```

### #9 — 4. Validation Commands Agent 2 Must Run
- **score**: 25.346
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-rag-bm25-manifest-search-v1] ## 4. *Validation* Commands *Agent* 2 Must *Run*
*Run* these commands and include outputs in reports: ```bash
```

### #10 — 3. Local Inventory Instructions
- **score**: 25.014
- **path**: `/opt/processmap-test/.planning/contours/tooling/project-atlas-sync-and-rag-bootstrap-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
[contour: project-atlas-sync-and-rag-bootstrap-v1] ## 3. *Local* Inventory Instructions
See `*LOCAL*_*MAC*_INVENTORY_PROMPT.md` for the full *local* *agent* prompt.
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
node tools/rag/pm-rag-search.mjs "local Mac launcher 4-agent apply smoke split mode CID validation dry-run iTerm" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "local Mac launcher 4-agent apply smoke split mode CID validation dry-run iTerm" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" --area "local Mac launcher 4-agent apply smoke split mode CID validation dry-run iTerm" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
