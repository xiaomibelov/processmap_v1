import assert from "node:assert/strict";
import test from "node:test";

import { combineV2PropertyPreviewMap } from "./v2PropertyPreviewMap.js";

const ALWAYS_ENTRY = {
  enabled: true,
  elementId: "T1",
  items: [{ key: "ee_time", label: "ee_time", value: "7" }],
};

test("combine: disabled/empty selected preview does NOT clobber an always-map entry (regression: ee_time desync)", () => {
  const combined = combineV2PropertyPreviewMap(
    { T1: ALWAYS_ENTRY },
    { enabled: false, elementId: "T1", items: [] },
  );
  assert.equal(combined.T1, ALWAYS_ENTRY);
  assert.equal(combined.T1.enabled, true);
  assert.equal(combined.T1.items[0].value, "7");
});

test("combine: enabled selected preview with items overrides the always-map entry", () => {
  const selected = {
    enabled: true,
    elementId: "T1",
    items: [{ key: "ee_time", label: "ee_time", value: "9" }],
  };
  const combined = combineV2PropertyPreviewMap({ T1: ALWAYS_ENTRY }, selected);
  assert.equal(combined.T1, selected);
});

test("combine: disabled/empty selected preview is kept when the always map has no entry (intentionally property-less)", () => {
  const selected = { enabled: false, elementId: "T1", items: [] };
  const combined = combineV2PropertyPreviewMap({}, selected);
  assert.equal(combined.T1, selected);
});

test("combine: null/empty selected preview leaves the always map unchanged", () => {
  assert.deepEqual(combineV2PropertyPreviewMap({ T1: ALWAYS_ENTRY }, null), { T1: ALWAYS_ENTRY });
  assert.deepEqual(combineV2PropertyPreviewMap({ T1: ALWAYS_ENTRY }, {}), { T1: ALWAYS_ENTRY });
  assert.deepEqual(combineV2PropertyPreviewMap({ T1: ALWAYS_ENTRY }, { elementId: "" }), { T1: ALWAYS_ENTRY });
});

test("combine: always map is not mutated", () => {
  const always = { T1: ALWAYS_ENTRY };
  combineV2PropertyPreviewMap(always, { enabled: true, elementId: "T2", items: [{ key: "a", label: "a", value: "b" }] });
  assert.deepEqual(Object.keys(always), ["T1"]);
});
