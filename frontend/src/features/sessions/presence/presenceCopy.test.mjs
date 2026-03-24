import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionPresenceCopy, normalizeOtherActiveUsersCount } from "./presenceCopy.js";

test("normalizeOtherActiveUsersCount clamps invalid values", () => {
  assert.equal(normalizeOtherActiveUsersCount(-3), 0);
  assert.equal(normalizeOtherActiveUsersCount("2.8"), 2);
  assert.equal(normalizeOtherActiveUsersCount("foo"), 0);
});

test("buildSessionPresenceCopy returns empty for zero", () => {
  assert.equal(buildSessionPresenceCopy(0), "");
});

test("buildSessionPresenceCopy handles singular Russian form", () => {
  assert.equal(buildSessionPresenceCopy(1), "в сессии ещё 1 пользователь");
  assert.equal(buildSessionPresenceCopy(21), "в сессии ещё 21 пользователь");
});

test("buildSessionPresenceCopy handles few Russian form", () => {
  assert.equal(buildSessionPresenceCopy(2), "в сессии ещё 2 пользователя");
  assert.equal(buildSessionPresenceCopy(4), "в сессии ещё 4 пользователя");
});

test("buildSessionPresenceCopy handles many Russian form", () => {
  assert.equal(buildSessionPresenceCopy(5), "в сессии ещё 5 пользователей");
  assert.equal(buildSessionPresenceCopy(11), "в сессии ещё 11 пользователей");
  assert.equal(buildSessionPresenceCopy(25), "в сессии ещё 25 пользователей");
});

