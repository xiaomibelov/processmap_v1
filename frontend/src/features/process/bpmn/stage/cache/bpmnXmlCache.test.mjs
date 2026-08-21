import test from "node:test";
import assert from "node:assert/strict";
import { createBpmnXmlCache } from "./bpmnXmlCache.js";

test("createBpmnXmlCache get/set/has", () => {
  const cache = createBpmnXmlCache();
  assert.equal(cache.has("s1"), false);
  cache.set("s1", "<xml/>");
  assert.equal(cache.has("s1"), true);
  assert.equal(cache.get("s1"), "<xml/>");
});

test("createBpmnXmlCache normalizes sid to string", () => {
  const cache = createBpmnXmlCache();
  cache.set(123, "<xml/>");
  assert.equal(cache.get("123"), "<xml/>");
});

test("createBpmnXmlCache delete removes entry", () => {
  const cache = createBpmnXmlCache();
  cache.set("s1", "<xml/>");
  cache.delete("s1");
  assert.equal(cache.has("s1"), false);
  assert.equal(cache.get("s1"), undefined);
});

test("createBpmnXmlCache clear removes all entries", () => {
  const cache = createBpmnXmlCache();
  cache.set("s1", "<a/>");
  cache.set("s2", "<b/>");
  cache.clear();
  assert.equal(cache.has("s1"), false);
  assert.equal(cache.has("s2"), false);
  assert.deepEqual(cache.keys(), []);
});

test("createBpmnXmlCache keys returns all session ids", () => {
  const cache = createBpmnXmlCache();
  cache.set("s2", "<b/>");
  cache.set("s1", "<a/>");
  assert.deepEqual(cache.keys().sort(), ["s1", "s2"]);
});

test("createBpmnXmlCache ignores empty sid", () => {
  const cache = createBpmnXmlCache();
  cache.set("", "<xml/>");
  cache.set(null, "<xml/>");
  assert.deepEqual(cache.keys(), []);
});

test("createBpmnXmlCache coerces falsy xml to empty string", () => {
  const cache = createBpmnXmlCache();
  cache.set("s1", null);
  assert.equal(cache.get("s1"), "");
});
