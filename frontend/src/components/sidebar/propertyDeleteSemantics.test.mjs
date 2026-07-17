import assert from "node:assert/strict";
import test, { describe } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deleteExtensionPropertyRowsByDeleteAction,
  bulkDeleteExtensionPropertyRows,
} from "./propertyDeleteSemantics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Existing tests (deleteExtensionPropertyRowsByDeleteAction) ---

test("delete by id removes a single named row", () => {
  const rows = [
    { id: "p1", name: "ingredient", value: "salt" },
    { id: "p2", name: "equipment", value: "pot" },
  ];
  const out = deleteExtensionPropertyRowsByDeleteAction(rows, "p1");
  assert.deepEqual(out.map((r) => r.name), ["equipment"]);
});

test("delete by id removes only the targeted row even when names duplicate", () => {
  const rows = [
    { id: "p1", name: "ingredient", value: "salt" },
    { id: "p2", name: "ingredient", value: "pepper" },
    { id: "p3", name: "equipment", value: "pot" },
  ];
  const out = deleteExtensionPropertyRowsByDeleteAction(rows, "p1");
  assert.deepEqual(out.map((r) => r.name), ["ingredient", "equipment"]);
});

test("delete by generated prop_raw index removes the row at that index", () => {
  const rows = [
    { name: "ingredient", value: "salt" },
    { name: "equipment", value: "pot" },
  ];
  const out = deleteExtensionPropertyRowsByDeleteAction(rows, "prop_raw_1");
  assert.deepEqual(out.map((r) => r.name), ["equipment"]);
});

test("delete leaves unnamed rows intact except the target", () => {
  const rows = [
    { id: "p1", name: "", value: "x" },
    { id: "p2", name: "", value: "y" },
    { id: "p3", name: "equipment", value: "pot" },
  ];
  const out = deleteExtensionPropertyRowsByDeleteAction(rows, "p1");
  assert.deepEqual(out.map((r) => r.id), ["p2", "p3"]);
});

test("delete with unknown id returns rows unchanged", () => {
  const rows = [{ id: "p1", name: "ingredient", value: "salt" }];
  const out = deleteExtensionPropertyRowsByDeleteAction(rows, "unknown");
  assert.equal(out.length, 1);
});

// --- Bulk delete tests ---

describe("bulkDeleteExtensionPropertyRows", () => {
  test("removes multiple rows by ID", () => {
    const rows = [
      { id: "a", name: "n1", value: "v1" },
      { id: "b", name: "n2", value: "v2" },
      { id: "c", name: "n3", value: "v3" },
      { id: "d", name: "n4", value: "v4" },
    ];
    const result = bulkDeleteExtensionPropertyRows(rows, ["a", "c"]);
    assert.equal(result.length, 2);
    assert.deepStrictEqual(result.map((r) => r.id), ["b", "d"]);
  });

  test("returns full array when no IDs match", () => {
    const rows = [
      { id: "a", name: "n1", value: "v1" },
      { id: "b", name: "n2", value: "v2" },
    ];
    const result = bulkDeleteExtensionPropertyRows(rows, ["x", "y"]);
    assert.equal(result.length, 2);
  });

  test("returns full array when rowIds is empty", () => {
    const rows = [{ id: "a", name: "n1", value: "v1" }];
    const result = bulkDeleteExtensionPropertyRows(rows, []);
    assert.equal(result.length, 1);
  });

  test("handles null/undefined inputs gracefully", () => {
    assert.deepStrictEqual(bulkDeleteExtensionPropertyRows(null, ["a"]), []);
    assert.deepStrictEqual(bulkDeleteExtensionPropertyRows([], null), []);
    assert.deepStrictEqual(bulkDeleteExtensionPropertyRows(undefined, undefined), []);
  });

  test("trims and stringifies IDs before matching", () => {
    const rows = [
      { id: " a ", name: "n1", value: "v1" },
      { id: "b", name: "n2", value: "v2" },
    ];
    const result = bulkDeleteExtensionPropertyRows(rows, ["a"]);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "b");
  });
});

// --- Source-level regression checks ---

describe("InlineBpmnPropertyRow source-level checks", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "rows", "InlineBpmnPropertyRow.jsx"),
    "utf8",
  );

  test("has no TrashIcon", () => {
    assert.equal(source.includes("TrashIcon"), false, "TrashIcon should be removed");
  });

  test("renders checkbox", () => {
    assert.ok(source.includes('type="checkbox"'), "Should render a checkbox input");
  });

  test("accepts isSelected prop", () => {
    assert.ok(source.includes("isSelected"), "Should accept isSelected prop");
  });

  test("accepts onToggleSelect prop", () => {
    assert.ok(source.includes("onToggleSelect"), "Should accept onToggleSelect prop");
  });

  test("accepts onShiftClick prop", () => {
    assert.ok(source.includes("onShiftClick"), "Should accept onShiftClick prop");
  });
});
