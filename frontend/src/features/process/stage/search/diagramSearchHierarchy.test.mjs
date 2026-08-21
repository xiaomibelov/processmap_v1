import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiagramSearchProcessContext,
  deriveElementProcessContext,
  MAIN_PROCESS_GROUP_LABEL,
} from "./diagramSearchHierarchy.js";

function subprocess(id, name, parent = null) {
  return {
    id,
    name,
    $type: "bpmn:SubProcess",
    ...(parent ? { $parent: parent } : {}),
  };
}

test("deriveElementProcessContext returns main process for top-level element", () => {
  const out = deriveElementProcessContext({
    businessObject: {
      id: "Task_Main",
      $type: "bpmn:Task",
      $parent: { id: "Process_1", $type: "bpmn:Process" },
    },
  });
  assert.equal(out.searchGroupKey, "main");
  assert.equal(out.searchGroupLabel, MAIN_PROCESS_GROUP_LABEL);
  assert.equal(out.isInsideSubprocess, false);
});

test("deriveElementProcessContext groups element inside subprocess by subprocess name", () => {
  const parent = subprocess("Sub_1", "Проверить заказ");
  const out = deriveElementProcessContext({
    businessObject: {
      id: "Task_Inside",
      $type: "bpmn:Task",
      $parent: parent,
    },
  });
  assert.equal(out.parentSubprocessId, "Sub_1");
  assert.equal(out.parentSubprocessName, "Проверить заказ");
  assert.equal(out.searchGroupKey, "subprocess:Sub_1");
  assert.equal(out.searchGroupLabel, "Subprocess: Проверить заказ");
  assert.equal(out.subprocessPathLabel, "Проверить заказ");
  assert.equal(out.subprocessDepth, 1);
});

test("deriveElementProcessContext builds nested subprocess breadcrumb", () => {
  const root = subprocess("Sub_A", "Проверить заказ");
  const nested = subprocess("Sub_B", "Передать в столовую", root);
  const out = deriveElementProcessContext({
    businessObject: {
      id: "Task_Nested",
      $type: "bpmn:Task",
      $parent: nested,
    },
  });
  assert.equal(out.parentSubprocessId, "Sub_B");
  assert.equal(out.searchGroupKey, "subprocess:Sub_A/Sub_B");
  assert.equal(out.searchGroupLabel, "Subprocess: Проверить заказ / Передать в столовую");
  assert.equal(out.subprocessPathLabel, "Проверить заказ → Передать в столовую");
  assert.equal(out.subprocessDepth, 2);
});

test("buildDiagramSearchProcessContext falls back to subprocess id when name is missing", () => {
  const out = buildDiagramSearchProcessContext([{ id: "Sub_NoName", name: "" }]);
  assert.equal(out.searchGroupLabel, "Subprocess: Sub_NoName");
  assert.equal(out.parentSubprocessName, "Sub_NoName");
});
