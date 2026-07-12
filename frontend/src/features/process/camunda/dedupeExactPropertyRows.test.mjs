import test from "node:test";
import assert from "node:assert/strict";

import { dedupeExactPropertyRows } from "./dedupeExactPropertyRows.js";

test("dedupeExactPropertyRows: non-array input yields []", () => {
  assert.deepEqual(dedupeExactPropertyRows(undefined), []);
  assert.deepEqual(dedupeExactPropertyRows(null), []);
  assert.deepEqual(dedupeExactPropertyRows("nope"), []);
});

test("dedupeExactPropertyRows: drops exact name+value duplicates, keeps order", () => {
  const rows = [
    { name: "a", value: "1" },
    { name: "b", value: "2" },
    { name: "a", value: "1" },
    { name: "a", value: "3" },
  ];
  assert.deepEqual(dedupeExactPropertyRows(rows), [
    { name: "a", value: "1" },
    { name: "b", value: "2" },
    { name: "a", value: "3" },
  ]);
});

test("dedupeExactPropertyRows: name and value are trimmed for the signature", () => {
  const rows = [
    { name: " a ", value: " 1 " },
    { name: "a", value: "1" },
  ];
  assert.deepEqual(dedupeExactPropertyRows(rows), [{ name: " a ", value: " 1 " }]);
});

test("dedupeExactPropertyRows: nameless rows are always kept", () => {
  const rows = [
    { name: "", value: "x" },
    { value: "y" },
    { name: "  ", value: "x" },
  ];
  assert.deepEqual(dedupeExactPropertyRows(rows), rows);
});

test("dedupeExactPropertyRows: keyFields option supports key ?? name source", () => {
  const rows = [
    { key: "k1", name: "n1", value: "v" },
    { key: "k1", name: "n2", value: "v" },
    { name: "k1", value: "v" },
  ];
  // key ?? name: first two share key k1+v -> second dropped; third has no key,
  // falls back to name k1 -> same signature -> dropped too.
  assert.deepEqual(dedupeExactPropertyRows(rows, { keyFields: ["key", "name"] }), [
    { key: "k1", name: "n1", value: "v" },
  ]);
  // Default name-only: all three names (n1, n2, k1) are distinct -> all kept.
  assert.deepEqual(dedupeExactPropertyRows(rows), rows);
});

test("dedupeExactPropertyRows: nullish vs empty key fallback semantics", () => {
  // key: "" is not nullish -> used as-is -> trimmed to "" -> nameless -> kept.
  const rows = [
    { key: "", name: "n", value: "v" },
    { key: "", name: "n", value: "v" },
  ];
  assert.deepEqual(dedupeExactPropertyRows(rows, { keyFields: ["key", "name"] }), rows);
});
