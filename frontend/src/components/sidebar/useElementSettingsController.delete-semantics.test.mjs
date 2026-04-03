import test from "node:test";
import assert from "node:assert/strict";

import { deleteExtensionPropertyRowsByDeleteAction } from "./propertyDeleteSemantics.js";

test("delete by row id removes all sibling rows for the same logical property key", () => {
  const rows = [
    { id: "r1", name: "ingredient", value: "salt" },
    { id: "r2", name: "ingredient", value: "pepper" },
    { id: "r3", name: "equipment", value: "pot" },
  ];
  const next = deleteExtensionPropertyRowsByDeleteAction(rows, "r1");
  assert.deepEqual(
    next.map((row) => row.id),
    ["r3"],
  );
});

test("delete for single-instance key removes only target key rows", () => {
  const rows = [
    { id: "r1", name: "ingredient_value", value: "from_task" },
    { id: "r2", name: "equipment", value: "pot" },
  ];
  const next = deleteExtensionPropertyRowsByDeleteAction(rows, "r1");
  assert.deepEqual(
    next.map((row) => row.id),
    ["r2"],
  );
});

test("delete unnamed draft row remains row-level and does not over-delete named rows", () => {
  const rows = [
    { id: "r1", name: "", value: "" },
    { id: "r2", name: "ingredient", value: "salt" },
    { id: "r3", name: "ingredient", value: "pepper" },
  ];
  const next = deleteExtensionPropertyRowsByDeleteAction(rows, "r1");
  assert.deepEqual(
    next.map((row) => row.id),
    ["r2", "r3"],
  );
});

test("delete no-op when row id is missing", () => {
  const rows = [
    { id: "r1", name: "ingredient", value: "salt" },
  ];
  const next = deleteExtensionPropertyRowsByDeleteAction(rows, "missing");
  assert.deepEqual(next, rows);
});
