import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBpmnContextMenuExecutionRequest,
  buildBpmnContextMenuViewModel,
  normalizeBpmnContextMenuActionRequest,
  resolveBpmnContextMenuActions,
  resolveBpmnContextMenuHeader,
  resolveBpmnContextMenuQuickEdit,
  resolveBpmnContextTargetKind,
} from "./bpmnContextMenuActionMatrix.js";

function actionIds(target) {
  return resolveBpmnContextMenuActions(target).map((item) => String(item.id || ""));
}

test("canvas action matrix includes V1 canvas actions", () => {
  const ids = actionIds({ kind: "canvas" });
  assert.deepEqual(ids, [
    "create_task",
    "create_gateway",
    "create_start_event",
    "create_end_event",
    "create_subprocess",
    "add_annotation",
    "undo",
    "redo",
    "paste",
  ]);
});

test("task action matrix includes add_next_step and utility actions", () => {
  const ids = actionIds({ bpmnType: "bpmn:Task" });
  assert.deepEqual(ids, [
    "open_properties",
    "add_next_step",
    "undo",
    "redo",
    "copy_element",
    "paste",
    "copy_name",
    "copy_id",
    "delete",
  ]);
});

test("subprocess action matrix keeps open_inside action with updated label", () => {
  const actions = resolveBpmnContextMenuActions({ bpmnType: "bpmn:SubProcess" });
  const openInside = actions.find((item) => item.id === "open_inside");
  assert.equal(openInside?.label, "Открыть подпроцесс");
});

test("gateway action matrix includes add_outgoing_branch", () => {
  const ids = actionIds({ bpmnType: "bpmn:ExclusiveGateway" });
  assert.equal(ids.includes("add_outgoing_branch"), true);
  assert.equal(ids.includes("add_next_step"), false);
  assert.equal(ids.includes("duplicate"), false);
});

test("sequence flow action matrix includes edit_label and delete only from V1 set", () => {
  const ids = actionIds({ bpmnType: "bpmn:SequenceFlow", isConnection: true });
  assert.deepEqual(ids, [
    "open_properties",
    "undo",
    "redo",
    "copy_id",
    "delete",
  ]);
});

test("undo/redo actions reflect runtime availability", () => {
  const actions = resolveBpmnContextMenuActions({
    kind: "canvas",
    canUndo: false,
    canRedo: true,
  });
  const undo = actions.find((item) => item.id === "undo");
  const redo = actions.find((item) => item.id === "redo");
  assert.equal(undo?.disabled, true);
  assert.equal(redo?.disabled, false);
});

test("target kind detection is stable for BPMN core types", () => {
  assert.equal(resolveBpmnContextTargetKind({ bpmnType: "bpmn:SubProcess" }), "subprocess");
  assert.equal(resolveBpmnContextTargetKind({ bpmnType: "bpmn:StartEvent" }), "start_event");
  assert.equal(resolveBpmnContextTargetKind({ bpmnType: "bpmn:EndEvent" }), "end_event");
  assert.equal(resolveBpmnContextTargetKind({ bpmnType: "bpmn:UserTask" }), "task");
  assert.equal(resolveBpmnContextTargetKind({ bpmnType: "bpmn:SequenceFlow" }), "sequence_flow");
  assert.equal(resolveBpmnContextTargetKind({ kind: "element", bpmnType: "bpmn:TextAnnotation" }), "generic_element");
});

test("generic BPMN element falls back to utility actions", () => {
  const ids = actionIds({ kind: "element", bpmnType: "bpmn:TextAnnotation", id: "TextAnnotation_1" });
  assert.deepEqual(ids, [
    "undo",
    "redo",
    "copy_element",
    "paste",
    "copy_id",
  ]);
});

test("quick edit descriptor is provided for task name and flow label", () => {
  const taskQuick = resolveBpmnContextMenuQuickEdit({ bpmnType: "bpmn:UserTask", name: "Проверка" });
  assert.deepEqual(taskQuick, {
    actionId: "quick_set_name",
    label: "Название",
    placeholder: "Введите название шага",
    value: "Проверка",
    group: "quick_properties",
  });

  const flowQuick = resolveBpmnContextMenuQuickEdit({
    bpmnType: "bpmn:SequenceFlow",
    isConnection: true,
    name: "Да",
  });
  assert.deepEqual(flowQuick, {
    actionId: "quick_set_flow_label",
    label: "Текст перехода",
    placeholder: "Введите текст перехода",
    value: "Да",
    group: "quick_properties",
  });
});

test("task menu view model is stable across task body and task label request sources", () => {
  const taskTarget = {
    kind: "element",
    id: "Task_1",
    bpmnType: "bpmn:Task",
    type: "bpmn:Task",
    name: "Проверка",
  };
  const bodyModel = buildBpmnContextMenuViewModel({
    payloadRaw: {
      sessionId: "SID_1",
      clientX: 220,
      clientY: 160,
      source: "body.contextmenu",
      target: taskTarget,
    },
    runtimeUndoRedoState: { canUndo: true, canRedo: false },
  });
  const labelModel = buildBpmnContextMenuViewModel({
    payloadRaw: {
      sessionId: "SID_1",
      clientX: 220,
      clientY: 160,
      source: "label.contextmenu",
      target: { ...taskTarget },
    },
    runtimeUndoRedoState: { canUndo: true, canRedo: false },
  });

  assert.deepEqual(labelModel, bodyModel);
  assert.equal(bodyModel?.kind, "task");
  assert.equal(bodyModel?.quickEdit?.actionId, "quick_set_name");
});

test("execution request keeps downstream open_properties boundary stable", () => {
  const menu = buildBpmnContextMenuViewModel({
    payloadRaw: {
      sessionId: "SID_1",
      clientX: 320,
      clientY: 140,
      target: {
        kind: "element",
        id: "Task_1",
        bpmnType: "bpmn:Task",
        type: "bpmn:Task",
        name: "Проверка",
      },
    },
  });
  const execution = buildBpmnContextMenuExecutionRequest({
    menuRaw: menu,
    actionRequestRaw: { actionId: "open_properties" },
  });

  assert.deepEqual(execution, {
    actionRequest: {
      actionId: "open_properties",
      closeOnSuccess: true,
      value: "",
    },
    payload: {
      actionId: "open_properties",
      target: menu.target,
      clientX: 320,
      clientY: 140,
      value: "",
    },
  });
});

test("action request normalization keeps quick edit close semantics explicit", () => {
  assert.deepEqual(
    normalizeBpmnContextMenuActionRequest({
      actionId: "quick_set_name",
      value: "Новое имя",
      closeOnSuccess: false,
    }),
    {
      actionId: "quick_set_name",
      closeOnSuccess: false,
      value: "Новое имя",
    },
  );
});

test("headers are localized in russian", () => {
  assert.equal(resolveBpmnContextMenuHeader({ kind: "canvas" }), "Холст");
  assert.equal(resolveBpmnContextMenuHeader({ bpmnType: "bpmn:SequenceFlow", name: "" }), "Переход");
  assert.equal(resolveBpmnContextMenuHeader({ bpmnType: "bpmn:Task", name: "" }), "Элемент BPMN");
});
