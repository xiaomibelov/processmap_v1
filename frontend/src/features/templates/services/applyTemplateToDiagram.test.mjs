import test from "node:test";
import assert from "node:assert/strict";
import { applyTemplateToDiagram } from "./applyTemplateToDiagram.js";

test("applyTemplateToDiagram selects ids and reports missing ids", async () => {
  const calls = {
    select: [],
    flash: [],
  };
  const bpmnApi = {
    selectElements(ids, options) {
      calls.select.push({ ids, options });
      return {
        ok: true,
        count: 2,
        ids: ["Task_1", "Task_2"],
        missingIds: ["Task_3"],
      };
    },
    flashNode(id, tone, options) {
      calls.flash.push({ id, tone, options });
    },
  };
  const out = await applyTemplateToDiagram(bpmnApi, ["Task_1", "Task_2", "Task_3"], { label: "Template" });
  assert.equal(out.ok, true);
  assert.deepEqual(out.applied, ["Task_1", "Task_2"]);
  assert.deepEqual(out.missing, ["Task_3"]);
  assert.equal(out.warning, "template_partial_apply:2/3");
  assert.equal(calls.select.length, 1);
  assert.deepEqual(calls.select[0].ids, ["Task_1", "Task_2", "Task_3"]);
  assert.equal(calls.flash.length, 2);
  assert.deepEqual(calls.flash.map((row) => row.id), ["Task_1", "Task_2"]);
});

test("applyTemplateToDiagram returns error when API missing", async () => {
  const out = await applyTemplateToDiagram(null, ["Task_1"]);
  assert.equal(out.ok, false);
  assert.equal(out.error, "select_api_unavailable");
  assert.deepEqual(out.applied, []);
  assert.deepEqual(out.missing, ["Task_1"]);
});
