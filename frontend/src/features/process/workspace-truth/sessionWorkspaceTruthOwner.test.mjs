import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionWorkspaceTruthOwner,
  isPrimaryTruthSource,
  isProjectionSource,
} from "./sessionWorkspaceTruthOwner.js";

function snapshot({
  sessionId = "sid_owner",
  xml = "<bpmn:definitions id=\"Base\"/>",
  xmlVersion = 1,
  diagramStateVersion = 1,
  source = "seed",
} = {}) {
  return {
    sessionId,
    bpmn_xml: xml,
    bpmn_xml_version: xmlVersion,
    diagram_state_version: diagramStateVersion,
    source,
  };
}

test("owner kernel initializes working+accepted snapshots from durable source", () => {
  const owner = createSessionWorkspaceTruthOwner({
    sessionId: "sid_owner",
    durableSnapshot: snapshot({
      xml: "<bpmn:definitions id=\"Durable\"/>",
      xmlVersion: 7,
      diagramStateVersion: 11,
    }),
  });
  const state = owner.getState();
  assert.equal(state.sessionId, "sid_owner");
  assert.equal(state.acceptedSnapshot.xml, "<bpmn:definitions id=\"Durable\"/>");
  assert.equal(state.acceptedSnapshot.xmlVersion, 7);
  assert.equal(state.workingSnapshot.xml, "<bpmn:definitions id=\"Durable\"/>");
  assert.equal(state.dirtyState.isDirty, false);
});

test("apply commands mutate working snapshot and keep accepted untouched before save", () => {
  const owner = createSessionWorkspaceTruthOwner({
    sessionId: "sid_owner",
    durableSnapshot: snapshot({
      xml: "<bpmn:definitions id=\"Base\"/>",
      xmlVersion: 1,
      diagramStateVersion: 1,
    }),
  });
  owner.applyDiagramEdit({
    reason: "diagram.move",
    patch: {
      xml: "<bpmn:definitions id=\"Moved\"/>",
    },
  });
  const state = owner.getState();
  assert.equal(state.workingSnapshot.xml, "<bpmn:definitions id=\"Moved\"/>");
  assert.equal(state.acceptedSnapshot.xml, "<bpmn:definitions id=\"Base\"/>");
  assert.equal(state.dirtyState.isDirty, true);
  assert.equal(state.dirtyState.changedByCommand, "applyDiagramEdit");
});

test("saveSession accepted updates accepted snapshot and clears dirty state", () => {
  const owner = createSessionWorkspaceTruthOwner({
    sessionId: "sid_owner",
    durableSnapshot: snapshot({
      xml: "<bpmn:definitions id=\"Base\"/>",
      xmlVersion: 1,
      diagramStateVersion: 1,
    }),
  });
  owner.applyPropertyChange({
    reason: "property.rename",
    patch: {
      xml: "<bpmn:definitions id=\"Renamed\"/>",
    },
  });
  owner.saveSessionStart({ source: "manual_save" });
  owner.saveSessionAccepted({
    source: "manual_save",
    primaryAck: {
      bpmn_xml: "<bpmn:definitions id=\"Renamed\"/>",
      bpmn_xml_version: 2,
      diagram_state_version: 3,
      bpmnVersionSnapshot: {
        id: "ver_2",
        revisionNumber: 2,
      },
    },
  });
  const state = owner.getState();
  assert.equal(state.acceptedSnapshot.xml, "<bpmn:definitions id=\"Renamed\"/>");
  assert.equal(state.acceptedSnapshot.xmlVersion, 2);
  assert.equal(state.workingSnapshot.xml, "<bpmn:definitions id=\"Renamed\"/>");
  assert.equal(state.dirtyState.isDirty, false);
  assert.equal(state.saveState.stage, "accepted");
  assert.equal(state.revisionState.lastAcceptedRevisionNumber, 2);
  assert.equal(state.revisionState.lastPublishedRevisionNumber, 0);
});

test("reloadSession resets working to accepted durable snapshot and keeps save/createRevision boundaries", () => {
  const owner = createSessionWorkspaceTruthOwner({
    sessionId: "sid_owner",
    durableSnapshot: snapshot({
      xml: "<bpmn:definitions id=\"Base\"/>",
      xmlVersion: 10,
      diagramStateVersion: 20,
    }),
  });
  owner.applyCopyPaste({
    reason: "copy_paste",
    patch: {
      xml: "<bpmn:definitions id=\"DraftChanged\"/>",
    },
  });
  owner.reloadSession({
    source: "durable_reload",
    durableSnapshot: snapshot({
      xml: "<bpmn:definitions id=\"ServerAccepted\"/>",
      xmlVersion: 11,
      diagramStateVersion: 21,
    }),
  });
  const state = owner.getState();
  assert.equal(state.acceptedSnapshot.xml, "<bpmn:definitions id=\"ServerAccepted\"/>");
  assert.equal(state.workingSnapshot.xml, "<bpmn:definitions id=\"ServerAccepted\"/>");
  assert.equal(state.dirtyState.isDirty, false);
  assert.equal(state.revisionState.lastPublishedRevisionNumber, 0);
});

test("projection payload cannot overwrite accepted BPMN truth", () => {
  const owner = createSessionWorkspaceTruthOwner({
    sessionId: "sid_owner",
    durableSnapshot: snapshot({
      xml: "<bpmn:definitions id=\"AcceptedTruth\"/>",
      xmlVersion: 10,
      diagramStateVersion: 10,
    }),
  });
  const result = owner.sanitizeIncomingSessionSyncPayload({
    session_id: "sid_owner",
    bpmn_xml: "<bpmn:definitions id=\"StaleProjection\"/>",
    bpmn_xml_version: 4,
    version: 4,
    _sync_source: "manual_save_session_companion_session_patch",
  }, {
    source: "manual_save_session_companion_session_patch",
  });
  assert.equal(result.stripped, true);
  assert.equal(Object.prototype.hasOwnProperty.call(result.payload, "bpmn_xml"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.payload, "bpmn_xml_version"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.payload, "version"), false);
});

test("primary sources are not stripped by projection guard", () => {
  const owner = createSessionWorkspaceTruthOwner({
    sessionId: "sid_owner",
    durableSnapshot: snapshot({
      xml: "<bpmn:definitions id=\"AcceptedTruth\"/>",
      xmlVersion: 10,
      diagramStateVersion: 10,
    }),
  });
  const result = owner.sanitizeIncomingSessionSyncPayload({
    session_id: "sid_owner",
    bpmn_xml: "<bpmn:definitions id=\"NewPrimary\"/>",
    bpmn_xml_version: 11,
    _sync_source: "manual_save",
  }, {
    source: "manual_save",
  });
  assert.equal(result.stripped, false);
  assert.equal(result.payload.bpmn_xml, "<bpmn:definitions id=\"NewPrimary\"/>");
});

test("invariant Edit -> Save -> Reload equals accepted snapshot", () => {
  const owner = createSessionWorkspaceTruthOwner({
    sessionId: "sid_owner",
    durableSnapshot: snapshot({
      xml: "<bpmn:definitions id=\"Base\"/>",
      xmlVersion: 1,
      diagramStateVersion: 1,
    }),
  });

  owner.applyDiagramEdit({
    reason: "diagram.move",
    patch: {
      xml: "<bpmn:definitions id=\"MovedOnce\"/>",
    },
  });
  owner.saveSessionStart({ source: "manual_save" });
  owner.saveSessionAccepted({
    source: "manual_save",
    primaryAck: {
      bpmn_xml: "<bpmn:definitions id=\"MovedOnce\"/>",
      bpmn_xml_version: 2,
      diagram_state_version: 2,
    },
  });

  const acceptedBeforeReload = owner.getState().acceptedSnapshot;

  owner.reloadSession({
    source: "durable_reload",
    durableSnapshot: {
      bpmn_xml: "<bpmn:definitions id=\"MovedOnce\"/>",
      bpmn_xml_version: 2,
      diagram_state_version: 2,
    },
  });

  const stateAfterReload = owner.getState();
  assert.deepEqual(
    {
      xml: stateAfterReload.workingSnapshot.xml,
      xmlVersion: stateAfterReload.workingSnapshot.xmlVersion,
      diagramStateVersion: stateAfterReload.workingSnapshot.diagramStateVersion,
    },
    {
      xml: acceptedBeforeReload.xml,
      xmlVersion: acceptedBeforeReload.xmlVersion,
      diagramStateVersion: acceptedBeforeReload.diagramStateVersion,
    },
  );
});

test("source classifiers separate primary and projection paths", () => {
  assert.equal(isPrimaryTruthSource("manual_save"), true);
  assert.equal(isPrimaryTruthSource("save_conflict_refresh"), true);
  assert.equal(isPrimaryTruthSource("manual_save_session_companion_session_patch"), false);
  assert.equal(isProjectionSource("manual_save_session_companion_session_patch"), true);
  assert.equal(isProjectionSource("diagram.autosave_patch_ack"), true);
  assert.equal(isProjectionSource("manual_save"), false);
});
