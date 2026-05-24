# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: feature/process-analytics-hub-and-registry-navigation-v1
- **area/query**: executor part 2 context
- **generated_at**: 2026-05-17T08:54:16.029Z

## Structured Facts

### Agent Rules
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- Version marker must not overlay the BPMN canvas. (All diagram/UI contours)
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)
- For TO-BE format, follow only the user-provided document; no invented terms unless marked hypothesis. (All TO-BE modeling and process design contours)

### Bottlenecks
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — def test_schema_has_folder_responsible_context_and_project_executor_fields(self)
- **score**: 18.231
- **path**: `/opt/processmap-test/backend/tests/test_explorer_responsible_context_fields.py`
- **source/category**: backend-src / code
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## def test_schema_has_folder_responsible_*context*_and_project_*executor*_fields(self)
def test_schema_has_folder_responsible_*context*_and_project_*executor*_fields(self): folder_columns = self._columns("workspace_folders") project_columns = self._columns("projects") self.assertIn("responsible_user_id", folder_columns) self.assertIn("*context*_status", folder_columns) self.assertIn("responsible_assigned_at", folder_columns) self.assertIn("responsible_assigned_by", folder_columns) self.assertIn("*executor*_user_id", project_columns)
```

### #2 — const p = Number(part);
- **score**: 14.499
- **path**: `/opt/processmap-test/frontend/src/components/process/interview/utils.js`
- **source/category**: frontend-src / code
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
## const p = Number(*part*);
const p = Number(*part*);
```

### #3 — Part D — Validate After Fix
- **score**: 14.393
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
[contour: diagram-visible-version-and-large-canvas-lag-v1] ## *Part* D — Validate After Fix
1. **Rebuild and restart 5180 if needed.** 2. **Fresh browser *context*** (`?cb=<timestamp>`): - Verify visible version marker. - Verify build-info.json and window marker. 3. **Large no-overlays canvas**: - Record DOM/SVG counts. - Pan/zoom — record smoothness. - Selection — verify selection-lite, property panel. - Tab switch — verify no full reload, `.djs-container` stays at 1. 4. **Network**: - 0 PUT `/bpmn` from view interactions. - 0 PATCH `/sessions` from view interactions. - No versions spam. 5. **Bui…
```

### #4 — Part D — Validate After Fix
- **score**: 14.393
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/diagram-visible-version-and-large-canvas-lag-v1/EXECUTOR_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## *Part* D — Validate After Fix
1. **Rebuild and restart 5180 if needed.** 2. **Fresh browser *context*** (`?cb=<timestamp>`): - Verify visible version marker. - Verify build-info.json and window marker. 3. **Large no-overlays canvas**: - Record DOM/SVG counts. - Pan/zoom — record smoothness. - Selection — verify selection-lite, property panel. - Tab switch — verify no full reload, `.djs-container` stays at 1. 4. **Network**: - 0 PUT `/bpmn` from view interactions. - 0 PATCH `/sessions` from view interactions. - No versions spam. 5. **Build/tests**: - `npm run build` passes. - Existing tests stil…
```

### #5 — export function percent(part, total) {
- **score**: 14.255
- **path**: `/opt/processmap-test/frontend/src/components/process/interview/utils.js`
- **source/category**: frontend-src / code
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
## export function percent(*part*, total) {
export function percent(*part*, total) {
```

### #6 — Part C — Implement Canvas Lag Fix
- **score**: 14.152
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/diagram-visible-version-and-large-canvas-lag-v1/EXECUTOR_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## *Part* C — Implement Canvas Lag Fix
**Choose based on baseline evidence.**
```

### #7 — Part C — Implement Canvas Lag Fix
- **score**: 14.152
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
[contour: diagram-visible-version-and-large-canvas-lag-v1] ## *Part* C — Implement Canvas Lag Fix
**Choose based on baseline evidence.**
```

### #8 — def merge_allOf(doc: Dict[str, Any], schema: Dict[str, Any]) -> Dict[str, Any]:
- **score**: 12.878
- **path**: `/opt/processmap-test/scripts/fpc_openapi_to_md_v1.sh`
- **source/category**: scripts-src / code
- **why_matched**: recent_14d
- **snippet**:
```
def merge_allOf(doc: Dict[str, Any], schema: Dict[str, Any]) -> Dict[str, Any]: if "allOf" not in schema: return schema out: Dict[str, Any] = {} req: List[str] = [] props: Dict[str, Any] = {} for *part* in schema.get("allOf", []): if isinstance(*part*, dict) and "$ref" in *part*: *part* = resolve_ref(doc, *part*["$ref"]) if not isinstance(*part*, dict): continue *part* = merge_allOf(doc, *part*) req.extend(*part*.get("required", []) or []) props.update(*part*.get("properties", {}) or {}) # keep title/description if present for k in ("title", "description", "type"): if k in *part* and k not in out: out[k] = *part*[k] 
```

### #9 — EXECUTOR_PROMPT — Agent 2 / Executor
- **score**: 12.875
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-agent-rag-coverage-and-validation-hardening-v1] ## *EXECUTOR*_PROMPT — Agent 2 / *Executor*
**Contour:** `feature/processmap-agent-rag-coverage-and-validation-hardening-v1` **Run ID:** `20260516T151430Z-2767` **Agent:** Agent 2 / *Executor* ---
```

### #10 — EXECUTOR_PROMPT — Agent 2 / Executor
- **score**: 12.875
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/EXECUTOR_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## *EXECUTOR*_PROMPT — Agent 2 / *Executor*
**Contour:** `feature/processmap-agent-rag-coverage-and-validation-hardening-v1` **Run ID:** `20260516T151430Z-2767` **Agent:** Agent 2 / *Executor* ---
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
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "executor part 2 context" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "executor part 2 context" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "feature/process-analytics-hub-and-registry-navigation-v1" --area "executor part 2 context" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
