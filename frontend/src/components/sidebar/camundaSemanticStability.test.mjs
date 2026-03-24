import test from "node:test";
import assert from "node:assert/strict";
import { getStableCamundaEntryBySemanticCache } from "./camundaSemanticStability.js";

test("reuses previous entry for same element and same canonical payload", () => {
  const prev = { properties: { extensionProperties: [{ id: "p1", name: "x", value: "1" }] } };
  const cacheRef = {
    current: {
      elementId: "Task_1",
      canonical: "{\"a\":1}",
      value: prev,
    },
  };
  const next = { properties: { extensionProperties: [{ id: "p1", name: "x", value: "1" }] } };
  const resolved = getStableCamundaEntryBySemanticCache({
    cacheRef,
    elementId: "Task_1",
    canonical: "{\"a\":1}",
    entry: next,
  });
  assert.equal(resolved, prev);
  assert.equal(cacheRef.current.value, prev);
});

test("updates cache when canonical payload changes for same element", () => {
  const prev = { properties: { extensionProperties: [{ id: "p1", name: "x", value: "1" }] } };
  const next = { properties: { extensionProperties: [{ id: "p1", name: "x", value: "2" }] } };
  const cacheRef = {
    current: {
      elementId: "Task_1",
      canonical: "{\"a\":1}",
      value: prev,
    },
  };
  const resolved = getStableCamundaEntryBySemanticCache({
    cacheRef,
    elementId: "Task_1",
    canonical: "{\"a\":2}",
    entry: next,
  });
  assert.equal(resolved, next);
  assert.equal(cacheRef.current.value, next);
  assert.equal(cacheRef.current.canonical, "{\"a\":2}");
});

test("does not reuse cache when selected element changes", () => {
  const prev = { properties: { extensionProperties: [{ id: "p1", name: "x", value: "1" }] } };
  const next = { properties: { extensionProperties: [{ id: "p1", name: "x", value: "1" }] } };
  const cacheRef = {
    current: {
      elementId: "Task_1",
      canonical: "{\"a\":1}",
      value: prev,
    },
  };
  const resolved = getStableCamundaEntryBySemanticCache({
    cacheRef,
    elementId: "Task_2",
    canonical: "{\"a\":1}",
    entry: next,
  });
  assert.equal(resolved, next);
  assert.equal(cacheRef.current.value, next);
  assert.equal(cacheRef.current.elementId, "Task_2");
});
