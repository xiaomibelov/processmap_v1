import assert from "node:assert/strict";
import test from "node:test";
import { deleteExtensionPropertyRowsByDeleteAction } from "./propertyDeleteSemantics.js";

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
