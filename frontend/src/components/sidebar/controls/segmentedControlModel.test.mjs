import test from "node:test";
import assert from "node:assert/strict";

import {
  SEGMENTED_NAV_KEYS,
  assertValidOptions,
  nextValueOnKey,
} from "./segmentedControlModel.js";

const OPTS = [
  { value: "hover", label: "При наведении" },
  { value: "always", label: "Всегда" },
  { value: "hidden", label: "Скрыто" },
];

test("nextValueOnKey: arrows move with wrap-around", () => {
  assert.equal(nextValueOnKey("hover", "ArrowRight", OPTS), "always");
  assert.equal(nextValueOnKey("hover", "ArrowDown", OPTS), "always");
  assert.equal(nextValueOnKey("hover", "ArrowLeft", OPTS), "hidden");
  assert.equal(nextValueOnKey("hover", "ArrowUp", OPTS), "hidden");
  assert.equal(nextValueOnKey("hidden", "ArrowRight", OPTS), "hover");
});

test("nextValueOnKey: Home/End jump to first/last enabled", () => {
  assert.equal(nextValueOnKey("hidden", "Home", OPTS), "hover");
  assert.equal(nextValueOnKey("hover", "End", OPTS), "hidden");
});

test("nextValueOnKey: disabled options are skipped", () => {
  const opts = [
    { value: "a", label: "A" },
    { value: "b", label: "B", disabled: true },
    { value: "c", label: "C" },
  ];
  assert.equal(nextValueOnKey("a", "ArrowRight", opts), "c");
  assert.equal(nextValueOnKey("c", "ArrowLeft", opts), "a");
  assert.equal(nextValueOnKey("a", "End", opts), "c");
  assert.equal(nextValueOnKey("c", "Home", opts), "a");
});

test("nextValueOnKey: non-navigation keys and edge cases keep current value", () => {
  assert.equal(nextValueOnKey("hover", "Enter", OPTS), "hover");
  assert.equal(nextValueOnKey("hover", " ", OPTS), "hover");
  assert.equal(nextValueOnKey("hover", "ArrowRight", []), "hover");
  assert.equal(nextValueOnKey("hover", "ArrowRight", null), "hover");
  // Unknown current value: ArrowRight starts from the first enabled.
  assert.equal(nextValueOnKey("nope", "ArrowRight", OPTS), "hover");
  assert.equal(nextValueOnKey("nope", "ArrowLeft", OPTS), "hidden");
});

test("nextValueOnKey: all-disabled options keep current value", () => {
  const opts = [{ value: "a", label: "A", disabled: true }, { value: "b", label: "B", disabled: true }];
  assert.equal(nextValueOnKey("a", "ArrowRight", opts), "a");
  assert.equal(nextValueOnKey("a", "End", opts), "a");
});

test("SEGMENTED_NAV_KEYS covers the radio-group key set", () => {
  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].forEach((key) => {
    assert.equal(SEGMENTED_NAV_KEYS.has(key), true, key);
  });
});

test("assertValidOptions: accepts 2..4 labeled unique options", () => {
  assert.equal(assertValidOptions(OPTS), true);
  assert.equal(assertValidOptions([{ value: "a", label: "A" }, { value: "b", label: "B" }]), true);
});

test("assertValidOptions: rejects invalid definitions", () => {
  assert.throws(() => assertValidOptions([{ value: "a", label: "A" }]), /2\.\.4/);
  assert.throws(() => assertValidOptions([1, 2, 3, 4, 5].map((n) => ({ value: `v${n}`, label: `L${n}` }))), /2\.\.4/);
  assert.throws(() => assertValidOptions([{ value: "", label: "A" }, { value: "b", label: "B" }]), /without value/);
  assert.throws(() => assertValidOptions([{ value: "a" }, { value: "b", label: "B" }]), /without label/);
  assert.throws(() => assertValidOptions([{ value: "a", label: "A" }, { value: "a", label: "A2" }]), /duplicate/);
  assert.throws(() => assertValidOptions([
    { value: "a", label: "A", disabled: true },
    { value: "b", label: "B", disabled: true },
  ]), /all options are disabled/);
});
