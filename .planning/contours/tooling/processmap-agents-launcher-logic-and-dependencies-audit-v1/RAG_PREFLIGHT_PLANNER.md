# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1
- **area/query**: ProcessMap agents launcher logic dependencies iTerm SSH CID Agent1 Agent2 Agent3 RAG preflight workflow
- **generated_at**: 2026-05-16T19:07:41.902Z

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
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)

### Decisions
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)

### Bottlenecks
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Deliverables
- **score**: 47.574
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/IMPLEMENTATION_CONTOUR_PROPOSAL.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *processmap*-agent-*rag*-knowledge-layer-bootstrap-plan-v1] 1. Updated agent prompt templates with *RAG* *preflight* blocks: - `.*agents*/*agent1*-planner/prompts/*` — Planner *RAG* block - `.*agents*/*agent2*-executor/prompts/*` — Executor *RAG* block - `.*agents*/*agent3*-reviewer/prompts/*` — Reviewer *RAG* block 2. Query template definitions per role (YAML/JSON config) 3. `*RAG*_CONTEXT_LOG.md` template for reports 4. `tools/pm-agent-*rag*-query.sh` — CLI helper for *agents* to query *RAG* 5. Tests: validate query templates return expected sources for validation queries
```

### #2 — install-processmap-agent-scripts.sh
- **score**: 46.138
- **path**: `/opt/processmap-test/tools/install-processmap-agent-scripts.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## install-*processmap*-agent-scripts.sh
#!/usr/bin/env bash set -euo pipefail ROOT="/opt/*processmap*-test" TOOLS="$ROOT/tools" mkdir -p "$TOOLS" mkdir -p "$ROOT/.*agents*/*agent1*-planner/prompts" "$ROOT/.*agents*/*agent1*-planner/logs" mkdir -p "$ROOT/.*agents*/*agent2*-executor/prompts" "$ROOT/.*agents*/*agent2*-executor/logs" mkdir -p "$ROOT/.*agents*/*agent3*-reviewer/prompts" "$ROOT/.*agents*/*agent3*-reviewer/logs" mkdir -p "$ROOT/.planning/contours" mkdir -p "$ROOT/.planning/agent-logs"
```

### #3 — pm-agents-server-tmux.sh
- **score**: 44.177
- **path**: `/opt/processmap-test/tools/pm-agents-server-tmux.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## pm-*agents*-server-tmux.sh
#!/usr/bin/env bash set -euo pipefail ROOT="/opt/*processmap*-test" *CID*="${1:-tooling/project-atlas-server-docs-import-and-triage-v1}" SESSION="*processmap*-*agents*" cd "$ROOT" echo "=== *ProcessMap* server tmux *launcher* ===" echo "Root: $ROOT" echo "Contour: $*CID*" echo "Session: $SESSION" echo if [ "$(id -u)" -ne 0 ]; then echo "ERROR: run as root." exit 2 fi for f in \ "$ROOT/tools/pm-*agent1*-planner.sh" \ "$ROOT/tools/pm-*agent2*-executor-watch.sh" \ "$ROOT/tools/pm-*agent3*-reviewer-watch.sh" \ "$ROOT/tools/pm-agent-status.sh" do if [ ! -x "$f" ]; then echo "ERROR: missing …
```

### #4 — Indexing Priority: Critical
- **score**: 38.166
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/SOURCE_INVENTORY.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *processmap*-agent-*rag*-knowledge-layer-bootstrap-plan-v1] | Path | Type | Module | Risk Tags | Lines (est.) | |------|------|--------|-----------|--------------| | `backend/app/routers/*rag*.py` | router | *RAG* API | org_isolation | ~150 | | `backend/app/*rag*/search.py` | module | BM25 search | internal_api | ~150 | | `backend/app/*rag*/chunker.py` | module | BPMN chunker | xml_parsing | ~150 | | `backend/app/*rag*/indexer.py` | module | Index pipeline | db_sto*rag*e | ~150 | | `backend/app/*rag*/sto*rag*e_*rag*.py` | module | Chunk sto*rag*e | db_schema | ~150 | | `frontend/src/features/admin/pages/Adm…
```

### #5 — How Agent 1 Sees GSD
- **score**: 37.933
- **path**: `/srv/obsidian/project-atlas/ProcessMap/Runtime/GSD Runner Binding on clearvestnic.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d
- **snippet**:
```
`tools/pm-*agent1*-planner.sh` exports: ```bash export PATH="/opt/*processmap*-test/bin:$PATH" export *PROCESSMAP*_GSD_BIN="/opt/*processmap*-test/bin/gsd" export *PROCESSMAP*_CODEX_GSD_TOOLS="/root/.codex/get-shit-done/bin/gsd-tools.cjs" export *PROCESSMAP*_GSD_SKILLS_DIR="/root/.codex/skills" export *PROCESSMAP*_GSD_*AGENTS*_DIR="/root/.codex/*agents*" ``` The local *iTerm* pane wrapper also exports the same values for the current desktop *launcher* flow.
```

### #6 — Risk Mitigation
- **score**: 34.048
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/IMPLEMENTATION_CONTOUR_PROPOSAL.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *processmap*-agent-*rag*-knowledge-layer-bootstrap-plan-v1] | Risk | Mitigation | |------|------------| | Agent ignores *RAG* context | Mandatory *preflight* block + logging requirement in prompt | | Query templates too rigid | Parametric templates; *agents* can override keywords | | *RAG* unavailable breaks *workflow* | Fallback documented: proceed with baseline knowledge |
```

### #7 — backup_if_exists() {
- **score**: 33.262
- **path**: `/opt/processmap-test/tools/install-processmap-agent-scripts.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, recent_14d
- **snippet**:
```
backup_if_exists() { local f="$1" if [ -f "$f" ]; then cp "$f" "$f.bak.$(date +%Y%m%d_%H%M%S)" fi } backup_if_exists "$TOOLS/pm-agent-status.sh" cat > "$TOOLS/pm-agent-status.sh" <<'EOF' #!/usr/bin/env bash set -euo pipefail ROOT="/opt/*processmap*-test" *CID*="${1:-}" cd "$ROOT" echo "=== *PROCESSMAP* TEST RUNTIME ===" hostname whoami date echo echo "=== GIT ===" git branch --show-current 2>/dev/null || true git rev-parse --short HEAD 2>/dev/null || true git status -sb 2>/dev/null || true echo echo "=== DOCKER ===" docker compose -p *processmap*_test ps 2>/dev/null || true echo if [ -n "$*CID*" ]; then
```

### #8 — Agent 1 Binding
- **score**: 32.942
- **path**: `/opt/processmap-test/.planning/contours/tooling/gsd-runner-repair-and-agent1-binding-v1/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: gsd-runner-repair-and-*agent1*-binding-v1] Server-side Agent 1 script now exports `/opt/*processmap*-test/bin` ahead of PATH and exposes GSD paths through environment variables before launching Kimi. Its prompt and startup banner show: - GSD command: `/opt/*processmap*-test/bin/gsd` - Codex-local tools: `/root/.codex/get-shit-done/bin/gsd-tools.cjs` - skills: `/root/.codex/skills/gsd-*` - *agents*: `/root/.codex/*agents*/gsd-*` The local *iTerm* pane wrapper used by the desktop *launcher* now exports the same values into the remote Kimi session.
```

### #9 — Agent Preflight Usage Plan
- **score**: 32.838
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *processmap*-agent-*rag*-bm25-manifest-search-v1] ## Agent *Preflight* Usage Plan
Agent 1/2/3 should query *RAG* before work. Document usage in: - `tools/*rag*/pm-*rag*-agent-*preflight*.mjs` (optional implementation) - `.planning/contours/<*CID*>/AGENT_*PREFLIGHT*_USAGE.md` - Project Atlas: `/srv/obsidian/project-atlas/*ProcessMap*/*RAG*/Agent *Preflight* Usage.md` **Planner *preflight* example:** ```bash node tools/*rag*/pm-*rag*-search.mjs \ "contour category:perf keywords:diagram d*rag* lag truth:canonical" \ --top-k 5 ``` **Executor *preflight* example:** ```bash node tools/*rag*/pm-*rag*-search.mjs \ "file:ProcessS…
```

### #10 — pm-agent1-planner.sh
- **score**: 31.930
- **path**: `/opt/processmap-test/tools/pm-agent1-planner.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## pm-*agent1*-planner.sh
#!/usr/bin/env bash set -euo pipefail ROOT="/opt/*processmap*-test" *CID*="${1:?Usage: pm-*agent1*-planner.sh <contour-id>}" DIR="$ROOT/.planning/contours/$*CID*" PROMPT="$ROOT/.*agents*/*agent1*-planner/prompts/${*CID*//\//__}-planner-start.md" mkdir -p "$DIR" mkdir -p "$(dirname "$PROMPT")" export PATH="$ROOT/bin:/root/.local/bin:/root/.kimi/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH" export *PROCESSMAP*_GSD_BIN="$ROOT/bin/gsd" export *PROCESSMAP*_CODEX_GSD_TOOLS="/root/.codex/get-shit-done/bin/gsd-tools.cjs" export *PROCESSMAP*_GSD_SKILLS_DIR="/root/.codex/sk…
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
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "ProcessMap agents launcher logic dependencies iTerm SSH CID Agent1 Agent2 Agent3 RAG preflight workflow" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "ProcessMap agents launcher logic dependencies iTerm SSH CID Agent1 Agent2 Agent3 RAG preflight workflow" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" --area "ProcessMap agents launcher logic dependencies iTerm SSH CID Agent1 Agent2 Agent3 RAG preflight workflow" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
