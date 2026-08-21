import test from "node:test";
import assert from "node:assert/strict";
import { buildTemplateFromSelection } from "./buildTemplateFromSelection.js";

test("buildTemplateFromSelection creates normalized payload from selected ids", () => {
  const out = buildTemplateFromSelection(["Task_1", "Task_2", "Task_1"], {
    title: "Шаблон приемки",
    scope: "org",
    primaryName: "Task 1",
    primaryElementId: "Task_1",
    sourceSessionId: "S1",
    elementTypes: ["task", "task", "gateway"],
    laneNames: ["Ops", "Ops", "QA"],
  });
  assert.equal(out.ok, true);
  assert.equal(out.error, "");
  assert.deepEqual(out.template.bpmn_element_ids, ["Task_1", "Task_2"]);
  assert.equal(out.template.selection_count, 2);
  assert.equal(out.template.scope, "org");
  assert.deepEqual(out.template.element_types, ["task", "gateway"]);
  assert.deepEqual(out.template.lane_names, ["Ops", "QA"]);
  assert.equal(out.template.primary_element_id, "Task_1");
});

test("buildTemplateFromSelection returns no_selection when ids empty", () => {
  const out = buildTemplateFromSelection([], { title: "x" });
  assert.equal(out.ok, false);
  assert.equal(out.error, "no_selection");
  assert.equal(out.template, null);
});
