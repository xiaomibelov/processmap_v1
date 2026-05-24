# RAG Search Index

**Version:** 1.0.0
**Generated:** 2026-05-23T14:51:13.655Z
**Manifest Version:** 1.1.0
**Total Chunks:** 44801
**AvgDL:** 41.05
**BM25 k1:** 1.2
**BM25 b:** 0.75
**Unique Terms:** 40535

## Sample Chunks (first 20)

### chunk-000034bb986c2e6e
- **Path:** `/opt/processmap-test/backend/app/routers/notes.py`
- **Title:** class PatchNoteCommentBody(BaseModel):
- **Category:** code | **Class:** code_map
- **Tokens:** 15
- **Snippet:** class PatchNoteCommentBody(BaseModel): body: str mention_user_ids: Optional[List[str]] = None…

### chunk-00013b4cccd7a202
- **Path:** `/opt/processmap-test/backend/app/clipboard/materializer.py`
- **Title:** def _collect_existing_ids(root: ET.Element) -> Set[str]:
- **Category:** code | **Class:** code_map
- **Tokens:** 42
- **Snippet:** def _collect_existing_ids(root: ET.Element) -> Set[str]: out: Set[str] = set() for elem in root.iter(): elem_id = str(el…

### chunk-0001cf7630a2945f
- **Path:** `/opt/processmap-test/frontend/src/features/topbar/TopBar.jsx`
- **Title:** TopBar.jsx
- **Category:** code | **Class:** draft
- **Tokens:** 233
- **Snippet:** import { useMemo } from "react"; import TopRightCtaGroup from "../../components/nav/TopRightCtaGroup"; function projectI…

### chunk-000289a99a5e0937
- **Path:** `/opt/processmap-test/.planning/contours/test-plan-2026-05-21/OBSIDIAN_CONTEXT_USED.md`
- **Title:** 3. Obsidian Context Used
- **Category:** contour | **Class:** draft
- **Tokens:** 115
- **Snippet:** **Score:** 41.419 | **Matched:** obsidian, project, atlas, processmap, planning, context, 2026, 05 **Boosts:** exact_con…

### chunk-00062ef4060adc70
- **Path:** `/opt/processmap-test/backend/app/routers/explorer.py`
- **Title:** def _executor_out(user_id: str) -> Optional[Dict[str, str]]:
- **Category:** code | **Class:** code_map
- **Tokens:** 30
- **Snippet:** def _executor_out(user_id: str) -> Optional[Dict[str, str]]: return build_assignable_user_payload(user_id) # ─── Cached …

### chunk-000758f70905ba25
- **Path:** `/opt/processmap-test/frontend/src/features/process/bpmn/packs/bpmnPacks.js`
- **Title:** const tx = db.transaction(PACK_DB_STORE, "readwrite");
- **Category:** code | **Class:** code_map
- **Tokens:** 38
- **Snippet:** const tx = db.transaction(PACK_DB_STORE, "readwrite"); tx.objectStore(PACK_DB_STORE).put(pack); tx.oncomplete = () => re…

### chunk-00085ce8923e013e
- **Path:** `/opt/processmap-test/frontend/src/features/process/lib/timeModel.js`
- **Title:** if (range) {
- **Category:** code | **Class:** code_map
- **Tokens:** 4
- **Snippet:** if (range) {…

### chunk-000877fead85a891
- **Path:** `/opt/processmap-test/frontend/src/components/process/BpmnStage.jsx`
- **Title:** const source = String(storeEvent.source || "");
- **Category:** code | **Class:** code_map
- **Tokens:** 10
- **Snippet:** const source = String(storeEvent.source || "");…

### chunk-00088e9ca8263185
- **Path:** `/opt/processmap-test/frontend/src/components/process/BpmnStage.jsx`
- **Title:** const reason = String(status?.reason || fallbackReason || "").trim() || "status"
- **Category:** code | **Class:** code_map
- **Tokens:** 16
- **Snippet:** const reason = String(status?.reason || fallbackReason || "").trim() || "status";…

### chunk-0008d7b243d90d35
- **Path:** `/opt/processmap-test/frontend/src/components/process/BpmnStage.jsx`
- **Title:** let mql;
- **Category:** code | **Class:** code_map
- **Tokens:** 18
- **Snippet:** let mql; try { mql = window.matchMedia("(prefers-reduced-motion: reduce)"); } catch { prefersReducedMotionRef.current = …

### chunk-00091214eec36103
- **Path:** `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-noise-cleanup-single-container-v1/RAG_PREFLIGHT_WORKER_3.md`
- **Title:** #2 — uiux/product-actions-registry-workspace-ux-redesign-v1
- **Category:** contour | **Class:** draft
- **Tokens:** 90
- **Snippet:** - **score**: 26.643 - **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-rede…

### chunk-000cba58d7e8827e
- **Path:** `/opt/processmap-test/frontend/src/features/process/lib/processStageDomain.js`
- **Title:** const rawName = String(el.getAttribute("name") || "").trim();
- **Category:** code | **Class:** code_map
- **Tokens:** 36
- **Snippet:** const rawName = String(el.getAttribute("name") || "").trim(); nodeTypeById[id] = local; nodeRawNameById[id] = rawName; n…

### chunk-001165bf515abb12
- **Path:** `/opt/processmap-test/frontend/src/features/process/bpmn/stage/viewport/viewportRecovery.js`
- **Title:** const guard = typeof options?.guard === "function" ? options.guard : null;
- **Category:** code | **Class:** code_map
- **Tokens:** 18
- **Snippet:** const guard = typeof options?.guard === "function" ? options.guard : null;…

### chunk-0015cad871210946
- **Path:** `/opt/processmap-test/frontend/src/features/process/stage/components/LayersPopover.jsx`
- **Title:** const selectedKind = panelSelectedKind || (selectedDrawioId ? OVERLAY_ENTITY_KIN
- **Category:** code | **Class:** code_map
- **Tokens:** 15
- **Snippet:** const selectedKind = panelSelectedKind || (selectedDrawioId ? OVERLAY_ENTITY_KINDS.DRAWIO : "");…

### chunk-0016d2bf99333271
- **Path:** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-polished-table-layout-v1/WORKER_2_REPORT.md`
- **Title:** What changed
- **Category:** project_atlas | **Class:** draft
- **Tokens:** 59
- **Snippet:** - Header hierarchy, export placement, and compact back navigation. - Compact metrics dashboard with semantic complete/in…

### chunk-0016eb2e2e3d5ecb
- **Path:** `/opt/processmap-test/frontend/src/components/ProcessStage.jsx`
- **Title:** const session_id = toText(sessionLike?.session_id || sessionLike?.id);
- **Category:** code | **Class:** code_map
- **Tokens:** 25
- **Snippet:** const session_id = toText(sessionLike?.session_id || sessionLike?.id); if (!session_id || typeof onOpenWorkspaceSession …

### chunk-00188f3e62bf9a2e
- **Path:** `/opt/processmap-test/frontend/src/components/process/interview/timelineViewModel.js`
- **Title:** const bpmnKind = toText(node?.bpmnKind).toLowerCase();
- **Category:** code | **Class:** code_map
- **Tokens:** 28
- **Snippet:** const bpmnKind = toText(node?.bpmnKind).toLowerCase(); if (nodeType === "timer" || bpmnKind === "intermediatecatchevent"…

### chunk-00193e262523ce18
- **Path:** `/opt/processmap-test/frontend/src/features/process/hybrid/hybridLayerV2.js`
- **Title:** const geom = asObject(cell.geometry);
- **Category:** code | **Class:** code_map
- **Tokens:** 10
- **Snippet:** const geom = asObject(cell.geometry);…

### chunk-001aad4021fe07a4
- **Path:** `/opt/processmap-test/frontend/src/features/process/bpmn/context-menu/resolveBpmnContextMenuTarget.js`
- **Title:** const strictConnectionThreshold = Math.max(6, 14 / scale);
- **Category:** code | **Class:** code_map
- **Tokens:** 12
- **Snippet:** const strictConnectionThreshold = Math.max(6, 14 / scale);…

### chunk-001b47720481d13c
- **Path:** `/opt/processmap-test/frontend/src/App.jsx`
- **Title:** const currentSessionId = String(draft?.session_id || "").trim();
- **Category:** code | **Class:** code_map
- **Tokens:** 14
- **Snippet:** const currentSessionId = String(draft?.session_id || "").trim();…

---

**Read-only boundary:** This index is for retrieval context only. No auto-mutation.
