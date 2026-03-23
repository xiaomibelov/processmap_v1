import test from "node:test";
import assert from "node:assert/strict";

import {
  runImmediateEditorFanout,
  runSettledDecorSidebarFanout,
} from "./postStagingFanout.js";

test("runImmediateEditorFanout applies editor-local decor and realtime emit", () => {
  const calls = [];
  const inst = { id: "modeler" };

  runImmediateEditorFanout({
    inst,
    applyTaskTypeDecor: (...args) => calls.push(["task", ...args]),
    applyLinkEventDecor: (...args) => calls.push(["link", ...args]),
    applyHappyFlowDecor: (...args) => calls.push(["happy", ...args]),
    applyRobotMetaDecor: (...args) => calls.push(["robot", ...args]),
    emitRealtimeOpsFromModeler: (...args) => calls.push(["realtime", ...args]),
  });

  assert.deepEqual(calls, [
    ["task", inst, "editor"],
    ["link", inst, "editor"],
    ["happy", inst, "editor"],
    ["robot", inst, "editor"],
    ["realtime", inst, "command_stack"],
  ]);
});

test("runImmediateEditorFanout skips realtime emit when rollback mode disables it", () => {
  const calls = [];
  const inst = { id: "modeler" };

  runImmediateEditorFanout({
    inst,
    realtimeOpsEnabled: false,
    applyTaskTypeDecor: (...args) => calls.push(["task", ...args]),
    applyLinkEventDecor: (...args) => calls.push(["link", ...args]),
    applyHappyFlowDecor: (...args) => calls.push(["happy", ...args]),
    applyRobotMetaDecor: (...args) => calls.push(["robot", ...args]),
    emitRealtimeOpsFromModeler: (...args) => calls.push(["realtime", ...args]),
  });

  assert.deepEqual(calls, [
    ["task", inst, "editor"],
    ["link", inst, "editor"],
    ["happy", inst, "editor"],
    ["robot", inst, "editor"],
  ]);
});

test("runSettledDecorSidebarFanout separates active and inactive surfaces and syncs selected sidebar target", () => {
  const calls = [];
  const selectedElement = { id: "Task_1" };
  const viewerInst = {
    get(name) {
      if (name !== "elementRegistry") throw new Error("unexpected_service");
      return { get: () => selectedElement };
    },
  };
  const modelerInst = {
    get(name) {
      if (name !== "elementRegistry") throw new Error("unexpected_service");
      return { get: () => selectedElement };
    },
  };

  runSettledDecorSidebarFanout({
    viewerInst,
    modelerInst,
    view: "viewer",
    isInterviewDecorModeOn: () => false,
    clearUserNotesDecor: (...args) => calls.push(["clearNotes", ...args]),
    applyUserNotesDecor: (...args) => calls.push(["notes", ...args]),
    applyStepTimeDecor: (...args) => calls.push(["step", ...args]),
    applyRobotMetaDecor: (...args) => calls.push(["robot", ...args]),
    applyPropertiesOverlayDecor: (...args) => calls.push(["props", ...args]),
    clearPropertiesOverlayDecor: (...args) => calls.push(["clearProps", ...args]),
    selectedMarkerStateRef: { current: { viewer: "Task_1" } },
    emitElementSelection: (...args) => calls.push(["emitSelection", ...args]),
    syncAiQuestionPanelWithSelection: (...args) => calls.push(["syncAi", ...args]),
  });

  assert.deepEqual(calls, [
    ["notes", viewerInst, "viewer"],
    ["notes", modelerInst, "editor"],
    ["step", viewerInst, "viewer"],
    ["step", modelerInst, "editor"],
    ["robot", viewerInst, "viewer"],
    ["robot", modelerInst, "editor"],
    ["props", viewerInst, "viewer"],
    ["clearProps", modelerInst, "editor"],
    ["emitSelection", selectedElement, "viewer.notes_refresh"],
    ["syncAi", viewerInst, "viewer", selectedElement, "viewer.notes_refresh"],
  ]);
});

test("runSettledDecorSidebarFanout skips repeated settled selection sync when signature is unchanged", () => {
  const calls = [];
  const selectedElement = { id: "Task_1", businessObject: { name: "Task 1", $type: "bpmn:Task" } };
  const viewerInst = {
    get(name) {
      if (name !== "elementRegistry") throw new Error("unexpected_service");
      return { get: () => selectedElement };
    },
  };
  const selectionFanoutStateRef = { current: {} };
  const options = {
    viewerInst,
    modelerInst: null,
    view: "viewer",
    isInterviewDecorModeOn: () => false,
    clearUserNotesDecor: (...args) => calls.push(["clearNotes", ...args]),
    applyUserNotesDecor: (...args) => calls.push(["notes", ...args]),
    applyStepTimeDecor: (...args) => calls.push(["step", ...args]),
    applyRobotMetaDecor: (...args) => calls.push(["robot", ...args]),
    applyPropertiesOverlayDecor: (...args) => calls.push(["props", ...args]),
    clearPropertiesOverlayDecor: (...args) => calls.push(["clearProps", ...args]),
    selectedMarkerStateRef: { current: { viewer: "Task_1" } },
    selectionFanoutStateRef,
    buildSelectionFanoutSignature: ({ element, kind }) => `${kind}:${String(element?.id || "")}:sig1`,
    emitElementSelection: (...args) => calls.push(["emitSelection", ...args]),
    syncAiQuestionPanelWithSelection: (...args) => calls.push(["syncAi", ...args]),
  };

  runSettledDecorSidebarFanout(options);
  assert.equal(calls.filter(([name]) => name === "emitSelection").length, 1);
  assert.equal(calls.filter(([name]) => name === "syncAi").length, 1);

  calls.length = 0;
  runSettledDecorSidebarFanout(options);
  assert.equal(calls.filter(([name]) => name === "emitSelection").length, 0);
  assert.equal(calls.filter(([name]) => name === "syncAi").length, 0);
});

function makeImmediateFanoutSpies() {
  const calls = {
    task: 0,
    link: 0,
    happy: 0,
    robot: 0,
    realtime: 0,
  };
  return {
    calls,
    options: {
      applyTaskTypeDecor: () => { calls.task += 1; },
      applyLinkEventDecor: () => { calls.link += 1; },
      applyHappyFlowDecor: () => { calls.happy += 1; },
      applyRobotMetaDecor: () => { calls.robot += 1; },
      emitRealtimeOpsFromModeler: () => { calls.realtime += 1; },
      realtimeOpsEnabled: true,
    },
  };
}

test("runImmediateEditorFanout skips semantic decor subpath when semantic signature is unchanged", () => {
  const inst = {};
  const { calls, options } = makeImmediateFanoutSpies();

  runImmediateEditorFanout({
    inst,
    ...options,
    semanticDecorSignature: "meta_sig_v1",
  });
  runImmediateEditorFanout({
    inst,
    ...options,
    semanticDecorSignature: "meta_sig_v1",
  });

  assert.equal(calls.task, 2);
  assert.equal(calls.link, 2);
  assert.equal(calls.happy, 1);
  assert.equal(calls.robot, 1);
  assert.equal(calls.realtime, 2);
});

test("runImmediateEditorFanout reapplies semantic decor when semantic signature changes", () => {
  const inst = {};
  const { calls, options } = makeImmediateFanoutSpies();

  runImmediateEditorFanout({
    inst,
    ...options,
    semanticDecorSignature: "meta_sig_v1",
  });
  runImmediateEditorFanout({
    inst,
    ...options,
    semanticDecorSignature: "meta_sig_v2",
  });

  assert.equal(calls.happy, 2);
  assert.equal(calls.robot, 2);
});

test("runImmediateEditorFanout keeps legacy behavior when semantic signature is not provided", () => {
  const inst = {};
  const { calls, options } = makeImmediateFanoutSpies();

  runImmediateEditorFanout({
    inst,
    ...options,
  });
  runImmediateEditorFanout({
    inst,
    ...options,
  });

  assert.equal(calls.happy, 2);
  assert.equal(calls.robot, 2);
});
