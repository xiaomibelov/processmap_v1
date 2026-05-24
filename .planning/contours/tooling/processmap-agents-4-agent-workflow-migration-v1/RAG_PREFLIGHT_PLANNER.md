# ProcessMap Agent RAG Preflight — Planner

## Input
- **role**: planner
- **contour**: tooling/processmap-agents-4-agent-workflow-migration-v1
- **area/query**: ProcessMap agents 4-agent workflow launcher Agent1 Planner Agent2 Worker Agent3 Worker Agent4 Reviewer CID propagation status dry-run
- **generated_at**: 2026-05-17T00:04:40.706Z

## Structured Facts

### Runtime Facts
- **repo_root**: /opt/processmap-test (test, high)
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

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- For TO-BE format, follow only the user-provided document; no invented terms unless marked hypothesis. (All TO-BE modeling and process design contours)

### Bottlenecks
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1

## Supporting Documents

### #1 — install-processmap-agent-scripts.sh
- **score**: 64.592
- **path**: `/opt/processmap-test/tools/install-processmap-agent-scripts.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**: Creates `.agents/agent{1,2,3}-{planner,executor,reviewer}/` directories and writes pm-agent*.sh scripts.

### #2 — pm-agents-server-tmux.sh
- **score**: 64.396
- **path**: `/opt/processmap-test/tools/pm-agents-server-tmux.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**: Server tmux launcher for 3-agent workflow (A1-planner, A2-executor, A3-reviewer, status).

### #3 — pm-agent1-planner.sh
- **score**: 48.551
- **path**: `/opt/processmap-test/tools/pm-agent1-planner.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**: Exports GSD env vars, creates planner prompt, launches `kimi` interactively.

### #4 — pm-agent-status.sh
- **score**: 47.834
- **path**: `/opt/processmap-test/tools/pm-agent-status.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, recent_14d
- **snippet**: Shows git/docker state and contour marker files. Only checks 3-agent markers.

### #5 — pm-agent2-executor-watch.sh / pm-agent3-reviewer-watch.sh
- **score**: 47.834
- **path**: `/opt/processmap-test/tools/pm-agent2-executor-watch.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, recent_14d
- **snippet**: Watcher loops for Agent 2 (READY_FOR_EXECUTION) and Agent 3 (READY_FOR_REVIEW).

## Required Gates
- [x] GSD discipline recorded
- [x] Source/runtime truth captured
- [x] Bounded scope defined in PLAN.md
- [x] Acceptance criteria defined
- [ ] User rejection facts reviewed (N/A for tooling contour)
- [x] No product code written by Agent 1
- [x] No merge/deploy/PR without explicit approval

## How RAG Changed the Plan
- Confirmed existing tooling scripts are 3-agent only (install, tmux, status, reset).
- Confirmed GSD env vars are already exported in pm-agent1-planner.sh; same pattern should be preserved for 4-agent.
- No product runtime changes allowed — reinforces contour boundary.
- No auto-mutation — all changes must go through Worker 2 + Worker 3 + Reviewer 4.
