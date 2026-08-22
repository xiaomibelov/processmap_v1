# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: fix/rbac-gaps
- **area/query**: rbac authz permissions session delete export notes templates bpmn save / RBAC gaps permissions_json session delete export note threads templates bpmn save
- **generated_at**: 2026-06-21T19:10:09.850Z

## Structured Facts

### Agent Rules
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).

### Contour Facts
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Decisions
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- Version marker must not overlay the BPMN canvas. (All diagram/UI contours)
- Version/update row should increment visibly. (Save, deploy, and version contours)
- For TO-BE format, follow only the user-provided document; no invented terms unless marked hypothesis. (All TO-BE modeling and process design contours)

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

### Validation Facts
- What is forbidden for RAG? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — templates.py
- **score**: 36.638
- **path**: `/opt/processmap-test/backend/app/routers/templates.py`
- **source/category**: backend-src / code
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## *templates*.py
from __future__ import annotations from typing import Any, Dict, Optional, Set, Tuple from fastapi import APIRouter, Query, Request, Response from pydantic import BaseModel from .. import _legacy_main from ..utils.*authz* import is_role_allowed, scope_allowed_project_ids from ..redis_cache import cache_*delete*_prefix, cache_get_*json*, cache_set_*json* from ..storage import ( create_template, create_template_folder, *delete*_template, *delete*_template_folder, get_template_folder, get_template, list_template_folders, list_*templates*, update_template_folder, update_template, ) router = APIR…
```

### #2 — def list_session_note_threads(
- **score**: 35.165
- **path**: `/opt/processmap-test/backend/app/routers/notes.py`
- **source/category**: backend-src / code
- **why_matched**: path_match, heading_match
- **snippet**:
```
## def list_*session*_*note*_*threads*(
def list_*session*_*note*_*threads*( *session*_id: str, request: Request, status: Optional[str] = None, scope_type: Optional[str] = None, element_id: Optional[str] = None, ) -> Dict[str, Any]: _sess, org_id, user_id = _load_*session*_for_**note*s*(request, *session*_id, write=False) try: items = storage.list_*note*_*threads*( *session*_id, org_id=org_id, status=status, scope_type=scope_type, element_id=element_id, viewer_user_id=user_id, ) except ValueError as exc: raise _validation_error(exc) from exc return {"items": items, "count": len(items)} @router.post("/api/*note*-*threads*/{th…
```

### #3 — def test_note_threads_include_db_backed_author_profile_identity(self):
- **score**: 33.500
- **path**: `/opt/processmap-test/backend/tests/test_notes_mvp1_api.py`
- **source/category**: backend-src / code
- **why_matched**: path_match, heading_match
- **snippet**:
```
## def test_*note*_*threads*_include_db_backed_author_profile_identity(self):
def test_*note*_*threads*_include_db_backed_author_profile_identity(self): created = self.create_*session*_*note*_thread( self.*session*_id, self.Create*Note*ThreadBody( scope_type="*session*", scope_ref={}, body="Проверить отображение автора", mention_user_ids=[str(self.viewer.get("id") or "")], ), self._req(), )["thread"] self.assertEqual(created["created_by"], str(self.editor.get("id") or "")) self.assertEqual(created["created_by_full_name"], "Редактор Обсуждений") self.assertEqual(created["created_by_email"], "**note*s*_editor@local")…
```

### #4 — 3.3 Full e2e spec set present in the working tree
- **score**: 32.761
- **path**: `/opt/processmap-test/docs/migration/test_inventory_20260310.md`
- **source/category**: docs-curated / docs
- **why_matched**: 
- **snippet**:
```
The following specs also travel with the project and should not be dropped during packaging: `accept-invite-enterprise.spec.mjs`, `ai-badge-live-update.spec.mjs`, `ai-button-opens-panel-and-shows-loading.spec.mjs`, `ai-cache-replay.spec.mjs`, `ai-command-mode.spec.mjs`, `ai-nonblocking-tabs.spec.mjs`, `ai-questions-attach-to-node-and-show-badge.spec.mjs`, `ai-questions-bind.spec.mjs`, `ai-questions-diagram-badge.spec.mjs`, `ai-ui-status.spec.mjs`, `auth-routing-login.spec.mjs`, `batch-transform-**note*s*.spec.mjs`, `binding-assistant.spec.mjs`, `*bpmn*-roundtrip-big.spec.mjs`, `*bpmn*-runtime-reliabil
```

### #5 — const path = `/api/projects/${encode(projectId)}/sessions`;
- **score**: 32.116
- **path**: `/opt/processmap-test/frontend/src/lib/apiRoutes.js`
- **source/category**: frontend-src / code
- **why_matched**: recent_14d
- **snippet**:
```
## const path = `/api/projects/${encode(projectId)}/*session*s`;
const path = `/api/projects/${encode(projectId)}/*session*s`; return withQuery(path, { mode: String(mode || "").trim(), view: String(view || "").trim() }); }, analytics: (projectId) => `/api/projects/${encode(projectId)}/analytics`, }, workspaces: { analytics: (workspaceId) => `/api/workspaces/${encode(workspaceId)}/analytics`, }, analysis: { productActionsRegistryQuery: () => "/api/analysis/product-actions/registry/query", productActionsRegistry*Export*Csv: () => "/api/analysis/product-actions/registry/*export*.csv", productActionsRegis…
```

### #6 — def setUp(self):
- **score**: 31.761
- **path**: `/opt/processmap-test/backend/tests/test_bpmn_save_rbac_scope.py`
- **source/category**: backend-src / code
- **why_matched**: path_match
- **snippet**:
```
def setUp(self): self.tmp_*session*s = tempfile.TemporaryDirectory() self.tmp_projects = tempfile.TemporaryDirectory() self.old_*session*s_dir = os.environ.get("PROCESS_STORAGE_DIR") self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR") self.old_db_path = os.environ.get("PROCESS_DB_PATH") os.environ["PROCESS_STORAGE_DIR"] = self.tmp_*session*s.name os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name os.environ.pop("PROCESS_DB_PATH", None) from app.auth import create_user from app._legacy_main import ( *Bpmn*XmlIn, CreateProjectIn, Create*Session*In, create_project, create_project_*session*,
```

### #7 — def test_note_thread_unread_counts_are_per_user_and_mark_read(self):
- **score**: 31.527
- **path**: `/opt/processmap-test/backend/tests/test_notes_mvp1_api.py`
- **source/category**: backend-src / code
- **why_matched**: path_match, heading_match
- **snippet**:
```
## def test_*note*_thread_unread_counts_are_per_user_and_mark_read(self):
def test_*note*_thread_unread_counts_are_per_user_and_mark_read(self): self._add_project_member(self.viewer, "viewer") peer = self.create_user( "**note*s*_peer@local", "editor", is_admin=False, full_name="Коллега Обсуждений", ) self._insert_membership(self.org_id, str(peer.get("id") or ""), "editor") self._add_project_member(peer, "editor") created = self.create_*session*_*note*_thread( self.*session*_id, self.Create*Note*ThreadBody(scope_type="*session*", scope_ref={}, body="Первое сообщение"), self._req(), )["thread"] thread_id = create…
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
- ⚠️ User rejection ur-perf-drag-hot-path overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.
- ⚠️ User rejection ur-version-marker-on-canvas overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction.
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "rbac authz permissions session delete export notes templates bpmn save" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "rbac authz permissions session delete export notes templates bpmn save" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "fix/rbac-gaps" --area "rbac authz permissions session delete export notes templates bpmn save" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
