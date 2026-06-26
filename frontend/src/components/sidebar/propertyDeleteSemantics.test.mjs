import assert from "node:assert/strict";
import test from "node:test";
import { deleteExtensionPropertyRowsByDeleteAction } from "./propertyDeleteSemantics.js";

test("delete removes only the row with the given id", () => {
  const rows = [
    { id: "a1", name: "equipment", value: "Весы" },
    { id: "a2", name: "equipment", value: "Миксер" },
    { id: "b1", name: "container", value: "Лоток" },
  ];
  const result = deleteExtensionPropertyRowsByDeleteAction(rows, "a2");
  assert.deepEqual(
    result.map((row) => ({ id: row.id, name: row.name, value: row.value })),
    [
      { id: "a1", name: "equipment", value: "Весы" },
      { id: "b1", name: "container", value: "Лоток" },
    ],
  );
});

test("delete with unknown id leaves rows unchanged", () => {
  const rows = [
    { id: "a1", name: "equipment", value: "Весы" },
  ];
  const result = deleteExtensionPropertyRowsByDeleteAction(rows, "unknown");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a1");
});

test("delete with empty id leaves rows unchanged", () => {
  const rows = [
    { id: "a1", name: "equipment", value: "Весы" },
  ];
  const result = deleteExtensionPropertyRowsByDeleteAction(rows, "");
  assert.equal(result.length, 1);
});
