# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: subprocess-transition-audit
- **area/query**: subprocess transition / subprocess transition navigation drilldown parent child session
- **generated_at**: 2026-06-19T08:48:54.405Z

## Structured Facts

### Runtime Facts
- **server_host**: clearvestnic.ru (test, high)
- **repo_root**: /opt/processmap-test (test, high)
- **frontend_url**: http://clearvestnic.ru:5180 (test, high)
- **api_health_url**: http://clearvestnic.ru:8088/health (test, high)
- **project_atlas_server_path**: /srv/obsidian/project-atlas (test, high)
- **project_atlas_local_path**: /Users/mac/Documents/Obsidian/ProjectAtlas (local, medium)
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

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — def walk_edges(container: ET.Element, *, parent_old_id: str) -> None:
- **score**: 35.581
- **path**: `/opt/processmap-test/backend/app/clipboard/serializer.py`
- **source/category**: backend-src / code
- **why_matched**: heading_match
- **snippet**:
```
## def walk_edges(container: ET.Element, *, *parent*_old_id: str) -> None:
def walk_edges(container: ET.Element, *, *parent*_old_id: str) -> None: container_id = str(container.attrib.get("id") or "").strip() or *parent*_old_id for *child* in list(container): lname = local_name(*child*.tag) if str(getattr(*child*, "tag", "") or "").startswith(f"{{{_BPMN_NS}}}") and lname in _SUPPORTED_SUBTREE_EDGE_TYPES: old_id = str(*child*.attrib.get("id") or "").strip() src = str(*child*.attrib.get("sourceRef") or "").strip() dst = str(*child*.attrib.get("targetRef") or "").strip() src_in_subtree = src in node_ids dst_in_subt…
```

### #2 — Что стало видимым
- **score**: 35.558
- **path**: `/opt/processmap-test/PROCESSMAP/HANDOFF/2026-05-08 - fix session open routes from registry and explorer v1.md`
- **source/category**: handoff-notes / docs
- **why_matched**: path_match
- **snippet**:
```
- Explorer *session* row/title/CTA передают explicit *session*-open intent. - Workspace dashboard *session* row/title/CTA открывают *session* напрямую. - Реестр действий с продуктом: *session* row и `Открыть сессию` открывают конкретную *session*, `Открыть проект` остаётся project *drilldown*. - *Session* entry из списков/*drilldown* запрашивает `Diagram (BPMN)` через `openTab: "diagram"`. - CTA внутри строк останавливают *parent* bubbling там, где это могло смешать project/*session* *navigation*.
```

### #3 — def walk(node: ET.Element, *, parent_old_id: str, depth: int) -> None:
- **score**: 34.161
- **path**: `/opt/processmap-test/backend/app/clipboard/serializer.py`
- **source/category**: backend-src / code
- **why_matched**: heading_match
- **snippet**:
```
## def walk(node: ET.Element, *, *parent*_old_id: str, depth: int) -> None:
def walk(node: ET.Element, *, *parent*_old_id: str, depth: int) -> None: node_id = str(node.attrib.get("id") or "").strip() lname = local_name(node.tag) if ( str(getattr(node, "tag", "") or "").startswith(f"{{{_BPMN_NS}}}") and node_id and lname not in _SUPPORTED_SUBTREE_NODE_TYPES and lname not in _SUPPORTED_AUXILIARY_SUBTREE_ELEMENT_TYPES and lname not in _SUPPORTED_SUBTREE_EDGE_TYPES ): raise ClipboardSerializationError( "unsupported_*subprocess*_topology", f"*subprocess* subtree contains unsupported BPMN node type: {lname}…
```

### #4 — const children = toArray(childrenByParentStepId[key]).filter((child) => !emitted
- **score**: 30.694
- **path**: `/opt/processmap-test/frontend/src/components/process/interview/timelineViewModel.js`
- **source/category**: frontend-src / code
- **why_matched**: heading_match
- **snippet**:
```
## const *child*ren = toArray(*child*renBy*Parent*StepId[key]).filter((*child*) => !emitted
const *child*ren = toArray(*child*renBy*Parent*StepId[key]).filter((*child*) => !emitted.has(stepKey(*child*))); out.push({ ...step, depth, is_*subprocess*_*child*: depth > 0, *subprocess*_*parent*_step_id: depth > 0 ? *parent*StepId : "", *subprocess*_*child*ren_count: *child*ren.length, seq_label: path.join("."), }); emitted.add(key); *child*ren.forEach((*child*, idx) => { pushWith*Child*ren(*child*, [...path, idx + 1], depth + 1, key); }); recursionGuard.delete(key); }
```

### #5 — def walk(el: Any, current_subprocess_id: str = "") -> None:
- **score**: 30.291
- **path**: `/opt/processmap-test/backend/app/auto_pass_engine.py`
- **source/category**: backend-src / code
- **why_matched**: heading_match
- **snippet**:
```
## def walk(el: Any, current_*subprocess*_id: str = "") -> None:
def walk(el: Any, current_*subprocess*_id: str = "") -> None: local = _ln(getattr(el, "tag", "")) el_id = _as_text(getattr(el, "attrib", {}).get("id")) if el_id and el_id in node_type_by_id: node_*parent*_*subprocess*[el_id] = _as_text(current_*subprocess*_id) next_*subprocess*_id = current_*subprocess*_id if local in {"*subprocess*", "adhoc*subprocess*"} and el_id: next_*subprocess*_id = el_id for *child* in list(el): walk(*child*, next_*subprocess*_id) walk(root, "") start_event_ids = [_as_text(x) for x in _as_list(graph_dict.get("start_event_ids")) if …
```

### #6 — def test_session_project_and_recursive_folder_aggregation_counts_only_open_threa
- **score**: 28.751
- **path**: `/opt/processmap-test/backend/tests/test_notes_mvp1_aggregation_api.py`
- **source/category**: backend-src / code
- **why_matched**: heading_match
- **snippet**:
```
## def test_*session*_project_and_recursive_folder_aggregation_counts_only_open_threa
def test_*session*_project_and_recursive_folder_aggregation_counts_only_open_threads(self): *parent*_folder_id = str( self.create_workspace_folder( self.org_id, self.workspace_id, "*Parent* Folder", user_id=str(self.editor.get("id") or ""), ).get("id") or "" ) *child*_folder_id = str( self.create_workspace_folder( self.org_id, self.workspace_id, "*Child* Folder", *parent*_id=*parent*_folder_id, user_id=str(self.editor.get("id") or ""), ).get("id") or "" ) *parent*_project_id, *parent*_*session*_id = self._create_project_*session*(pa…
```

### #7 — def materialize_subprocess_payload_into_session(
- **score**: 27.720
- **path**: `/opt/processmap-test/backend/app/clipboard/materializer.py`
- **source/category**: backend-src / code
- **why_matched**: heading_match
- **snippet**:
```
## def materialize_*subprocess*_payload_into_*session*(
def materialize_*subprocess*_payload_into_*session*( *, payload: Clipboard*Subprocess*Payload, target_*session*_id: str, request: Request, placement_hint: Optional[Dict[str, Any]] = None, ) -> ClipboardPasteResponse: target_*session*, target_org_id, user_id = _load_target_*session*_for_edit(target_*session*_id, request) if str(payload.context.source_*session*_id or "").strip() == str(target_*session*_id or "").strip(): # same-*session* paste is still a valid isolated insert pass lock = acquire_*session*_lock(str(target_*session*.id or target_*session*_id), ttl_ms=1500…
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
node tools/rag/pm-rag-search.mjs "subprocess transition" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "subprocess transition" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "subprocess-transition-audit" --area "subprocess transition" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
