import assert from "node:assert/strict";
import test from "node:test";

import { SEARCH_RESULTS_CAP, groupSearchRows } from "./diagramSearchGroups.js";

test("groupSearchRows: groups rows by searchGroupKey and labels", () => {
  const rows = [
    { elementId: "T1", searchGroupKey: "main", searchGroupLabel: "Основной процесс" },
    { elementId: "T2", searchGroupKey: "main" },
    { elementId: "T3", searchGroupKey: "sub_1", searchGroupLabel: "Подпроцесс А" },
  ];
  const groups = groupSearchRows(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, "main");
  assert.equal(groups[0].label, "Основной процесс");
  assert.equal(groups[0].rows.length, 2);
  assert.equal(groups[1].key, "sub_1");
  assert.equal(groups[1].rows.length, 1);
});

test("groupSearchRows: preserves original row order and index", () => {
  const rows = [{ elementId: "A" }, { elementId: "B" }];
  const groups = groupSearchRows(rows);
  assert.deepEqual(groups[0].rows.map(({ row }) => row.elementId), ["A", "B"]);
  assert.deepEqual(groups[0].rows.map(({ index }) => index), [0, 1]);
});

test("groupSearchRows: tolerates garbage rows and falls back to main group", () => {
  assert.doesNotThrow(() => groupSearchRows([null, "x", { elementId: "A" }, { elementId: "B", searchGroupKey: "" }]));
  const groups = groupSearchRows([null, "x", { elementId: "A" }, { elementId: "B", searchGroupKey: "" }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "main");
  assert.ok(groups[0].rows.length >= 2, "garbage rows are grouped without crashing");
});

test("SEARCH_RESULTS_CAP is 240", () => {
  assert.equal(SEARCH_RESULTS_CAP, 240);
});
