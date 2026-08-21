import test from "node:test";
import assert from "node:assert/strict";

import { mergeSearchParams, pageToOffset, parsePage, parsePageSize, rangeToTsFrom } from "./adminQuery.js";

test("parsePageSize allows only supported values", () => {
  assert.equal(parsePageSize("10", 20), 10);
  assert.equal(parsePageSize("30", 20), 30);
  assert.equal(parsePageSize("25", 20), 20);
  assert.equal(parsePageSize("", 20), 20);
});

test("parsePage normalizes invalid values", () => {
  assert.equal(parsePage("1", 1), 1);
  assert.equal(parsePage("3", 1), 3);
  assert.equal(parsePage("0", 1), 1);
  assert.equal(parsePage("-2", 1), 1);
  assert.equal(parsePage("foo", 2), 2);
});

test("pageToOffset computes offset from page and size", () => {
  assert.equal(pageToOffset(1, 20), 0);
  assert.equal(pageToOffset(2, 20), 20);
  assert.equal(pageToOffset(4, 10), 30);
});

test("rangeToTsFrom converts known ranges", () => {
  const now = 1_700_000_000;
  assert.equal(rangeToTsFrom("24h", now), now - 24 * 60 * 60);
  assert.equal(rangeToTsFrom("7d", now), now - 7 * 24 * 60 * 60);
  assert.equal(rangeToTsFrom("30d", now), now - 30 * 24 * 60 * 60);
  assert.equal(rangeToTsFrom("", now), 0);
});

test("mergeSearchParams preserves unrelated params and resets page", () => {
  const params = mergeSearchParams("foo=bar&page=3&q=abc", { q: "", status: "ready" }, { resetPage: true });
  assert.equal(params.get("foo"), "bar");
  assert.equal(params.get("q"), null);
  assert.equal(params.get("status"), "ready");
  assert.equal(params.get("page"), "1");
});
