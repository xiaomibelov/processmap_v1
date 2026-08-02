import test from "node:test";
import assert from "node:assert/strict";

import {
  SAVE_CONFLICT_HTTP_STATUS,
  SAVE_CONFLICT_RESOLUTION,
  SAVE_FAILURE_KIND,
  SAVE_LOCK_BUSY_HTTP_STATUS,
  classifySaveHttpStatus,
  isSaveConflictStatus,
  isSaveLockBusyStatus,
} from "../conflictModel.js";

test("409 классифицируется как CONFLICT (решение пользователя, без авто-ретрая)", () => {
  assert.equal(SAVE_CONFLICT_HTTP_STATUS, 409);
  assert.equal(classifySaveHttpStatus(409), SAVE_FAILURE_KIND.CONFLICT);
  assert.equal(isSaveConflictStatus(409), true);
  assert.equal(isSaveLockBusyStatus(409), false);
});

test("423 классифицируется как LOCK_BUSY (авто-ретрай безопасен)", () => {
  assert.equal(SAVE_LOCK_BUSY_HTTP_STATUS, 423);
  assert.equal(classifySaveHttpStatus(423), SAVE_FAILURE_KIND.LOCK_BUSY);
  assert.equal(isSaveLockBusyStatus(423), true);
  assert.equal(isSaveConflictStatus(423), false);
});

test("прочие статусы не являются конфликтом или lock-busy", () => {
  for (const status of [0, 200, 400, 403, 422, 500, "abc", null, undefined]) {
    assert.equal(classifySaveHttpStatus(status), null, `status=${status}`);
    assert.equal(isSaveConflictStatus(status), false, `status=${status}`);
    assert.equal(isSaveLockBusyStatus(status), false, `status=${status}`);
  }
});

test("контракт решений конфликта: refresh / overwrite / cancel", () => {
  assert.deepEqual(
    Object.values(SAVE_CONFLICT_RESOLUTION).sort(),
    ["cancel", "overwrite", "refresh"],
  );
});
