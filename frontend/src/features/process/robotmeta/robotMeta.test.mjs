import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeRobotMeta,
  createDefaultRobotMetaV1,
  removeRobotMetaByElementId,
  ROBOT_META_V1_SHAPE,
  upsertRobotMetaByElementId,
  validateRobotMetaV1,
} from "./robotMeta.js";

test("RobotMetaV1 default shape matches required contract", () => {
  const created = createDefaultRobotMetaV1();
  assert.equal(created.robot_meta_version, "v1");
  assert.equal(created.exec.mode, "human");
  assert.equal(created.exec.executor, "manual_ui");
  assert.equal(created.exec.action_key, null);
  assert.equal(created.exec.timeout_sec, null);
  assert.deepEqual(created.exec.retry, { max_attempts: 1, backoff_sec: 0 });
  assert.deepEqual(created.mat.inputs, []);
  assert.deepEqual(created.mat.outputs, []);
  assert.deepEqual(created.qc.checks, []);
  assert.equal(ROBOT_META_V1_SHAPE.robot_meta_version, "v1");
});

test("validateRobotMetaV1 rejects invalid raw fields", () => {
  const res = validateRobotMetaV1({
    exec: {
      mode: "invalid_mode",
      timeout_sec: -5,
      retry: {
        max_attempts: -1,
        backoff_sec: -2,
      },
    },
  });
  assert.equal(res.ok, false);
  assert.equal(res.errors.includes("exec.mode must be human|machine|hybrid"), true);
  assert.equal(res.errors.includes("exec.timeout_sec must be >= 0"), true);
  assert.equal(res.errors.includes("exec.retry.max_attempts must be >= 0"), true);
  assert.equal(res.errors.includes("exec.retry.backoff_sec must be >= 0"), true);
});

test("canonicalizeRobotMeta normalizes nulls/arrays and key order", () => {
  const canonical = canonicalizeRobotMeta({
    qc: { checks: [{ z: 1, a: 2 }], critical: 1 },
    mat: { outputs: [{ y: 2, x: 1 }], inputs: [{ b: 2, a: 1 }], to_zone: "", from_zone: " cold " },
    exec: {
      retry: { backoff_sec: "3", max_attempts: "2" },
      timeout_sec: "120",
      action_key: "  action.key  ",
      executor: "node_red",
      mode: "machine",
    },
  });
  assert.equal(canonical.robot_meta_version, "v1");
  assert.equal(canonical.exec.mode, "machine");
  assert.equal(canonical.exec.action_key, "action.key");
  assert.equal(canonical.exec.timeout_sec, 120);
  assert.deepEqual(canonical.exec.retry, { max_attempts: 2, backoff_sec: 3 });
  assert.equal(canonical.mat.from_zone, "cold");
  assert.equal(canonical.mat.to_zone, null);
  assert.deepEqual(canonical.mat.inputs, [{ a: 1, b: 2 }]);
  assert.deepEqual(canonical.mat.outputs, [{ x: 1, y: 2 }]);
});

test("upsert/remove robot meta by element id writes and deletes keys", () => {
  const inserted = upsertRobotMetaByElementId({}, "Task_1", {
    exec: { mode: "machine", executor: "robot_cell", action_key: "mix" },
  });
  assert.equal(typeof inserted.Task_1, "object");
  assert.equal(inserted.Task_1.exec.mode, "machine");
  assert.equal(inserted.Task_1.exec.executor, "robot_cell");
  assert.equal(inserted.Task_1.exec.action_key, "mix");

  const removed = removeRobotMetaByElementId(inserted, "Task_1");
  assert.equal(Object.prototype.hasOwnProperty.call(removed, "Task_1"), false);
});
