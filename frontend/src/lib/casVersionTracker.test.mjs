import test from "node:test";
import assert from "node:assert/strict";

import {
  setVersion,
  getVersion,
  bumpVersion,
  rollbackVersion,
  isValidForSession,
  clearSession,
  __resetForTests,
} from "./casVersionTracker.js";

test.beforeEach(() => {
  __resetForTests();
});

test("set/get version for a session", () => {
  assert.equal(getVersion("sid-1"), null);
  setVersion("sid-1", 7);
  assert.equal(getVersion("sid-1"), 7);
});

test("getVersion normalizes invalid input and returns null for unknown sessions", () => {
  assert.equal(getVersion(""), null);
  assert.equal(getVersion(null), null);
  assert.equal(getVersion("unknown"), null);
});

test("setVersion ignores invalid versions", () => {
  setVersion("sid-1", -1);
  assert.equal(isValidForSession("sid-1"), false);
  setVersion("sid-1", "not-a-number");
  assert.equal(isValidForSession("sid-1"), false);
});

test("bumpVersion advances the current version and preserves rollback history", () => {
  setVersion("sid-1", 5);
  bumpVersion("sid-1", 6);
  assert.equal(getVersion("sid-1"), 6);
  bumpVersion("sid-1", 7);
  assert.equal(getVersion("sid-1"), 7);

  rollbackVersion("sid-1");
  assert.equal(getVersion("sid-1"), 6);

  rollbackVersion("sid-1");
  assert.equal(getVersion("sid-1"), 5);

  rollbackVersion("sid-1");
  assert.equal(getVersion("sid-1"), 5);
});

test("rollbackVersion without prior known version keeps current version", () => {
  setVersion("sid-1", 3);
  assert.equal(rollbackVersion("sid-1"), 3);
});

test("rollbackVersion on unknown session returns null", () => {
  assert.equal(rollbackVersion("sid-1"), null);
});

test("rollbackVersion restores prior version after failed save", () => {
  setVersion("sid-1", 10);
  bumpVersion("sid-1", 11);
  assert.equal(getVersion("sid-1"), 11);

  rollbackVersion("sid-1");
  assert.equal(getVersion("sid-1"), 10);
});

test("session isolation: versions are independent per session", () => {
  setVersion("sid-a", 1);
  setVersion("sid-b", 99);
  bumpVersion("sid-a", 2);

  assert.equal(getVersion("sid-a"), 2);
  assert.equal(getVersion("sid-b"), 99);

  rollbackVersion("sid-a");
  assert.equal(getVersion("sid-a"), 1);
  assert.equal(getVersion("sid-b"), 99);
});

test("clearSession removes state", () => {
  setVersion("sid-1", 5);
  assert.equal(isValidForSession("sid-1"), true);
  clearSession("sid-1");
  assert.equal(isValidForSession("sid-1"), false);
  assert.equal(getVersion("sid-1"), null);
});

test("history ring drops oldest entries after many bumps", () => {
  setVersion("sid-1", 0);
  for (let i = 1; i <= 12; i += 1) {
    bumpVersion("sid-1", i);
  }
  assert.equal(getVersion("sid-1"), 12);

  // With capacity 8 and versions 0..12, only the last 8 (5..12) are retained.
  for (let i = 0; i < 7; i += 1) {
    rollbackVersion("sid-1");
  }
  assert.equal(getVersion("sid-1"), 5);

  rollbackVersion("sid-1");
  assert.equal(getVersion("sid-1"), 5);
});
