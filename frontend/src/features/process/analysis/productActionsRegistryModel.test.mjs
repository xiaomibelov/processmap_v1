import test from "node:test";
import assert from "node:assert/strict";

import {
  PRODUCT_ACTIONS_REGISTRY_SESSION_CAP,
  buildProductActionRegistryRows,
  enforceProductActionRegistrySessionCap,
  filterProductActionRegistryRows,
  productActionRegistryCompleteness,
  summarizeProductActionRegistryRows,
  uniqueProductActionRegistryFilterOptions,
} from "./productActionsRegistryModel.js";

const productActions = [
  {
    id: "pa_1",
    product_name: "Курица",
    product_group: "Птица",
    action_type: "нарезка",
    action_stage: "подготовка",
    action_object: "куриная грудка",
    action_object_category: "ингредиент",
    action_method: "нарезать ножом",
    role: "Повар",
    step_id: "step_1",
    step_label: "Нарезать курицу",
    bpmn_element_id: "Activity_1",
  },
  {
    id: "pa_2",
    product_group: "Гарнир",
    action_type: "перекладывание",
    step_label: "Выложить рис",
  },
];

test("buildProductActionRegistryRows adds session/project context and completeness", () => {
  const rows = buildProductActionRegistryRows({
    productActions,
    session: { id: "sid_1", title: "Процесс кухни" },
    project: { id: "pid_1", title: "Тестовый проект" },
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].project_id, "pid_1");
  assert.equal(rows[0].project_title, "Тестовый проект");
  assert.equal(rows[0].session_id, "sid_1");
  assert.equal(rows[0].session_title, "Процесс кухни");
  assert.equal(rows[0].completeness, "complete");
  assert.equal(rows[1].completeness, "incomplete");
  assert.deepEqual(rows[1].missing_fields, ["product_name", "action_object"]);
});

test("productActionRegistryCompleteness checks required business fields", () => {
  assert.deepEqual(productActionRegistryCompleteness(productActions[0]), {
    status: "complete",
    missing: [],
  });
  assert.equal(productActionRegistryCompleteness({ product_name: "Суп" }).status, "incomplete");
});

test("filterProductActionRegistryRows filters loaded rows only", () => {
  const rows = buildProductActionRegistryRows({ productActions, session: { id: "sid_1" } });
  assert.deepEqual(filterProductActionRegistryRows(rows, { product_group: "Птица" }).map((row) => row.raw_action_id), ["pa_1"]);
  assert.deepEqual(filterProductActionRegistryRows(rows, { completeness: "incomplete" }).map((row) => row.raw_action_id), ["pa_2"]);
});

test("uniqueProductActionRegistryFilterOptions derives dropdown values", () => {
  const rows = buildProductActionRegistryRows({ productActions, session: { id: "sid_1" } });
  const options = uniqueProductActionRegistryFilterOptions(rows);
  assert.deepEqual(options.product_group, ["Гарнир", "Птица"]);
  assert.deepEqual(options.action_type, ["нарезка", "перекладывание"]);
});

test("summarizeProductActionRegistryRows counts rows and sessions", () => {
  const rows = [
    ...buildProductActionRegistryRows({ productActions: [productActions[0]], session: { id: "sid_1" } }),
    ...buildProductActionRegistryRows({ productActions: [productActions[1]], session: { id: "sid_2" } }),
  ];
  assert.deepEqual(summarizeProductActionRegistryRows(rows), {
    sessions: 2,
    rows: 2,
    complete: 1,
    incomplete: 1,
  });
});

test("enforceProductActionRegistrySessionCap blocks too many selected sessions", () => {
  const under = enforceProductActionRegistrySessionCap(["s1", "s2"]);
  assert.equal(under.ok, true);
  const over = enforceProductActionRegistrySessionCap(
    Array.from({ length: PRODUCT_ACTIONS_REGISTRY_SESSION_CAP + 1 }, (_, idx) => `s${idx}`),
  );
  assert.equal(over.ok, false);
  assert.equal(over.cap, PRODUCT_ACTIONS_REGISTRY_SESSION_CAP);
});
