# VALIDATION_QUERIES — ProcessMap Agent RAG / Knowledge Layer

Contour: architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1

---

## Query 1: Diagram REVIEW_PASS Rules

**Query:** "What are the latest rules for Diagram REVIEW_PASS?"

**Expected Answer:**
- GSD reviewer discipline is mandatory
- Real drag (not synthetic) is required for diagram perf contours
- Version proof (build-info badge) is required
- No source-only pass — must have user-visible/runtime proof
- Acceptance criteria must be explicitly verified

**Sources That Should Be Retrieved:**
- `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/REVIEWER_GSD_GATE_REPORT.md`
- `fix/diagram-real-drag-performance-and-engine-decomposition-v1/VERSION_MARKER_RELOCATION_PROOF.md`
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/REAL_DRAG_HOT_PATH_BASELINE.md`
- `AGENTS.md` (hard rules)

**Pass/Fail Criteria:**
- **Pass**: Retrieved sources include at least one contour with explicit drag/version proof requirements and AGENTS.md rules
- **Fail**: Answer is generic (no contour references) or misses version proof / real drag requirements

---

## Query 2: Perf Contour History — Drag Hot Path

**Query:** "What happened in perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1?"

**Expected Answer:**
- Version v1.0.129 baseline
- Metrics showed no improvement from pointermove suppression
- React bundle accounted for ~95% of profile
- Next recommended contour: `perf/process-stage-baseline-jank-v1`
- REWORK_REQUEST.md was issued and completed

**Sources That Should Be Retrieved:**
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/EXEC_REPORT.md`
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/DRAG_HOT_PATH_ROOT_CAUSE.md`
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/POINTERMOVE_SIDE_EFFECTS_REPORT.md`
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/REWORK_REQUEST.md`
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/REWORK_COMPLETE`

**Pass/Fail Criteria:**
- **Pass**: Answer includes version, metrics outcome, React bundle %, and next contour name
- **Fail**: Answer is vague or misses the rework completion / next contour recommendation

---

## Query 3: Current Diagram Lag Bottlenecks

**Query:** "What are current Diagram lag bottlenecks?"

**Expected Answer:**
- React baseline jank (ProcessStage / App shell render cost)
- Not bpmn-js engine based on profiler evidence
- Drag lag remains unresolved (real drag hot path)
- Decor overlays contribute when enabled
- Large canvas lag observed on big diagrams

**Sources That Should Be Retrieved:**
- `perf/process-stage-baseline-jank-v1/BASELINE_REACT_JANK_PROFILE.md`
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/PROFILER_EVIDENCE.md`
- `audit/diagram-baseline-no-overlays-canvas-profile-v1/BASELINE_PROFILE_REPORT.md`
- `fix/diagram-visible-version-and-large-canvas-lag-v1/CANVAS_LAG_ROOT_CAUSE.md`

**Pass/Fail Criteria:**
- **Pass**: Answer identifies React jank, unresolved drag, and distinguishes engine vs React cost
- **Fail**: Answer blames bpmn-js engine (contradicts profiler evidence) or misses React jank

---

## Query 4: RAG Forbidden Actions

**Query:** "What is forbidden for RAG?"

**Expected Answer:**
- No secrets indexing
- No auto-mutation of code or files
- No BPMN XML writes
- No AI drafts treated as canonical truth
- No auto-save or auto-apply of Product Actions
- No override of human review verdict

**Sources That Should Be Retrieved:**
- `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md` (Read-only Boundary)
- `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/INDEXING_POLICY.md`
- `AGENTS.md` (restrictions)

**Pass/Fail Criteria:**
- **Pass**: Answer lists at least 4 forbidden items with explicit boundary language
- **Fail**: Answer suggests RAG can auto-apply suggestions or misses secrets prohibition

---

## Query 5: Indexed Source Paths

**Query:** "Which paths should be indexed?"

**Expected Answer:**
- Project Atlas (`/srv/obsidian/project-atlas/ProcessMap`) — curated
- Planning contours (`/opt/processmap-test/.planning/contours`) — all reports
- Docs (`/opt/processmap-test/docs`, `PROCESSMAP/HANDOFF`) — curated
- Selected code (`frontend/src`, `backend`, `tools`, `scripts`) — key files only
- Excludes: `.env`, secrets, `node_modules`, raw dumps, `_Imported` pending triage

**Sources That Should Be Retrieved:**
- `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/SOURCE_INVENTORY.md`
- `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/INDEXING_POLICY.md`
- `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md` (Source Inventory Plan)

**Pass/Fail Criteria:**
- **Pass**: Answer includes all 4 source roots and explicit exclusions
- **Fail**: Answer suggests indexing everything without curation or misses exclusions

---

## Query 6: ProcessMap Test Runtime

**Query:** "What is current ProcessMap test runtime?"

**Expected Answer:**
- Server: clearvestnic.ru
- Frontend served at :5180 via nginx (HTTP 200 OK, no-cache)
- Backend health at :8088/health (ok, redis healthy)
- Working dir: `/opt/processmap-test`
- Build-info / version proof required for deploy verification
- Current branch: `fix/lockfile-sync-test` (8 uncommitted files)

**Sources That Should Be Retrieved:**
- `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/RUNTIME_NAVIGATION.md`
- `fix/diagram-5180-version-proof-and-canvas-lag-regression-v1/RUNTIME_VERSION_PROOF.md`
- `tooling/project-atlas-sync-and-rag-bootstrap-v1/RUNTIME_NAVIGATION.md` (if exists)
- `AGENTS.md` (runtime proof requirements)

**Pass/Fail Criteria:**
- **Pass**: Answer includes host, ports, health status, working dir, and version proof requirement
- **Fail**: Answer gives stale or incorrect port/health info or misses version proof

---

## Query 7: CHANGES_REQUESTED Contours (Bonus)

**Query:** "Which contours had CHANGES_REQUESTED and why?"

**Expected Answer:**
- `research/product-actions-ai-ag-ui-protocol-fit-v1` — CHANGES_REQUESTED + REWORK_REQUEST.md
- `uiux/product-actions-registry-workspace-ux-redesign-v1` — CHANGES_REQUESTED + REWORK_REQUEST.md
- `perf/diagram-derived-maps-and-render-boundary-v1` — REWORK_REQUEST.md (post-pass rework)
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1` — REWORK_REQUEST.md (post-pass rework)
- `perf/process-stage-baseline-jank-v1` — REWORK_REQUEST.md (post-pass rework)

**Sources That Should Be Retrieved:**
- `research/product-actions-ai-ag-ui-protocol-fit-v1/REWORK_REQUEST.md`
- `uiux/product-actions-registry-workspace-ux-redesign-v1/REWORK_REQUEST.md`
- `perf/diagram-derived-maps-and-render-boundary-v1/REWORK_REQUEST.md`
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/REWORK_REQUEST.md`
- `perf/process-stage-baseline-jank-v1/REWORK_REQUEST.md`

**Pass/Fail Criteria:**
- **Pass**: Answer lists at least 4 contours with REWORK_REQUEST and distinguishes pre-pass vs post-pass
- **Fail**: Answer misses high-priority rework contours or confuses them with REVIEW_PASS only

---

## Validation Execution Notes

- These queries will be run against the indexed RAG corpus in contour `implementation/rag-validation-and-test-queries-v1`
- Precision measured: did retrieved sources match expected?
- Recall measured: were all expected sources retrieved?
- Pass threshold: 5/6 primary queries pass (Query 7 is bonus)
- Tuning levers: chunk size, metadata boost weights, BM25 k1/b parameters

