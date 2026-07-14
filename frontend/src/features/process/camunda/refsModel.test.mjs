import assert from "node:assert/strict";
import test from "node:test";

import {
  collectProcessRefs,
  isRefPropertyName,
  mergeRefOptions,
} from "./refsModel.js";

test("isRefPropertyName: suffix match, trim and case-insensitive", () => {
  assert.equal(isRefPropertyName("object_ref"), true);
  assert.equal(isRefPropertyName("target_ref"), true);
  assert.equal(isRefPropertyName("source_container_ref"), true);
  assert.equal(isRefPropertyName("  Equipment_Ref  "), true);
  assert.equal(isRefPropertyName("_ref"), true);
});

test("isRefPropertyName: no match for non-ref names and garbage", () => {
  assert.equal(isRefPropertyName("object"), false);
  assert.equal(isRefPropertyName("ref_object"), false);
  assert.equal(isRefPropertyName("reference"), false);
  assert.equal(isRefPropertyName("plain_key"), false);
  assert.equal(isRefPropertyName(""), false);
  assert.equal(isRefPropertyName(null), false);
  assert.equal(isRefPropertyName(undefined), false);
  assert.equal(isRefPropertyName(42), false);
});

test("collectProcessRefs: collects *_ref values across elements (normalized shape)", () => {
  const map = {
    Task_A: {
      properties: {
        extensionProperties: [
          { id: "p1", name: "object_ref", value: "container_1" },
          { id: "p2", name: "target_ref", value: "microwave_1" },
          { id: "p3", name: "ee_time", value: "0.33" },
        ],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
    Task_B: {
      properties: {
        extensionProperties: [
          { id: "p4", name: "object_ref", value: "container_2" },
          { id: "p5", name: "object_ref", value: "container_1" },
          { id: "p6", name: "station_ref", value: "" },
        ],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  };
  assert.deepEqual(collectProcessRefs(map), ["container_1", "container_2", "microwave_1"]);
});

test("collectProcessRefs: defensive against raw shapes and garbage", () => {
  assert.deepEqual(collectProcessRefs(null), []);
  assert.deepEqual(collectProcessRefs(undefined), []);
  assert.deepEqual(collectProcessRefs("garbage"), []);
  assert.deepEqual(collectProcessRefs([]), []);
  const rawish = {
    Task_X: { extensionProperties: [{ name: "zone_ref", value: "zone_7" }] },
    Task_Y: [{ name: "equipment_ref", value: "eq_1" }],
    Task_Z: { properties: { extensionProperties: "nope" } },
    Task_W: 42,
    Task_V: null,
  };
  assert.deepEqual(collectProcessRefs(rawish), ["eq_1", "zone_7"]);
});

test("mergeRefOptions: dedupe case-insensitive, sorted, strings only", () => {
  const merged = mergeRefOptions(
    ["container_1", "microwave_1"],
    ["Container_1", "pallet_2"],
    null,
    undefined,
    "not-a-list",
    [{ optionValue: "tank_9" }, { value: "pallet_2" }, 5, null, ""],
  );
  // First occurrence wins on case-insensitive dupes ("container_1" before "Container_1").
  assert.deepEqual(merged, ["container_1", "microwave_1", "pallet_2", "tank_9"]);
});

test("mergeRefOptions: empty inputs → empty list", () => {
  assert.deepEqual(mergeRefOptions(), []);
  assert.deepEqual(mergeRefOptions([], null, {}), []);
});
