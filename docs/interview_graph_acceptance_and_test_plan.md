# Interview Graph Acceptance And Test Plan (PROMPT 1-4)

## Scope
- Graph-driven interview ordering and branching.
- Correct gateway between-step blocks (XOR/Inclusive/Parallel).
- Stable loop handling (no infinite expansion).
- Unified time model across Interview and Process Document.
- Graph-consistent document sections 4.1/4.2.

## Acceptance Criteria

### 1) Interview Timeline
- Mainline order follows BPMN `sequenceFlow` traversal only.
- No dependence on:
  - creation order,
  - XML element order,
  - BPMN DI shape order,
  - lane order.
- For each split gateway on mainline, a `BetweenBranchesItem` is rendered **between** step `N` and `N+1`.
- Primary branch represents continuation to next mainline step.
- Non-primary branches render real nested branch steps and loop markers.
- Non-primary branches must not jump to unrelated global indexes (`#73`, `#74`).
- Loop/back-edge is shown as `↩` marker with explicit target reference; branch expansion is finite.
- Parallel blocks are anchored strictly to their own gateway anchor; no forced re-parenting.

### 2) Process Document
- Section 4.1 (Nodes):
  - nodes are classified by strict reachability from start: `mainline` / `branch` / `detached`.
  - graph path (`graph_path`) is displayed from traversal model.
- Section 4.2 (Sequence flows):
  - each flow row includes source/target with graph path + node id + node name,
  - sorting reflects traversal order (mainline first, then branch grouped by gateway anchor, then detached).
- No pseudo step numbers from internal creation indexes are exposed as graph order.

### 3) Time Model
- Single shared model is used for Interview and Document:
  - `time_kind`: `fixed | range | unknown`,
  - `duration_sec`, `min_sec`, `max_sec`, `expected_sec`,
  - `duration_note`, source.
- Per-step time badge is shown in Interview when time exists.
- Between-branches block shows branch time summary.
- Mainline cumulative/total timing is shown in Interview.
- Document uses the same time parsing/formatting and aggregation:
  - section 2 summary mainline time,
  - branch time summary table,
  - node time column in 4.1.
- Loop branches are marked `+ loop`; totals are not expanded infinitely.

## Automated Tests Matrix

### Unit: Graph Layer
- `frontend/src/components/process/interview/graph/buildGraphModel.test.mjs`
  - parses nodes/flows and transition labels,
  - detects detached node reachability,
  - detects split/join for XOR and Parallel gateways,
  - verifies safe reachability fallback for low-coverage graphs.

### Unit: Interview Model Layer
- `frontend/src/components/process/interview/model/buildInterviewModel.test.mjs`
  - mainline traversal is deterministic,
  - between-branches block is created for split gateways,
  - non-primary branch keeps real steps (no invalid continue),
  - loop branch produces loop marker,
  - parallel split is rendered as between-branches structure.

### Unit: ViewModel Layer
- `frontend/src/components/process/interview/viewmodel/buildTimelineItems.test.mjs`
  - inserts `between_branches` item directly after anchor step,
  - ignores invalid/non-between branch blocks.

### Unit: Time Model
- `frontend/src/features/process/lib/timeModel.test.mjs`
  - parses fixed/range durations,
  - summarizes branch timings,
  - handles nested decision timing and loop flags.

### E2E / UI Smoke (existing)
- `frontend/e2e/interview-gateway-branches-afbb.spec.mjs`
  - validates nested branches/loop behavior on `afbb609e19`,
  - ensures no leaked `#73/#74` continuation.
- `frontend/e2e/diagram-save-hard-refresh.spec.mjs`
- `frontend/e2e/diagram-save-tab-switch.spec.mjs`
  - autosave + sync integrity around Diagram/Interview transitions.

## Manual Smoke Checklist

### Session `afbb609e19`
1. Open Interview and verify first 10 steps match sequenceFlow logic.
2. Verify gateway “Передать в доставку”:
   - between-step block exists between gateway and next mainline step,
   - branch “Нет” shows real nested steps + loop marker.
3. Verify gateway “Какой вид тары?”:
   - both branch scenarios are visible,
   - no unrelated continue jump labels.

### Document verification
1. Open Process Document.
2. Validate first ~30 rows in 4.1 Nodes against BPMN graph.
3. Validate first ~30 rows in 4.2 Flows against sequenceFlow source/target pairs and graph paths.

### Reachability safety check
1. For sessions with incomplete runtime edges, confirm interview/document stay readable.
2. If strict reachability would hide most nodes, safe mode should prevent near-empty output.

## Commands
- Unit tests:
  - `npm --prefix frontend test -- src/components/process/interview/graph/buildGraphModel.test.mjs src/components/process/interview/model/buildInterviewModel.test.mjs src/components/process/interview/viewmodel/buildTimelineItems.test.mjs src/features/process/lib/timeModel.test.mjs`
- Build:
  - `npm --prefix frontend run build`
