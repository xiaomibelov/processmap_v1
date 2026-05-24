# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1
- **area/query**: launcher helper scripts CID propagation dependencies iTerm SSH agent watchers
- **generated_at**: 2026-05-16T19:25:17.077Z

## Structured Facts

### Runtime Facts
- **active_contour_root**: /opt/processmap-test/.planning/contours/<CID> (test, high)

### Agent Rules
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- For TO-BE format, follow only the user-provided document; no invented terms unless marked hypothesis. (All TO-BE modeling and process design contours)

## Supporting Documents

### #1 — Tools
- **score**: 25.371
- **path**: `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEX_SOURCES.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: recent_14d
- **snippet**:
```
- **Include:** `**/*.sh`, `**/*.mjs`, `**/*.js`, `**/*.py`, `**/*.md` - **Exclude:** `**/*.log`, `**/*.backup*` - **Notes:** *Agent* *launcher* *scripts*, mirror *scripts*, utility tooling.
```

### #2 — Agent 1 Binding
- **score**: 22.697
- **path**: `/opt/processmap-test/.planning/contours/tooling/gsd-runner-repair-and-agent1-binding-v1/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
[contour: gsd-runner-repair-and-*agent*1-binding-v1] ## *Agent* 1 Binding
Server-side *Agent* 1 script now exports `/opt/processmap-test/bin` ahead of PATH and exposes GSD paths through environment variables before launching Kimi. Its prompt and startup banner show: - GSD command: `/opt/processmap-test/bin/gsd` - Codex-local tools: `/root/.codex/get-shit-done/bin/gsd-tools.cjs` - skills: `/root/.codex/skills/gsd-*` - *agent*s: `/root/.codex/*agent*s/gsd-*` The local *iTerm* pane wrapper used by the desktop *launcher* now exports the same values into the remote Kimi session.
```

### #3 — Agent 1 Binding
- **score**: 22.697
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/tooling/gsd-runner-repair-and-agent1-binding-v1/EXEC_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
## *Agent* 1 Binding
Server-side *Agent* 1 script now exports `/opt/processmap-test/bin` ahead of PATH and exposes GSD paths through environment variables before launching Kimi. Its prompt and startup banner show: - GSD command: `/opt/processmap-test/bin/gsd` - Codex-local tools: `/root/.codex/get-shit-done/bin/gsd-tools.cjs` - skills: `/root/.codex/skills/gsd-*` - *agent*s: `/root/.codex/*agent*s/gsd-*` The local *iTerm* pane wrapper used by the desktop *launcher* now exports the same values into the remote Kimi session.
```

### #4 — Agent Preflight Helper Script
- **score**: 22.622
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/AGENT_PREFLIGHT_USAGE.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-rag-bm25-manifest-search-v1] ## *Agent* Preflight *Helper* Script
**Status:** Not implemented in this contour (documented as next contour proposal). A dedicated `tools/rag/pm-rag-*agent*-preflight.mjs` *helper* could provide: ```bash node tools/rag/pm-rag-*agent*-preflight.mjs \ --role planner \ --area "diagram performance" \ --contour "perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1" ``` Output would include: - Suggested queries based on role + area - Top results pre-formatted as compact context block - Links to relevant Project Atlas pages **Next contour:**…
```

### #5 — 1. Agent Preflight Helper
- **score**: 21.725
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/IMPLEMENTATION_NOTES.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-rag-bm25-manifest-search-v1] ## 1. *Agent* Preflight *Helper*
**Plan expectation:** Optional `pm-rag-*agent*-preflight.mjs` implementation. **Actual:** Not implemented due to time/complexity budget. Documented as next contour proposal in `*AGENT*_PREFLIGHT_USAGE.md`.
```

### #6 — How Agent 1 Sees GSD
- **score**: 21.714
- **path**: `/srv/obsidian/project-atlas/ProcessMap/Runtime/GSD Runner Binding on clearvestnic.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
## How *Agent* 1 Sees GSD
`tools/pm-*agent*1-planner.sh` exports: ```bash export PATH="/opt/processmap-test/bin:$PATH" export PROCESSMAP_GSD_BIN="/opt/processmap-test/bin/gsd" export PROCESSMAP_CODEX_GSD_TOOLS="/root/.codex/get-shit-done/bin/gsd-tools.cjs" export PROCESSMAP_GSD_SKILLS_DIR="/root/.codex/skills" export PROCESSMAP_GSD_*AGENT*S_DIR="/root/.codex/*agent*s" ``` The local *iTerm* pane wrapper also exports the same values for the current desktop *launcher* flow.
```

### #7 — Dependencies
- **score**: 21.501
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/IMPLEMENTATION_CONTOUR_PROPOSAL.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-rag-knowledge-layer-bootstrap-plan-v1] ## *Dependencies*
- Contour 1 (source registry and indexer must be operational) - *Agent* prompt structure in `.*agent*s/`
```

### #8 — Option 4 — Wire Codex-local `gsd-tools.cjs` into Agent Scripts
- **score**: 21.408
- **path**: `/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/REPAIR_OPTIONS.md`
- **source/category**: planning-contours / contour
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
[contour: gsd-availability-root-cause-diagnostic-v1] ## Option 4 — Wire Codex-local `gsd-tools.cjs` into *Agent* *Scripts*
What changes: update ProcessMap *agent* *launcher* *scripts* to detect `/root/.codex/get-shit-done/bin/gsd-tools.cjs`, run safe GSD queries through `node`, and pass the detected GSD mode/tool path into *Agent* 1's prompt. Pros: - No package install required. - Uses the GSD tooling that actually exists on the server. - Can keep repair scoped to tooling *scripts*. Cons: - Requires defining a small adapter contract because `gsd-tools.cjs` is not the same command as broken `gsd-sdk` symlink…
```

### #9 — Option 4 — Wire Codex-local `gsd-tools.cjs` into Agent Scripts
- **score**: 21.408
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/tooling/gsd-availability-root-cause-diagnostic-v1/REPAIR_OPTIONS.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
## Option 4 — Wire Codex-local `gsd-tools.cjs` into *Agent* *Scripts*
What changes: update ProcessMap *agent* *launcher* *scripts* to detect `/root/.codex/get-shit-done/bin/gsd-tools.cjs`, run safe GSD queries through `node`, and pass the detected GSD mode/tool path into *Agent* 1's prompt. Pros: - No package install required. - Uses the GSD tooling that actually exists on the server. - Can keep repair scoped to tooling *scripts*. Cons: - Requires defining a small adapter contract because `gsd-tools.cjs` is not the same command as broken `gsd-sdk` symlink. - Kimi still will not automatically know Codex skil…
```

### #10 — Dependencies
- **score**: 21.013
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/IMPLEMENTATION_CONTOUR_PROPOSAL.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-rag-knowledge-layer-bootstrap-plan-v1] ## *Dependencies*
- Contour 1 (indexer) - Existing `tools/pm-*agent*-mirror-report.sh` - Project Atlas directory structure
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
node tools/rag/pm-rag-search.mjs "launcher helper scripts CID propagation dependencies iTerm SSH agent watchers" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "launcher helper scripts CID propagation dependencies iTerm SSH agent watchers" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" --area "launcher helper scripts CID propagation dependencies iTerm SSH agent watchers" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
