import assert from "node:assert/strict";
import test from "node:test";
import { areCamundaPropertiesSectionPropsEqual } from "./camundaPropertiesSectionMemo.js";

test("returns true when props are shallow-equal", () => {
  const a = { value: 1, list: [1, 2] };
  const b = { value: 1, list: [1, 2] };
  assert.equal(areCamundaPropertiesSectionPropsEqual(a, b), false);
});

test("returns true for identical references", () => {
  const a = { value: 1 };
  assert.equal(areCamundaPropertiesSectionPropsEqual(a, a), true);
});

test("returns false when function callback identity changes", () => {
  const fn1 = () => {};
  const fn2 = () => {};
  const a = { onSave: fn1, value: 1 };
  const b = { onSave: fn2, value: 1 };
  assert.equal(areCamundaPropertiesSectionPropsEqual(a, b), false);
});

test("returns true when function callback identity is stable", () => {
  const fn = () => {};
  const a = { onSave: fn, value: 1 };
  const b = { onSave: fn, value: 2 };
  assert.equal(areCamundaPropertiesSectionPropsEqual(a, b), false);
});

test("function-only change makes props not equal", () => {
  const fn1 = () => 1;
  const fn2 = () => 2;
  const base = { draft: { a: 1 } };
  const a = { ...base, onSave: fn1 };
  const b = { ...base, onSave: fn2 };
  assert.equal(areCamundaPropertiesSectionPropsEqual(a, b), false);
});
