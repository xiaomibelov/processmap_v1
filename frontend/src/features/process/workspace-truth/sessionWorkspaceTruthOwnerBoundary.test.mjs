import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorkspaceTruthSnapshotFromSession,
  classifyWorkspaceSyncSource,
  resolveWorkspaceMutationCommand,
} from "./sessionWorkspaceTruthOwnerBoundary.js";

test("buildWorkspaceTruthSnapshotFromSession normalizes snapshot fields", () => {
  const snapshot = buildWorkspaceTruthSnapshotFromSession({
    session_id: "sid_1",
    bpmn_xml: "<bpmn:definitions id=\"Persisted\"/>",
    bpmn_xml_version: "7",
    diagram_state_version: "9",
    bpmn_graph_fingerprint: "fp_1",
  }, {
    source: "manual_save",
  });
  assert.equal(snapshot.sessionId, "sid_1");
  assert.equal(snapshot.bpmn_xml, "<bpmn:definitions id=\"Persisted\"/>");
  assert.equal(snapshot.bpmn_xml_version, 7);
  assert.equal(snapshot.diagram_state_version, 9);
  assert.equal(snapshot.bpmn_graph_fingerprint, "fp_1");
  assert.equal(snapshot.source, "manual_save");
});

test("classifyWorkspaceSyncSource marks primary accepted and projection sources", () => {
  const accepted = classifyWorkspaceSyncSource("manual_save");
  assert.equal(accepted.isPrimaryAcceptedSource, true);
  assert.equal(accepted.isPrimaryTruthSource, true);
  assert.equal(accepted.isProjectionSource, false);

  const projection = classifyWorkspaceSyncSource("manual_save_session_companion_session_patch");
  assert.equal(projection.isPrimaryAcceptedSource, false);
  assert.equal(projection.isPrimaryTruthSource, false);
  assert.equal(projection.isProjectionSource, true);

  const reload = classifyWorkspaceSyncSource("save_conflict_refresh");
  assert.equal(reload.isDurableReloadSource, true);
  assert.equal(reload.isPrimaryTruthSource, true);
});

test("resolveWorkspaceMutationCommand routes known mutation types", () => {
  assert.equal(resolveWorkspaceMutationCommand("diagram.property.update"), "applyPropertyChange");
  assert.equal(resolveWorkspaceMutationCommand("diagram.template.apply"), "applyTemplate");
  assert.equal(resolveWorkspaceMutationCommand("diagram.copy_paste"), "applyCopyPaste");
  assert.equal(resolveWorkspaceMutationCommand("diagram.move"), "applyDiagramEdit");
});

