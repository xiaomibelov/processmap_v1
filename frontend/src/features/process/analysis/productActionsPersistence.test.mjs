import test from "node:test";
import assert from "node:assert/strict";

import {
  deleteProductActionForStep,
  saveProductActionForStep,
} from "./productActionsPersistence.js";

const step = {
  id: "step_1",
  node_id: "Activity_1",
  action: "Нарезать куриную грудку",
  role: "Повар",
};

test("saveProductActionForStep calls interview analysis helper with product_actions patch", async () => {
  const calls = [];
  const response = await saveProductActionForStep({
    sessionId: "sid_1",
    currentAnalysis: {
      custom_marker: "preserve-on-backend",
      product_actions: [{ id: "pa_keep", step_id: "step_keep", product_name: "Рис" }],
    },
    step,
    draft: {
      id: "pa_1",
      product_name: "Куриная грудка",
      product_group: "Птица",
      action_type: "нарезка",
      action_stage: "подготовка",
      action_object: "куриная грудка",
      action_object_category: "ингредиент",
      action_method: "нарезать ножом",
    },
    nowIso: "2026-05-05T12:00:00.000Z",
    getBaseDiagramStateVersion: () => 7,
    rememberDiagramStateVersion: () => null,
    onSessionSync: () => null,
    patchInterviewAnalysis: async (sid, patch, options) => {
      calls.push({ sid, patch, options });
      return { ok: true, status: 200, analysis: { product_actions: patch.product_actions } };
    },
  });

  assert.equal(response.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sid, "sid_1");
  assert.deepEqual(Object.keys(calls[0].patch), ["product_actions"]);
  assert.equal(calls[0].patch.product_actions.length, 2);
  assert.equal(calls[0].patch.product_actions[0].id, "pa_keep");
  assert.equal(calls[0].patch.product_actions[1].id, "pa_1");
  assert.equal(calls[0].patch.product_actions[1].bpmn_element_id, "Activity_1");
  assert.equal(typeof calls[0].options.getBaseDiagramStateVersion, "function");
  assert.equal(typeof calls[0].options.rememberDiagramStateVersion, "function");
  assert.equal(typeof calls[0].options.onSessionSync, "function");
});

test("saveProductActionForStep surfaces conflict without converting it to success", async () => {
  const response = await saveProductActionForStep({
    sessionId: "sid_conflict",
    currentAnalysis: { product_actions: [] },
    step,
    draft: { id: "pa_1", product_name: "Куриная грудка" },
    patchInterviewAnalysis: async () => ({
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
    }),
  });

  assert.equal(response.ok, false);
  assert.equal(response.status, 409);
  assert.equal(response.error, "DIAGRAM_STATE_CONFLICT");
});

test("deleteProductActionForStep patches remaining product actions", async () => {
  const calls = [];
  const response = await deleteProductActionForStep({
    sessionId: "sid_1",
    currentAnalysis: {
      product_actions: [
        { id: "pa_delete", step_id: "step_1" },
        { id: "pa_keep", step_id: "step_2" },
      ],
    },
    actionId: "pa_delete",
    patchInterviewAnalysis: async (sid, patch) => {
      calls.push({ sid, patch });
      return { ok: true, status: 200 };
    },
  });

  assert.equal(response.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].patch.product_actions.map((row) => row.id), ["pa_keep"]);
});
