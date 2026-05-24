# RUNTIME_NAVIGATION — architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1

## Server
- Host: clearvestnic.ru
- User: root
- Working dir: /opt/processmap-test
- Date captured: 2026-05-16T14:00:54+00:00

## Git State
- Branch: fix/lockfile-sync-test
- HEAD: a9a9d9c5f468d9da63415306da6d34dcd605aa0d
- origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
- Uncommitted changes: 8 files (+55/-9 lines)
  - frontend/src/components/AppShell.jsx
  - frontend/src/components/ProcessStage.jsx
  - frontend/src/config/appVersion.js
  - frontend/src/features/process/stage/controllers/useBpmnViewportSource.js
  - frontend/src/features/process/stage/hooks/useBpmnCanvasController.js
  - frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx
  - frontend/src/main.jsx
  - frontend/src/vite.config.js
- Untracked: .agents/, .env.backup_20260514_095731, .planning/agent-logs/, .planning/contours/, .planning/templates/, .playwright-mcp/, PROCESSMAP/HANDOFF/*, baseline_idle_10s_before.json, bin/, frontend/public/, frontend/src/features/process/bpmn/stage/analytics/, frontend/src/features/process/bpmn/stage/decor/, frontend/src/features/process/bpmn/stage/derived/, frontend/src/features/process/bpmn/stage/interaction/, frontend/src/features/process/bpmn/stage/load/, frontend/src/features/process/hooks/useDiagramMutationLifecycle.non-edit-guard.test.mjs, frontend/src/generated/, frontend/src/features/process/stage/ui/DiagramRuntimeVersionBadge.jsx, review_*.yml, reviewer-*.png, scripts/capture-cpu-profile.mjs, scripts/generate-build-info.mjs, scripts/obsidian-write.sh, tools/install-processmap-agent-scripts.sh, tools/pm-agent-*.sh, tools/pm-gsd-status.sh

## Runtime Health
- http://clearvestnic.ru:8088/health → ok, redis healthy
- http://clearvestnic.ru:5180 → HTTP/1.1 200 OK (nginx, no-cache)

## Project Atlas
- Path: /srv/obsidian/project-atlas/ProcessMap
- Status: SERVER_ATLAS_EXISTS
- Total files: ~715
- Top-level dirs: AgentReports, Architecture, Audits, Backlog, Contours, Decisions, Evidence, HANDOFF, Prompts, RAG, Runtime, _Imported

## Existing RAG Backend (read-only inventory note)
- backend/app/routers/rag.py — API router (search, index endpoints)
- backend/app/rag/search.py — BM25 in-memory index
- backend/app/rag/chunker.py — BPMN XML chunker
- backend/app/rag/storage_rag.py — DB storage for chunks
- backend/app/rag/indexer.py — index_document / delete_document
- Allowed source_types: bpmn_xml, product_action
- Org-isolated, settings-gated (enabled, default_top_k, max_top_k, default_min_score)
- This contour does NOT modify existing RAG backend code.

## Contours Inventory
- 39 completed contours with PLAN.md + EXEC_REPORT.md + REVIEW_REPORT.md (+ REVIEW_PASS for most)
- 1 contour with CHANGES_REQUESTED + REWORK_REQUEST.md
- Categories: audit, feature, fix, perf, research, tooling, uiux
- No prior architecture contour completed yet.
