import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPathTierLabel,
  normalizePathSequenceKey,
  normalizePathTier,
  normalizePathTierList,
} from "./pathClassification.js";

test("path classification normalizes primitive, alias, and option-object values", () => {
  assert.equal(normalizePathTier("P0"), "P0");
  assert.equal(normalizePathTier("ideal"), "P0");
  assert.equal(normalizePathTier({ value: "alternative", label: "Альтернативный" }), "P1");
  assert.equal(normalizePathTier({ key: "recovery", label: "Восстановление" }), "P1");
  assert.equal(normalizePathTier({ value: "failure", label: "Неуспех" }), "P2");
  assert.equal(normalizePathTier({ label: "P0" }), "");
});

test("path classification keeps multiple values ordered and deduplicated", () => {
  assert.deepEqual(
    normalizePathTierList(["P2", { value: "P0" }, "alternative", "P1"]),
    ["P0", "P1", "P2"],
  );
});

test("sequence key normalizes option objects without object_object leakage", () => {
  assert.equal(normalizePathSequenceKey({ key: "Primary Alt 2", label: "Основной 2" }), "primary_alt_2");
  assert.equal(normalizePathSequenceKey({ label: "Основной 2" }), "");
  assert.notEqual(normalizePathSequenceKey({ key: "Primary" }), "object_object");
});

test("path labels expose alternative copy for P1", () => {
  assert.equal(formatPathTierLabel("P0"), "Идеальный");
  assert.equal(formatPathTierLabel("P1"), "Альтернативный");
  assert.equal(formatPathTierLabel("P2"), "Неуспех / эскалация");
});
