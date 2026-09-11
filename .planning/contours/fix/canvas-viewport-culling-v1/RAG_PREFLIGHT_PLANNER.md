# RAG Preflight Planner

- run_id: `20260528T084215Z-64895`
- contour: `fix/canvas-viewport-culling-v1`
- generated_by: `agent-1-planner`
- generated_at: `2026-05-28T08:45:09Z`
- command: `node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "fix/canvas-viewport-culling-v1" --area "ProcessMap planning context" --format md --top-k 5`

## Key RAG Findings

### Agent Rules (critical)
- RAG is read-only suggestion/context layer. Forbidden: auto-mutate code, auto-save files, write BPMN XML, apply Product Actions automatically.
- Agent 1 Planner must use GSD discipline: create PLAN.md, define acceptance criteria, write STATE.json.
- Agent 3 Reviewer must use GSD discipline: verify source/runtime truth, run independent validation.
- Agent 3 must verify fresh :5180 runtime for UI/runtime work (curl -I http://clearvestnic.ru:5180).
- Diagram performance review must test real mouse drag, not only programmatic zoom/click.
- No product runtime code changes in RAG tooling contours.

### Contour Facts
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- `fix/diagram-real-drag-performance-and-engine-decomposition-v1`: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions.

### Supporting Documents
- `/srv/obsidian/project-atlas/ProcessMap/AgentReports/release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1/RAG_PREFLIGHT_PLANNER.md` (score 31.361)
- `/srv/obsidian/project-atlas/ProcessMap/AgentReports/perf/diagram-property-overlays-viewport-culling-v1/INDEX.md` (score 31.109)

## Decisions Taken from RAG
- Retain 3-agent workflow (Planner → Worker → Reviewer) per project standard.
- No WebGL/canvas rewrite (explicitly rejected in prior contours).
- Keep changes bounded to React wrapper/component; no bpmn-js core modification.
