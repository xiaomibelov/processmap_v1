# Repo Snapshot

## 1.1 Git
- Branch: `feat/enterprise-step5-ci-e2e-finalize-v1`
- HEAD: `75ede44`
- `git status -sb`:
```text
## feat/enterprise-step5-ci-e2e-finalize-v1
 M frontend/src/components/ProcessStage.jsx
 M frontend/src/styles/tailwind.css
?? backend/workspace/
?? frontend/e2e/hybrid-layer-layers.spec.mjs
?? frontend/src/features/process/hybrid/
```

## 1.2 Checkpoint tags (`cp/*`, latest 20)
```text
cp/enterprise_step5_done_20260303_182644
cp/enterprise_step4_done_20260303_160721
cp/enterprise_step5_start_20260303_171009
cp/enterprise_step3_done_20260303_141544
cp/enterprise_step4_start_20260303_143357
cp/enterprise_step2_done_20260303_132440
cp/enterprise_step3_start_20260303_133410
cp/enterprise_step1_done_20260303_122137
cp/enterprise_step2_start_20260303_124905
cp/enterprise_step1_start_20260303_122137
cp/bpmnstage_ai_panel_done_20260302_225558
cp/bpmnstage_imperative_api_start_20260302_225945
cp/bpmnstage_ai_panel_start_20260302_223728
cp/bpmnstage_commandops_done_20260302_223628
cp/bpmnstage_commandops_start_20260302_222940
cp/bpmnstage_templatepacks_done_20260302_222806
cp/bpmnstage_decompose_playback_done_20260302_221726
cp/bpmnstage_templatepacks_start_20260302_221828
cp/bpmnstage_decompose_playback_start_20260302_220812
cp/sidebar_rework_block2_4_20260302_212025
```

## 1.3 Branch heads (requested)
- `feat/robotmeta-v1` -> `518744f`
- `feat/enterprise-step5-ci-e2e-finalize-v1` -> `75ede44` (matches expected)
- `feat/bpmnstage-decompose-imperative-api-v1` -> `9705c27` (matches expected)

# Feature Map (path -> file -> what/entry points)

## 2.1 RobotMeta v1
- Schema/type/normalize/status:
  - `frontend/src/features/process/robotmeta/robotMeta.js`
  - `normalizeRobotMetaV1` (line 114), `validateRobotMetaV1` (151), `canonicalizeRobotMeta` (223), `getRobotMetaStatus` (275)
- UI edit:
  - `frontend/src/components/sidebar/ElementSettingsControls.jsx`
  - `frontend/src/components/sidebar/SelectedNodeSection.jsx`
  - uses `canonicalizeRobotMeta` + `getRobotMetaStatus`
- Session meta read/write:
  - `frontend/src/App.jsx` (`robot_meta_by_element_id` merge/sync blocks around 486-638 and 2167+)
  - `backend/app/main.py` robot meta merge/apply around 1705+, 4258+, 4414+, 4571+
- BPMN XML export (`pm:RobotMeta`):
  - `syncRobotMetaToBpmn` in `robotMeta.js` (line 501)
  - integrated in `frontend/src/components/process/BpmnStage.jsx` call at ~1925
- BPMN XML hydrate + policy:
  - `extractRobotMetaFromBpmn` in `robotMeta.js` (397)
  - `hydrateRobotMetaFromBpmn` in same module (line ~472, policy session-meta-wins)
  - integrated in `BpmnStage.jsx` around ~1944
- Overlay ready/incomplete + node list:
  - derived statuses and overlays in `frontend/src/components/ProcessStage.jsx` (robotMetaStatus map around 1420+, counts/list/focus in Robot Meta popover around 6284+)

## 2.2 Reports (AI / DeepSeek)
- Backend endpoints:
  - Legacy reports in `backend/app/main.py` around 3562-3685 and helpers `_create_path_report_version_core`, `_delete_report_version_row`, `_delete_report_version_global`
  - Enterprise reports:
    - `GET /api/orgs/{org_id}/sessions/{session_id}/reports/versions` (5813)
    - `POST /api/orgs/{org_id}/sessions/{session_id}/reports/build` (5844)
    - `GET /api/orgs/{org_id}/sessions/{session_id}/reports/{version_id}` (5883)
    - `DELETE /api/orgs/{org_id}/sessions/{session_id}/reports/{version_id}` (5925)
- Normalization:
  - `backend/app/ai/deepseek_questions.py`
  - `normalize_deepseek_report_payload` (572), `normalizeDeepSeekReport` (692), `generate_path_report` (1333)
- UI reports drawer:
  - `frontend/src/components/process/interview/paths/ReportsDrawer.jsx`
- Polling/backoff:
  - report generation lifecycle and stale-running handling in `backend/app/main.py` (`_mark_stale_running_reports`, `_run_path_report_generation_async`)
  - frontend calls wrapped in `frontend/src/lib/api.js` with enterprise->legacy fallback for build/list/get/delete
- Versioning (not overwrite):
  - backend per-path versions map (`report_versions`) and version increment helper `_next_report_version` in `main.py`
  - delete version path updates latest pointer via `_recompute_latest_path_report_pointer`
- Delete report version UI handler:
  - reports drawer actions in `ReportsDrawer.jsx`
  - API call: `apiDeleteOrgReportVersion` / `apiDeleteReportVersion` in `frontend/src/lib/api.js`

## 2.3 Playback / manual gateways / flow-node highlighting
- Engine:
  - `frontend/src/features/process/playback/playbackEngine.js`
  - `classifyGateway` (171), manual wait enqueue (760-771), decision apply `chooseGatewayFlow` (914-942)
- Manual gateway UI:
  - Playback popover controls in `frontend/src/components/ProcessStage.jsx` (5949+)
  - Inline manual options block in popover (6128-6160)
  - Overlay gateway chooser in `frontend/src/features/process/bpmn/stage/playbackAdapter.js` (build overlay + option buttons around 126-210)
- Highlight flow/node:
  - `playbackAdapter.js` applies overlay classes/markers for `take_flow`, `enter_node`, `wait_for_gateway_decision`
- Order/branches:
  - playback builds execution graph and decides per gateway type in engine; manual mode only for split/mixed when >1 outgoing candidate.

## 2.4 HybridLayer (found in repo; started)
- Data model + prefs:
  - `frontend/src/features/process/hybrid/hybridLayerUi.js`
  - storage key `hybrid_ui_v1`, prefs normalize/load/save, map normalize
- Session-meta storage:
  - `hybrid_layer_by_element_id` persisted from `ProcessStage.jsx` around 4467-4510
- Renderer:
  - HTML overlay over BPMN stage in `ProcessStage.jsx` 6562-6640
- Layers UI:
  - action bar popover (6172-6280): toggle, mode, opacity, lock, focus, counters, H-peek hint
- Lock/opacity/peek + BPMN safety:
  - guard refs and click guards in `ProcessStage.jsx` (playback overlay guard around 3667+, hybrid guard around 4565+)
  - `Esc` from Edit->View and `H` temporary peek logic around 3574-3596

# Symptom Pack (manual gateways: repro + screenshots + console/network)

## Case A: XOR "Нет" selected -> no next step
### Repro
1. Open Diagram Playback.
2. Enable `Manual at gateways`.
3. Reach XOR gateway and click branch `"Нет"`.
### Expected
- Selected flow highlighted.
- Next node activated.
- Playback continues.
### Actual
- User report: stops after selection (`нет шага дальше`), marker remains near gateway/flow.
### Screenshots
- Source: user-provided thread image showing stop after `"Нет"` selection (gateway with `take_flow` marker).
### Console fragments (code-backed debug points)
```text
playbackEngine.js:760  logPlaybackDebug("gateway_wait_manual", ...)
playbackAdapter.js:198 logPlaybackDebug("gateway_option_click", ...)
playbackEngine.js:934  logPlaybackDebug("gateway_choice_applied", ...)
```
### Network fragment
- `rg` on playback files (`playbackEngine.js`, `playbackAdapter.js`) for `fetch|axios|/api|request` returned no matches.
- Fact: gateway choice path is local engine/UI state flow, not an HTTP request.

## Case B: Link Event return path stops at continuation point
### Repro
1. Run playback on scenario with Link Event return (`RESTART_SOUP` shown by user).
2. Playback reaches throw/catch return point.
### Expected
- Jump to matching link target and continue route.
### Actual
- User report: stops after return instead of continuing.
### Screenshots
- Source: user-provided thread image pair:
  - before jump at `RESTART_SOUP`
  - expected continuation node below (`Открыть холодильник заморозки`)
### Console fragments
- Relevant debug events to capture:
```text
gateway_enter / take_flow / enter_node / stop
```
- Current debug hooks exist in `playbackEngine.js` and `playbackAdapter.js` (`[PLAYBACK_DEBUG] ...`).
### Network fragment
- No playback network request expected on link-event transition (local engine path).

## Case C: Return-through-link + parallel/gateway area ends unexpectedly
### Repro
1. Execute scenario with return link entering area around parallel gateways.
2. Continue playback after branch return.
### Expected
- Join/continue semantics and movement to next task.
### Actual
- User report: playback finishes/stops near gateway in parallel section.
### Screenshots
- Source: user-provided thread image with two parallel gateways and stop location.
### Console fragments
- Engine has gateway classification logs:
```text
gateway_enter {incomingCount,outgoingCount,gatewayKind,manualRequired}
```
- Classification function: `classifyGateway` in `playbackEngine.js:171`.
### Network fragment
- No request expected at this stage; issue located in local event sequence and state transitions.

# HybridLayer Fact Pack v1

## 4.1 Proposed schema v1 (session meta)
```json
{
  "schema_version": "hybrid_layer_v1",
  "hybrid_layer": {
    "layers": [
      {
        "id": "default",
        "name": "Hybrid",
        "visible": true,
        "locked": false,
        "opacity": 0.6,
        "z_index": 1
      }
    ],
    "elements": [
      {
        "id": "hl_shape_1",
        "layer_id": "default",
        "type": "rect|ellipse|text|image",
        "x": 120,
        "y": 80,
        "w": 160,
        "h": 60,
        "style": { "fill": "#fff", "stroke": "#3b82f6", "stroke_width": 2 },
        "text": "optional",
        "binding": { "bpmn_node_id": "Task_1", "bpmn_edge_id": null }
      }
    ],
    "edges": [
      {
        "id": "hl_edge_1",
        "layer_id": "default",
        "source_element_id": "hl_shape_1",
        "target_element_id": "hl_shape_2",
        "style": { "stroke": "#334155", "arrow_end": true },
        "binding": { "bpmn_node_id": null, "bpmn_edge_id": "Flow_0abc" }
      }
    ],
    "view_prefs": {
      "active_layer_id": "default",
      "selected_ids": [],
      "snap_to_grid": false
    }
  }
}
```

## 4.2 Renderer approach (decision)
- Compared:
  - SVG overlay (single scene graph, easier transforms/hit-test)
  - HTML absolute overlays (already implemented, simpler incremental rollout)
- Current repo implementation is HTML overlay; keep this for v1 continuity.
- Safety integration:
  - sync with BPMN pan/zoom using computed positions from BPMN element centers (`ProcessStage.jsx` around 3529+)
  - in View mode use non-invasive interactions (hotspot only)
  - in Edit mode use shield + guard to prevent canvas side effects
  - no BPMN re-import on mode switch

## 4.3 Layers UX controls (existing + required)
- Existing (implemented in code):
  - Layers button in diagram action bar
  - Hybrid toggle, View/Edit, opacity presets (100/60/30), lock, focus
  - H key temporary peek
  - Esc exits edit mode
- Interaction safety hooks:
  - `markPlaybackOverlayInteraction(...)`
  - click-guard refs to avoid playback reset from overlay interactions

# Test Gates (commands + results)

## 5.1 Enterprise suite
- Command:
```bash
cd "$(git rev-parse --show-toplevel)" && ./scripts/e2e_enterprise.sh
```
- Result: **PASS** (`4 passed`)
  - `accept-invite-enterprise`
  - `org-settings-invites-audit`
  - `org-switcher`
  - `reports-delete-enterprise`

- Command:
```bash
cd "$(git rev-parse --show-toplevel)" && ./scripts/ci_enterprise_e2e.sh
```
- Result: **PASS** (`4 passed`)

## 5.2 RobotMeta e2e
- Command:
```bash
cd "$(git rev-parse --show-toplevel)" && ./scripts/e2e_enterprise.sh e2e/robotmeta-save-reload.spec.mjs
```
- Result: **FAIL** (`4 failed`, `3 passed`)
- Failures:
  - `e2e/org-settings-invites-audit.spec.mjs` waiting for `Invite token:` (not visible)
  - `e2e/robotmeta-save-reload.spec.mjs`:
    - `net::ERR_ABORTED` on `/app` in first case
    - topbar project selector not visible after login (2 cases)

## 5.3 Reports delete e2e
- Command:
```bash
cd "$(git rev-parse --show-toplevel)" && ./scripts/e2e_enterprise.sh e2e/reports-delete-enterprise.spec.mjs
```
- Result: **PASS** (`4 passed`, includes `enterprise reports: delete version removes it from list`)

# Next actions (strictly fact-based)
1. Add dedicated manual-gateway e2e spec with console capture (`[PLAYBACK_DEBUG]`) and screenshots for XOR `"Да/Нет"`, link return, and merge/pass-through continuation.
2. Stabilize e2e profile split: `robotmeta-save-reload` currently conflicts with enterprise suite expectations (login/topbar and invite-token assertion mismatch).
3. Keep playback diagnostics enabled via env flag only; capture ordered chain `gateway_wait_manual -> gateway_option_click -> gateway_choice_applied -> next take_flow/enter_node`.
4. For HybridLayer, consolidate current untracked implementation into a tagged checkpoint and add tests for `View/Edit/lock/peek` not resetting playback.
5. For reports, keep enterprise delete path as primary in UI when `activeOrgId` exists; fallback legacy only on 404/405 remains in `api.js`.

