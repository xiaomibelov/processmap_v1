# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: fix/transaction-session-status
- **area/query**: backend/DB-transactions / invalid transaction session status change
- **generated_at**: 2026-06-15T19:29:42.259Z

## Structured Facts

### Agent Rules
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Decisions
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — DOM / Console Checks
- **score**: 31.611
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/session-status-workflow/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d
- **snippet**:
```
- [ ] `document.querySelectorAll('[data-testid="topbar-*session*-*status*"]').length === 1` when a *backend* *session* is open. - [ ] No unhandled promise rejections during *status* *change*. - [ ] No `*invalid* *status* transition` console errors from unexpected code paths.
```

### #2 — test_session_title_questions.py
- **score**: 27.056
- **path**: `/opt/processmap-test/backend/tests/test_session_title_questions.py`
- **source/category**: backend-src / code
- **why_matched**: path_match, heading_match
- **snippet**:
```
## test_*session*_title_questions.py
import os import sys import tempfile import types import unittest from unittest.mock import patch class *Session*TitleQuestionsApiTest(unittest.TestCase): def setUp(self): if "yaml" not in sys.modules: mod = types.ModuleType("yaml") mod.safe_dump = lambda *args, **kwargs: "" mod.safe_load = lambda *args, **kwargs: {} sys.modules["yaml"] = mod self.tmp_*session*s = tempfile.TemporaryDirectory() self.tmp_projects = tempfile.TemporaryDirectory() self.tmp_*db* = tempfile.TemporaryDirectory() self.old_*session*s_dir = os.environ.get("PROCESS_STORAGE_DIR") self.old_project…
```

### #3 — const tx = db.transaction(SNAPSHOT_DB_STORE, "readwrite");
- **score**: 26.986
- **path**: `/opt/processmap-test/frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js`
- **source/category**: frontend-src / code
- **why_matched**: heading_match
- **snippet**:
```
## const tx = *db*.*transaction*(SNAPSHOT_*DB*_STORE, "readwrite");
const tx = *db*.*transaction*(SNAPSHOT_*DB*_STORE, "readwrite");
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
node tools/rag/pm-rag-search.mjs "backend/DB-transactions" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "backend/DB-transactions" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "fix/transaction-session-status" --area "backend/DB-transactions" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
