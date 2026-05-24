# ProcessMap Agent RAG Preflight — Planner

## Input
- **role**: planner
- **contour**: tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1
- **area/query**: local Mac launcher 4-agent workflow Agent1 Planner Agent2 Worker Agent3 Worker Agent4 Reviewer CID propagation dry-run iTerm
- **generated_at**: 2026-05-17T00:43:52.247Z

## Structured Facts

### Runtime Facts
- **project_atlas_local_path**: /Users/mac/Documents/Obsidian/ProjectAtlas (local, medium)
- **active_contour_root**: /opt/processmap-test/.planning/contours/<CID> (test, high)

### Agent Rules
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### Contour Facts
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)

### Bottlenecks
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — pm-agents-server-tmux.sh
- **score**: 50.689
- **path**: `/opt/processmap-test/tools/pm-agents-server-tmux.sh`
- **source/category**: tools-src / code
- **snippet**: shows 4-agent tmux session creation with A1-planner, A2-worker, A3-worker, A4-reviewer, status window.

### #2 — install-processmap-agent-scripts.sh
- **score**: 49.586
- **path**: `/opt/processmap-test/tools/install-processmap-agent-scripts.sh`
- **snippet**: backup_if_exists function, agent script installation, directory creation for all 4 agents.

### #3 — pm-agent1-planner.sh
- **score**: 36.335
- **path**: `/opt/processmap-test/tools/pm-agent1-planner.sh`
- **snippet**: exports PATH and GSD env vars, generates planner prompt with 4-agent workflow note.

### #4 — pm-agent3-reviewer-watch.sh (now Worker 3)
- **score**: 36.119
- **path**: `/opt/processmap-test/tools/pm-agent3-reviewer-watch.sh`
- **snippet**: Agent 3 watcher loop waiting for READY_FOR_REVIEW + EXEC_REPORT.md. Note: in 4-agent model this is Worker 3, not Reviewer.

### #5 — pm-agent4-reviewer-watch.sh
- **path**: `/opt/processmap-test/tools/pm-agent4-reviewer-watch.sh`
- **snippet**: Agent 4 reviewer watcher waiting for WORKER_2_DONE + WORKER_3_DONE + reports.

## How RAG Changed the Plan
- Confirmed server-side 4-agent scripts already exist and are functional.
- Confirmed local launcher is the remaining gap.
- Reinforced GSD discipline requirement for all agents.
- No product runtime changes allowed — contour stays strictly in tooling scope.
