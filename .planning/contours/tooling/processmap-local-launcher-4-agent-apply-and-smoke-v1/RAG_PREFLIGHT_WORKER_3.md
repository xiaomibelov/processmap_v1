# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1
- **area/query**: server tooling 4-agent workflow pm-agent4-reviewer-watch pm-agent-status pm-agent-reset-stale tmux CID script name contract
- **generated_at**: 2026-05-17T00:50:39.556Z

## Structured Facts

### Runtime Facts
- **server_host**: clearvestnic.ru (test, high)
- **project_atlas_server_path**: /srv/obsidian/project-atlas (test, high)
- **active_contour_root**: /opt/processmap-test/.planning/contours/<CID> (test, high)

### Agent Rules
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### Decisions
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- Version marker must not overlay the BPMN canvas. (All diagram/UI contours)
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)

## Supporting Documents

### #1 — pm-agents-server-tmux.sh
- **score**: 74.109
- **path**: `/opt/processmap-test/tools/pm-agents-server-tmux.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## *pm*-*agent*s-*server*-*tmux*.sh
#!/usr/bin/env bash set -euo pipefail ROOT="/opt/processmap-test" *CID*="${1:-*tooling*/project-atlas-*server*-docs-import-and-triage-v1}" SESSION="processmap-*agent*s" cd "$ROOT" echo "=== ProcessMap *server* *tmux* launcher ===" echo "Root: $ROOT" echo "Contour: $*CID*" echo "Session: $SESSION" echo if [ "$(id -u)" -ne 0 ]; then echo "ERROR: run as root." exit 2 fi for f in \ "$ROOT/tools/*pm*-*agent*1-planner.sh" \ "$ROOT/tools/*pm*-*agent*2-executor-*watch*.sh" \ "$ROOT/tools/*pm*-*agent*3-*reviewer*-*watch*.sh" \ "$ROOT/tools/*pm*-*agent*-*status*.sh" do if [ ! -x "$f" ]; then echo "ERROR: missing …
```

### #2 — fix/lockfile-sync-test
- **score**: 49.121
- **path**: `/opt/processmap-test/.planning/contours/tooling/gsd-runner-repair-and-agent1-binding-v1/VALIDATION_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
[contour: gsd-runner-repair-and-*agent*1-binding-v1] M .env M frontend/src/components/AppShell.jsx M frontend/src/components/TopBar.jsx M frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs M frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx M frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs M frontend/src/styles/tailwind.css ?? .*agent*s/ ?? .env.backup_20260514_095731 ?? .planning/*agent*-logs/ ?? .planning/contours/ ?? .planning/templates/*agent*3-ui-runtime-proof-checklist.md ?? .planning/templates/*agent*3-ui-runtime-revie…
```

### #3 — Agent scripts listing and safe snippets
- **score**: 45.424
- **path**: `/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: gsd-availability-root-cause-diagnostic-v1] ## *Agent* *script*s listing and safe snippets
```bash ls -la tools/*pm*-*agent**.sh 2>/dev/null || true; sed -n '1,220p' tools/*pm*-*agent*1-planner.sh 2>/dev/null || true; sed -n '1,220p' tools/*pm*-*agent*-*status*.sh 2>/dev/null || true ``` ```text -rwxr-xr-x 1 root root 1322 May 14 13:01 tools/*pm*-*agent*-*reset*-*stale*.sh -rwxr-xr-x 1 root root 1529 May 14 12:01 tools/*pm*-*agent*-*status*.sh -rwxr-xr-x 1 root root 1946 May 14 12:01 tools/*pm*-*agent*1-planner.sh -rwxr-xr-x 1 root root 2283 May 14 12:01 tools/*pm*-*agent*2-executor-*watch*.sh -rwxr-xr-x 1 root root 2414 May …
```

### #4 — Agent scripts listing and safe snippets
- **score**: 44.924
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
## *Agent* *script*s listing and safe snippets
```bash ls -la tools/*pm*-*agent**.sh 2>/dev/null || true; sed -n '1,220p' tools/*pm*-*agent*1-planner.sh 2>/dev/null || true; sed -n '1,220p' tools/*pm*-*agent*-*status*.sh 2>/dev/null || true ``` ```text -rwxr-xr-x 1 root root 1322 May 14 13:01 tools/*pm*-*agent*-*reset*-*stale*.sh -rwxr-xr-x 1 root root 1529 May 14 12:01 tools/*pm*-*agent*-*status*.sh -rwxr-xr-x 1 root root 1946 May 14 12:01 tools/*pm*-*agent*1-planner.sh -rwxr-xr-x 1 root root 2283 May 14 12:01 tools/*pm*-*agent*2-executor-*watch*.sh -rwxr-xr-x 1 root root 2414 May 14 12:01 tools/*pm*-*agent*3-*reviewer*-*watch*.sh -rwxr-xr-x…
```

### #5 — pm-agent-reset-stale.sh
- **score**: 41.698
- **path**: `/opt/processmap-test/tools/pm-agent-reset-stale.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## *pm*-*agent*-*reset*-*stale*.sh
#!/usr/bin/env bash set -euo pipefail ROOT="/opt/processmap-test" *CID*="${1:?Usage: *pm*-*agent*-*reset*-*stale*.sh <contour-id>}" DIR="$ROOT/.planning/contours/$*CID*" cd "$ROOT" if [ ! -d "$DIR" ]; then echo "BLOCKED: contour dir missing: $DIR" exit 2 fi echo "=== *Reset* *stale* markers ===" echo "Contour: $*CID*" echo "Dir: $DIR" echo echo "=== Before ===" "$ROOT/tools/*pm*-*agent*-*status*.sh" "$*CID*" || true echo echo "=== Kimi processes ===" ps aux | grep "[k]imi" || true # Safe rule: # Remove EXECUTION_STARTED only if execution has no outputs. if [ -f "$DIR/EXECUTION_STARTED" ] \ &&…
```

### #6 — backup_if_exists() {
- **score**: 40.456
- **path**: `/opt/processmap-test/tools/install-processmap-agent-scripts.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, recent_14d
- **snippet**:
```
backup_if_exists() { local f="$1" if [ -f "$f" ]; then cp "$f" "$f.bak.$(date +%Y%m%d_%H%M%S)" fi } backup_if_exists "$TOOLS/*pm*-*agent*-*status*.sh" cat > "$TOOLS/*pm*-*agent*-*status*.sh" <<'EOF' #!/usr/bin/env bash set -euo pipefail ROOT="/opt/processmap-test" *CID*="${1:-}" cd "$ROOT" echo "=== PROCESSMAP TEST RUNTIME ===" host*name* whoami date echo echo "=== GIT ===" git branch --show-current 2>/dev/null || true git rev-parse --short HEAD 2>/dev/null || true git *status* -sb 2>/dev/null || true echo echo "=== DOCKER ===" docker compose -p processmap_test ps 2>/dev/null || true echo if [ -n "$*CID*" ]; then
```

### #7 — fix/lockfile-sync-test
- **score**: 38.742
- **path**: `/opt/processmap-test/.planning/contours/tooling/gsd-runner-repair-and-agent1-binding-v1/VALIDATION_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
[contour: gsd-runner-repair-and-*agent*1-binding-v1] M .env M frontend/src/components/AppShell.jsx M frontend/src/components/TopBar.jsx M frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs M frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx M frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs M frontend/src/styles/tailwind.css ?? .*agent*s/ ?? .env.backup_20260514_095731 ?? .planning/*agent*-logs/ ?? .planning/contours/ ?? .planning/templates/*agent*3-ui-runtime-proof-checklist.md ?? .planning/templates/*agent*3-ui-runtime-revie…
```

### #8 — fix/lockfile-sync-test
- **score**: 38.544
- **path**: `/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
[contour: gsd-availability-root-cause-diagnostic-v1] M .env M frontend/src/components/AppShell.jsx M frontend/src/components/TopBar.jsx M frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs M frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx M frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs M frontend/src/styles/tailwind.css ?? .*agent*s/ ?? .env.backup_20260514_095731 ?? .planning/*agent*-logs/ ?? .planning/contours/ ?? .planning/templates/*agent*3-ui-runtime-proof-checklist.md ?? .planning/templates/*agent*3-ui-runtime-rev…
```

### #9 — fix/lockfile-sync-test
- **score**: 38.044
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
M .env M frontend/src/components/AppShell.jsx M frontend/src/components/TopBar.jsx M frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs M frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx M frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs M frontend/src/styles/tailwind.css ?? .*agent*s/ ?? .env.backup_20260514_095731 ?? .planning/*agent*-logs/ ?? .planning/contours/ ?? .planning/templates/*agent*3-ui-runtime-proof-checklist.md ?? .planning/templates/*agent*3-ui-runtime-review-template.md ?? .playwright-mcp/ ?? TEST_RUNTIME.m
```

### #10 — Indexing Priority: Critical
- **score**: 37.976
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/SOURCE_INVENTORY.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: processmap-*agent*-rag-knowledge-layer-bootstrap-plan-v1] | Path | Type | Module | Risk Tags | Lines (est.) | |------|------|--------|-----------|--------------| | `backend/app/routers/rag.py` | router | RAG API | org_isolation | ~150 | | `backend/app/rag/search.py` | module | BM25 search | internal_api | ~150 | | `backend/app/rag/chunker.py` | module | B*PM*N chunker | xml_parsing | ~150 | | `backend/app/rag/indexer.py` | module | Index pipeline | db_storage | ~150 | | `backend/app/rag/storage_rag.py` | module | Chunk storage | db_schema | ~150 | | `frontend/src/features/admin/pages/Adm…
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
node tools/rag/pm-rag-search.mjs "server tooling 4-agent workflow pm-agent4-reviewer-watch pm-agent-status pm-agent-reset-stale tmux CID script name contract" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "server tooling 4-agent workflow pm-agent4-reviewer-watch pm-agent-status pm-agent-reset-stale tmux CID script name contract" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" --area "server tooling 4-agent workflow pm-agent4-reviewer-watch pm-agent-status pm-agent-reset-stale tmux CID script name contract" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
