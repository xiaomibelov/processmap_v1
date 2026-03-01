import assert from "node:assert/strict";
import test from "node:test";

import {
  extractRobotMetaFromBpmn,
  hydrateRobotMetaFromBpmn,
  canonicalizeRobotMeta,
  createDefaultRobotMetaV1,
  removeRobotMetaByElementId,
  ROBOT_META_V1_SHAPE,
  syncRobotMetaToBpmn,
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

function createMockModeler(elements = []) {
  const registryMap = new Map();
  const all = elements.map((entry) => {
    const id = String(entry?.id || "").trim();
    const bo = entry?.businessObject || { id };
    const el = { id, businessObject: bo };
    registryMap.set(id, el);
    return el;
  });

  const registry = {
    get(id) {
      return registryMap.get(String(id || "").trim()) || null;
    },
    getAll() {
      return all.slice();
    },
  };

  const moddle = {
    create(type, payload = {}) {
      if (type === "bpmn:ExtensionElements") {
        return {
          $type: type,
          values: Array.isArray(payload.values) ? payload.values.slice() : [],
          set(key, value) {
            this[key] = value;
          },
        };
      }
      if (type === "pm:RobotMeta") {
        return {
          $type: type,
          version: String(payload.version || ""),
          json: String(payload.json || ""),
          set(key, value) {
            this[key] = value;
          },
        };
      }
      throw new Error(`unexpected type: ${type}`);
    },
  };

  return {
    get(name) {
      if (name === "elementRegistry") return registry;
      if (name === "moddle") return moddle;
      return null;
    },
  };
}

test("syncRobotMetaToBpmn writes pm:RobotMeta once and is idempotent", () => {
  const taskBusinessObject = {
    id: "Task_1",
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [{ $type: "camunda:Properties", values: [] }],
      set(key, value) {
        this[key] = value;
      },
    },
    set(key, value) {
      this[key] = value;
    },
  };
  const modeler = createMockModeler([{ id: "Task_1", businessObject: taskBusinessObject }]);
  const robotMetaMap = {
    Task_1: {
      exec: { mode: "machine", executor: "node_red", action_key: "robot.mix" },
      mat: { from_zone: "cold", to_zone: "heat" },
      qc: { critical: true },
    },
  };

  const first = syncRobotMetaToBpmn({ modeler, robotMetaByElementId: robotMetaMap });
  assert.equal(first.ok, true);
  assert.equal(first.changed, 1);
  const valuesAfterFirst = taskBusinessObject.extensionElements.values;
  assert.equal(valuesAfterFirst.filter((v) => v.$type === "pm:RobotMeta").length, 1);
  assert.equal(valuesAfterFirst.filter((v) => v.$type === "camunda:Properties").length, 1);
  const robotValue = valuesAfterFirst.find((v) => v.$type === "pm:RobotMeta");
  assert.equal(robotValue.version, "v1");
  assert.equal(robotValue.json.includes("\n"), false);

  const second = syncRobotMetaToBpmn({ modeler, robotMetaByElementId: robotMetaMap });
  assert.equal(second.ok, true);
  assert.equal(second.changed, 0);
  assert.equal(taskBusinessObject.extensionElements.values.filter((v) => v.$type === "pm:RobotMeta").length, 1);
});

test("syncRobotMetaToBpmn removes only pm:RobotMeta when meta is absent", () => {
  const taskBusinessObject = {
    id: "Task_1",
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [
        { $type: "camunda:Properties", values: [] },
        { $type: "pm:RobotMeta", version: "v1", json: "{\"robot_meta_version\":\"v1\"}" },
      ],
      set(key, value) {
        this[key] = value;
      },
    },
    set(key, value) {
      this[key] = value;
    },
  };
  const modeler = createMockModeler([{ id: "Task_1", businessObject: taskBusinessObject }]);

  const res = syncRobotMetaToBpmn({ modeler, robotMetaByElementId: {} });
  assert.equal(res.ok, true);
  assert.equal(res.changed, 1);
  assert.equal(taskBusinessObject.extensionElements.values.filter((v) => v.$type === "pm:RobotMeta").length, 0);
  assert.equal(taskBusinessObject.extensionElements.values.filter((v) => v.$type === "camunda:Properties").length, 1);
});

test("extractRobotMetaFromBpmn trims strings and skips unsupported/bad entries", () => {
  const warnings = [];
  const modeler = createMockModeler([
    {
      id: "Task_1",
      businessObject: {
        id: "Task_1",
        extensionElements: {
          values: [
            {
              $type: "pm:RobotMeta",
              version: "v1",
              json: JSON.stringify({
                robot_meta_version: "v1",
                exec: {
                  mode: "machine ",
                  executor: " node_red ",
                  action_key: " robot.mix ",
                },
                mat: {
                  from_zone: " cold ",
                  to_zone: " heat ",
                },
              }),
            },
          ],
        },
      },
    },
    {
      id: "Task_2",
      businessObject: {
        id: "Task_2",
        extensionElements: {
          values: [{ $type: "pm:RobotMeta", version: "v2", json: "{\"robot_meta_version\":\"v2\"}" }],
        },
      },
    },
    {
      id: "Task_3",
      businessObject: {
        id: "Task_3",
        extensionElements: {
          values: [{ $type: "pm:RobotMeta", version: "v1", json: "{bad json" }],
        },
      },
    },
  ]);

  const extracted = extractRobotMetaFromBpmn({
    modeler,
    onWarning: (code, detail) => warnings.push({ code, detail }),
  });

  assert.equal(Object.keys(extracted).length, 1);
  assert.equal(extracted.Task_1.exec.mode, "machine");
  assert.equal(extracted.Task_1.exec.executor, "node_red");
  assert.equal(extracted.Task_1.exec.action_key, "robot.mix");
  assert.equal(extracted.Task_1.mat.from_zone, "cold");
  assert.equal(extracted.Task_1.mat.to_zone, "heat");
  assert.equal(
    warnings.some((w) => String(w.code) === "unsupported_version" && String(w?.detail?.elementId) === "Task_2"),
    true,
  );
  assert.equal(
    warnings.some((w) => String(w.code) === "invalid_json" && String(w?.detail?.elementId) === "Task_3"),
    true,
  );
});

test("hydrateRobotMetaFromBpmn keeps session map when non-empty and reports conflicts", () => {
  const hydrated = hydrateRobotMetaFromBpmn({
    sessionMetaMap: {
      Task_1: { exec: { mode: "machine", executor: "node_red", action_key: "session.win" } },
      Task_2: { exec: { mode: "human", executor: "manual_ui" } },
    },
    extractedMap: {
      Task_1: { exec: { mode: "machine", executor: "node_red", action_key: "xml.value" } },
      Task_3: { exec: { mode: "machine", executor: "robot_cell", action_key: "from.xml" } },
    },
  });

  assert.equal(hydrated.adoptedFromBpmn, false);
  assert.equal(hydrated.nextSessionMetaMap.Task_1.exec.action_key, "session.win");
  assert.equal(typeof hydrated.nextSessionMetaMap.Task_3, "undefined");
  assert.deepEqual(hydrated.conflicts, ["Task_1"]);
});

test("hydrateRobotMetaFromBpmn seeds session map from BPMN when session map is empty", () => {
  const hydrated = hydrateRobotMetaFromBpmn({
    sessionMetaMap: {},
    extractedMap: {
      Task_1: { exec: { mode: "machine", executor: "node_red", action_key: "from.xml" } },
    },
  });
  assert.equal(hydrated.adoptedFromBpmn, true);
  assert.equal(hydrated.nextSessionMetaMap.Task_1.exec.action_key, "from.xml");
});
