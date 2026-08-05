// T3#3 — чип «＋ в справочник»: хелперы категории/валидации ref (modelUtils).
// Запуск: node --test src/features/technologist/constructor/refAddChip.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REF_CATEGORY_BY_PARAM,
  categoryForRefParam,
  upsertEntity,
  validateEntityRef,
} from "./modelUtils.js";

const MODEL = {
  nodes: [],
  flows: [],
  lanes: [],
  process_entities: {
    containers: { "бак-1": { type_id: "tank", source: "manual" } },
    equipment: {},
    zones: {},
  },
};

test("категория по имени ref-параметра", () => {
  assert.equal(categoryForRefParam("container_ref"), "containers");
  assert.equal(categoryForRefParam("equipment_ref"), "equipment");
  assert.equal(categoryForRefParam("zone_ref"), "zones");
  assert.equal(categoryForRefParam("duration"), "");
  assert.equal(categoryForRefParam(""), "");
  assert.deepEqual(Object.keys(REF_CATEGORY_BY_PARAM).sort(),
    ["container_ref", "equipment_ref", "zone_ref"]);
});

test("validateEntityRef: empty / exists / ok", () => {
  assert.equal(validateEntityRef(MODEL, "  "), "empty");
  assert.equal(validateEntityRef(MODEL, "бак-1"), "exists");
  assert.equal(validateEntityRef(MODEL, "бак-2"), "");
});

test("добавленная через чип сущность проходит upsertEntity и становится объявленной", () => {
  const ref = "бак-2";
  assert.equal(validateEntityRef(MODEL, ref), "");
  const next = upsertEntity(MODEL, categoryForRefParam("container_ref"), ref, { type_id: "tank", source: "manual" });
  assert.equal(validateEntityRef(next, ref), "exists");
  assert.equal(next.process_entities.containers[ref].type_id, "tank");
  // исходная модель не мутирована
  assert.equal(validateEntityRef(MODEL, ref), "");
});
