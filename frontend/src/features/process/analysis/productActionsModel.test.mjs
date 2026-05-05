import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_OBJECT_CATEGORIES,
  ACTION_STAGES,
  ACTION_TYPES,
  buildProductActionForStep,
  deleteProductAction,
  deriveProductActionBindingFromStep,
  listProductActionsForStep,
  normalizeProductActionRow,
  normalizeProductActionsList,
  upsertProductAction,
} from "./productActionsModel.js";

const step = {
  id: "step_1",
  node_id: "Activity_1",
  action: "Нарезать куриную грудку",
  role: "Повар",
  work_duration_sec: 120,
  wait_min: 2,
};

test("MVP dictionaries expose required product action options", () => {
  assert.equal(ACTION_TYPES.includes("нарезка"), true);
  assert.equal(ACTION_STAGES.includes("подготовка"), true);
  assert.equal(ACTION_OBJECT_CATEGORIES.includes("ингредиент"), true);
});

test("deriveProductActionBindingFromStep links action to step and BPMN element", () => {
  assert.deepEqual(deriveProductActionBindingFromStep(step, { sessionId: "sid_1" }), {
    session_id: "sid_1",
    step_id: "step_1",
    node_id: "Activity_1",
    bpmn_element_id: "Activity_1",
    step_label: "Нарезать куриную грудку",
    role: "Повар",
    work_duration_sec: 120,
    wait_duration_sec: 120,
  });
});

test("buildProductActionForStep creates normalized manual row with product fields", () => {
  const row = buildProductActionForStep(step, {
    product_name: "Куриная грудка",
    product_group: "Птица",
    action_type: "нарезка",
    action_stage: "подготовка",
    action_object: "куриная грудка",
    action_object_category: "ингредиент",
    action_method: "нарезать ножом",
  }, {
    idFactory: () => "pa_1",
    nowIso: "2026-05-05T12:00:00.000Z",
    sessionId: "sid_1",
  });

  assert.equal(row.id, "pa_1");
  assert.equal(row.session_id, "sid_1");
  assert.equal(row.bpmn_element_id, "Activity_1");
  assert.equal(row.step_id, "step_1");
  assert.equal(row.product_name, "Куриная грудка");
  assert.equal(row.source, "manual");
  assert.equal(row.confidence, 1);
  assert.equal(row.manual_corrected, true);
  assert.equal(row.updated_at, "2026-05-05T12:00:00.000Z");
});

test("upsertProductAction updates one row and preserves other product actions", () => {
  const existing = [
    { id: "pa_1", step_id: "step_1", product_name: "Старое" },
    { id: "pa_2", step_id: "step_2", product_name: "Суп" },
  ];
  const next = upsertProductAction(existing, {
    id: "pa_1",
    step_id: "step_1",
    product_name: "Куриная грудка",
    custom_marker: "kept",
  });

  assert.equal(next.length, 2);
  assert.equal(next[0].product_name, "Куриная грудка");
  assert.equal(next[0].custom_marker, "kept");
  assert.equal(next[1].id, "pa_2");
  assert.equal(next[1].product_name, "Суп");
});

test("deleteProductAction removes only selected row", () => {
  const next = deleteProductAction([
    { id: "pa_1", step_id: "step_1" },
    { id: "pa_2", step_id: "step_2" },
  ], "pa_1");

  assert.deepEqual(next.map((row) => row.id), ["pa_2"]);
});

test("missing BPMN element id is allowed when step id exists", () => {
  const row = buildProductActionForStep({ id: "step_local", action: "Смешать" }, {}, {
    idFactory: () => "pa_local",
    nowIso: "2026-05-05T12:00:00.000Z",
  });

  assert.equal(row.id, "pa_local");
  assert.equal(row.step_id, "step_local");
  assert.equal(row.bpmn_element_id, "");
  assert.equal(row.step_label, "Смешать");
});

test("normalizeProductActionsList strips unsafe keys and duplicate ids", () => {
  const unsafe = { id: "pa_1", product_name: "Курица" };
  Object.defineProperty(unsafe, "__proto__", {
    value: { polluted: true },
    enumerable: true,
  });
  const list = normalizeProductActionsList([
    unsafe,
    { id: "pa_1", product_name: "Дубликат" },
    { id: "pa_2", product_name: "Рис" },
  ]);

  assert.equal(list.length, 2);
  assert.equal(Object.hasOwn(list[0], "__proto__"), false);
  assert.equal({}.polluted, undefined);
});

test("listProductActionsForStep matches by step id or BPMN node id", () => {
  const list = listProductActionsForStep([
    { id: "pa_1", step_id: "other", bpmn_element_id: "Activity_1" },
    { id: "pa_2", step_id: "step_2", bpmn_element_id: "Activity_2" },
  ], step);

  assert.deepEqual(list.map((row) => row.id), ["pa_1"]);
});

test("normalizeProductActionRow preserves unknown safe fields", () => {
  const row = normalizeProductActionRow({
    id: "pa_1",
    product_name: "Курица",
    evidence_text: "из комментария",
  });

  assert.equal(row.evidence_text, "из комментария");
});
