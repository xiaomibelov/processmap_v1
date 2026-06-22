# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: audit/full-rbac-matrix
- **area/query**: rbac authz endpoints matrix sessions sessions_new templates notes admin org projects explorer / full RBAC matrix 227 backend endpoints authz checks sessions sessions_new inconsistencies
- **generated_at**: 2026-06-21T19:14:39.706Z

## Structured Facts

### Agent Rules
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### Contour Facts
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Decisions
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)

### Bottlenecks
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

### Validation Facts
- Which paths should be indexed? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — __init__.py
- **score**: 52.662
- **path**: `/opt/processmap-test/backend/app/routers/__init__.py`
- **source/category**: backend-src / code
- **why_matched**: path_match, recent_14d
- **snippet**:
```
from .auto_pass import router as auto_pass_router from .*admin* import router as *admin*_router from .version import router as version_router from .clipboard import router as clipboard_router from .error_events import router as error_events_router from .*explorer* import router as *explorer*_router from .*org*_invites import router as *org*_invites_router from .*org*_listing import router as *org*_listing_router from .*org*_members import router as *org*_members_router from .*notes* import router as *notes*_router from .*org*_property_dictionary import router as *org*_property_dictionary_router from .product_actions_regi
```

### #2 — Влияние
- **score**: 49.697
- **path**: `/opt/processmap-test/docs/obsidian_fallback/project_atlas_updates/fix-project-sessions-list-summary-payload-v1/11_Explorer и Admin.md`
- **source/category**: docs-curated / docs
- **why_matched**: path_match
- **snippet**:
```
| Область | До | После | Риск | | ------- | -- | ----- | ---- | | Project/session bootstrap | `apiListProject*Sessions*()` тянул *full* *sessions* list | `apiListProject*Sessions*()` вызывает `?view=summary` | Низкий: открытие session и дальше делает *full* `apiGetSession` | | TopBar session title | Брал `title/name/id` из *full* row | Те же поля есть в summary | Низкий | | Session open | *Full* row мог уже быть в памяти, но open path всё равно вызывает *full* detail | *Full* detail явно deferred до open | Низкий | | *Explorer* project page | Использует отдельный `/api/*projects*/{id}/*explorer*` path | Не менялся | 
```

### #3 — 2) Backend unit/integration matrix
- **score**: 48.195
- **path**: `/opt/processmap-test/docs/enterprise_impl_test_matrix.md`
- **source/category**: docs-curated / docs
- **why_matched**: path_match, heading_match
- **snippet**:
```
## 2) *Backend* unit/integration *matrix*
| ID | Тип | Тест | Что доказывает | Нужные фикстуры | База/файл | |---|---|---|---|---|---| | BE-01 | Unit | `storage_scope_*org*_list` | list *projects*/*sessions* не утекает между `*org*_a` и `*org*_b` | users/*org*s/*projects*/*sessions* | `*backend*/tests/test_storage_sqlite_scope.py` (расширить) | | BE-02 | Unit | `storage_scope_*org*_load` | `load(project/session)` возвращает `None` для чужого *org* при non-*admin* | same | `test_storage_sqlite_scope.py` | | BE-03 | Unit | `storage_scope_*admin*_cross_*org*` | *org* *admin* видит только свой *org*; super-*admin* видит все (если вводит…
```

### #4 — 5) Минимальный MVP-контур
- **score**: 45.882
- **path**: `/opt/processmap-test/docs/enterprise_target_model_to_be.md`
- **source/category**: docs-curated / docs
- **why_matched**: 
- **snippet**:
```
1. Добавить `*org*s` + `memberships`. 2. Привязать `*projects*/*sessions*/reports/artifacts` к `*org*_id`. 3. Ввести *org*-level *RBAC* (owner/*admin*/member/viewer + service roles). 4. Добавить *org*-aware *endpoints* и UI выбор *org* после login. 5. Включить audit logging для write/delete операций.
```

### #5 — def setUp(self):
- **score**: 42.322
- **path**: `/opt/processmap-test/backend/tests/test_explorer_responsible_context_fields.py`
- **source/category**: backend-src / code
- **why_matched**: path_match
- **snippet**:
```
def setUp(self): self.tmp_*sessions* = tempfile.TemporaryDirectory() self.tmp_*projects* = tempfile.TemporaryDirectory() self.old_*sessions*_dir = os.environ.get("PROCESS_STORAGE_DIR") self.old_*projects*_dir = os.environ.get("PROJECT_STORAGE_DIR") self.old_db_path = os.environ.get("PROCESS_DB_PATH") os.environ["PROCESS_STORAGE_DIR"] = self.tmp_*sessions*.name os.environ["PROJECT_STORAGE_DIR"] = self.tmp_*projects*.name os.environ.pop("PROCESS_DB_PATH", None) from app.auth import create_user from app.models import CreateProjectIn, UpdateProjectIn from app._legacy_main import create_project, patch_project 
```

### #6 — test_explorer_global_search.py
- **score**: 40.926
- **path**: `/opt/processmap-test/backend/tests/test_explorer_global_search.py`
- **source/category**: backend-src / code
- **why_matched**: path_match, heading_match
- **snippet**:
```
## test_*explorer*_global_search.py
import os import tempfile import unittest from pathlib import Path from types import SimpleNamespace import sys *BACKEND*_DIR = Path(__file__).resolve().parents[1] if str(*BACKEND*_DIR) not in sys.path: sys.path.insert(0, str(*BACKEND*_DIR)) class _DummyRequest: def __init__(self, user: dict, *, active_*org*_id: str): self.state = SimpleNamespace(auth_user=user, active_*org*_id=active_*org*_id) self.headers = {} class *Explorer*GlobalSearchTest(unittest.TestCase): def setUp(self): self.tmp_*sessions* = tempfile.TemporaryDirectory() self.tmp_*projects* = tempfile.TemporaryDirect…
```

### #7 — B4. Router/API dual mode
- **score**: 40.844
- **path**: `/opt/processmap-test/docs/enterprise_impl_factpack.md`
- **source/category**: docs-curated / docs
- **why_matched**: 
- **snippet**:
```
- *New* *org*-scoped *endpoints*: добавить рядом с текущими в `*backend*/app/main.py`: - *projects*/*sessions*/reports/export under `/api/*org*s/{*org*_id}/...` - Legacy *endpoints* сохраняются: - текущие `/api/*projects**`, `/api/*sessions**`, `/api/reports*`, `/api/*sessions*/{sid}/export*` - внутри резолвят `default_*org*_id` и используют тот же service layer
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
node tools/rag/pm-rag-search.mjs "rbac authz endpoints matrix sessions sessions_new templates notes admin org projects explorer" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "rbac authz endpoints matrix sessions sessions_new templates notes admin org projects explorer" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "audit/full-rbac-matrix" --area "rbac authz endpoints matrix sessions sessions_new templates notes admin org projects explorer" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
