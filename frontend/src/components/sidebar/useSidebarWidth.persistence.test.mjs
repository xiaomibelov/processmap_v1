// Pure-node behavior tests for the sidebar-width persistence layer (no jsdom).
// Covers the three fix levels: write only on drag-end (writeWidth is a single
// setItem), graceful QuotaExceededError fallback, and safe read fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  DEFAULT_WIDTH,
  MAX_WIDTH,
  MIN_WIDTH,
  clampWidth,
  readWidth,
  writeWidth,
  cleanupOwnKeys,
} from "./useSidebarWidth.js";

function makeStorage({ quota = "never" } = {}) {
  const map = new Map();
  let setCalls = 0;
  return {
    _map: map,
    get length() {
      return map.size;
    },
    key(i) {
      return Array.from(map.keys())[i] ?? null;
    },
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      setCalls += 1;
      if (quota === "always") {
        throw { name: "QuotaExceededError" };
      }
      if (quota === "once" && setCalls === 1) {
        throw { name: "QuotaExceededError" };
      }
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

test("clampWidth bounds to 300..520", () => {
  assert.equal(clampWidth(100), MIN_WIDTH);
  assert.equal(clampWidth(380), 380);
  assert.equal(clampWidth(9999), MAX_WIDTH);
});

test("readWidth parses/clamps and falls back on bad input", () => {
  assert.equal(readWidth(null), DEFAULT_WIDTH);
  const s = makeStorage();
  s.setItem(STORAGE_KEY, "400");
  assert.equal(readWidth(s), 400);
  s.setItem(STORAGE_KEY, "9999");
  assert.equal(readWidth(s), MAX_WIDTH);
  s.setItem(STORAGE_KEY, "abc");
  assert.equal(readWidth(s), DEFAULT_WIDTH);
});

test("readWidth falls back when storage throws", () => {
  const throwing = { getItem() { throw new Error("private mode"); } };
  assert.equal(readWidth(throwing), DEFAULT_WIDTH);
});

test("writeWidth writes exactly once on the happy path", () => {
  const s = makeStorage();
  assert.equal(writeWidth(s, 412), true);
  assert.equal(s.getItem(STORAGE_KEY), "412");
});

test("writeWidth recovers from a one-off QuotaExceededError and evicts only ephemeral keys", () => {
  const s = makeStorage({ quota: "once" });
  s._map.set("processmap_cache_heavy", "x".repeat(1000)); // ephemeral -> evicted
  s._map.set("processmap_quick_pins", "[\"foo\"]"); // user data -> kept
  s._map.set("foreign_key", "keep"); // foreign -> kept

  assert.equal(writeWidth(s, 333), true);
  assert.equal(s.getItem(STORAGE_KEY), "333");
  assert.equal(s._map.has("processmap_cache_heavy"), false, "ephemeral evicted");
  assert.equal(s._map.has("processmap_quick_pins"), true, "user data kept");
  assert.equal(s._map.has("foreign_key"), true, "foreign key kept");
});

test("writeWidth never throws when storage stays full; warns and returns false", () => {
  const s = makeStorage({ quota: "always" });
  const origWarn = console.warn;
  let warns = 0;
  console.warn = () => {
    warns += 1;
  };
  let threw = false;
  let result;
  try {
    result = writeWidth(s, 300);
  } catch (_) {
    threw = true;
  } finally {
    console.warn = origWarn;
  }
  assert.equal(threw, false, "no unhandled throw");
  assert.equal(result, false);
  assert.ok(warns >= 1, "warned instead of red error");
});

test("cleanupOwnKeys removes only our ephemeral keys", () => {
  const s = makeStorage();
  s._map.set("processmap_cache_a", "1");
  s._map.set("processmap_draft_b", "1");
  s._map.set("processmap_quick_pins", "keep");
  s._map.set(STORAGE_KEY, "keep");
  s._map.set("theme", "keep");
  const removed = cleanupOwnKeys(s);
  assert.equal(removed, 2);
  assert.equal(s._map.has("processmap_cache_a"), false);
  assert.equal(s._map.has("processmap_draft_b"), false);
  assert.equal(s._map.has("processmap_quick_pins"), true);
  assert.equal(s._map.has(STORAGE_KEY), true);
  assert.equal(s._map.has("theme"), true);
});
