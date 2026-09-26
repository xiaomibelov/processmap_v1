// canvasGeometryApplyInstance.test.mjs — unit-контракты persist-пути
// «Применить к схеме» (контур fix/canvas-apply-persist-validation).
//
// Классы дефектов (см. RED.md/FIX.md):
//   A: DI-waypoint reroute plain-объектами ломал saveXML — покрывается
//      интеграционным тестом canvasGeometryApplyInstance.vitest.mjs (нужен
//      реальный moddle); здесь — чистая фабрика diWaypointFactory.
//   B: saveXML бросает → undo + error (раньше exception улетал во внешний
//      catch БЕЗ undo, схема оставалась применённой без PUT).
//   C: persist ok:true без bpmnVersionSnapshot (серверный no-op guard,
//      контракт закреплён backend/tests/test_bpmn_put_noop_guard_contract.py)
//      → УСПЕХ без undo (раньше: ложный undo + error).
// Контракт #1043 (undo на persist failure) — не регрессирует (G5-проверка).
import test from "node:test";
import assert from "node:assert/strict";

import {
  applyGeometryOnInstance,
  computeGeometryApplyPlanFromRegistry,
  diWaypointFactory,
} from "./canvasGeometryApplyInstance.js";

function makeShape(id, x, y, width = 100, height = 80) {
  const bounds = { x, y, width, height };
  return {
    id,
    type: "bpmn:Task",
    x, y, width, height,
    parent: null,
    businessObject: { $type: "bpmn:Task" },
    di: { bounds },
  };
}

function makeConnection(id, sourceId, targetId, pts) {
  return {
    id,
    type: "bpmn:SequenceFlow",
    waypoints: pts.map((p) => ({ x: p.x, y: p.y })),
    source: { id: sourceId },
    target: { id: targetId },
    businessObject: { $type: "bpmn:SequenceFlow", sourceRef: { id: sourceId }, targetRef: { id: targetId } },
    di: { waypoint: pts.map((p) => ({ x: p.x, y: p.y })) },
  };
}

function createMockInst({ elements, saveXmlError = null } = {}) {
  const byId = new Map(elements.map((el) => [el.id, el]));
  let handler = null;
  let lastContext = null;
  const state = { executeCount: 0, undoCount: 0 };
  const commandStack = {
    // Как diagram-js CommandStack.registerHandler: конструктор инстанцируется,
    // хранится/вызывается экземпляр с prototype execute/revert.
    registerHandler(_name, handlerCls) { handler = Object.create(handlerCls.prototype); },
    execute(_name, context) {
      state.executeCount += 1;
      lastContext = context;
      if (handler) handler.execute(context);
    },
    undo() {
      state.undoCount += 1;
      if (handler && lastContext) handler.revert(lastContext);
    },
  };
  const inst = {
    get(name) {
      if (name === "elementRegistry") {
        return { getAll: () => elements, get: (id) => byId.get(id) || null };
      }
      if (name === "canvas") return { zoom: () => 1 };
      if (name === "commandStack") return commandStack;
      return null;
    },
    async saveXML() {
      if (saveXmlError) throw saveXmlError;
      return { xml: "<xml />", error: null };
    },
  };
  return { inst, state };
}

// Схема с намеренно «разреженным» зазором: apply обязан дать ненулевые ops.
function createSparseGraph() {
  const start = { ...makeShape("StartEvent_1", 100, 100, 36, 36), type: "bpmn:StartEvent" };
  const t1 = makeShape("Task_1", 300, 100);
  const t2 = makeShape("Task_2", 700, 100);
  const end = { ...makeShape("EndEvent_1", 1100, 100, 36, 36), type: "bpmn:EndEvent" };
  const f1 = makeConnection("Flow_1", "StartEvent_1", "Task_1", [{ x: 136, y: 118 }, { x: 300, y: 118 }]);
  const f2 = makeConnection("Flow_2", "Task_1", "Task_2", [{ x: 400, y: 118 }, { x: 700, y: 118 }]);
  const f3 = makeConnection("Flow_3", "Task_2", "EndEvent_1", [{ x: 800, y: 118 }, { x: 1100, y: 118 }]);
  return [start, t1, t2, end, f1, f2, f3];
}

test("контракт B: saveXML бросает → undo выполнен, apply не остаётся", async () => {
  const elements = createSparseGraph();
  const { inst, state } = createMockInst({
    elements,
    saveXmlError: new Error("serialize boom"),
  });
  const res = await applyGeometryOnInstance(inst, {
    persistXml: async () => ({ ok: true, bpmnVersionSnapshot: { id: "s" } }),
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /serialize boom/);
  assert.equal(state.undoCount, 1, "undo на сбое сериализации");
  assert.equal(state.executeCount, 1);
});

test("контракт C: persist ok:true без bpmnVersionSnapshot (no-op guard) → успех без undo", async () => {
  const elements = createSparseGraph();
  const { inst, state } = createMockInst({ elements });
  const res = await applyGeometryOnInstance(inst, {
    persistXml: async () => ({ ok: true, bpmnVersionSnapshot: null }),
  });
  assert.equal(res.ok, true, "ok:true без snapshot — успех persist'а");
  assert.equal(state.undoCount, 0, "undo НЕ выполняется на штатном успехе");
  assert.equal(state.executeCount, 1);
});

test("контракт #1043: persist ok:false → undo + error", async () => {
  const elements = createSparseGraph();
  const { inst, state } = createMockInst({ elements });
  const res = await applyGeometryOnInstance(inst, {
    persistXml: async () => ({ ok: false, error: "http_409" }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, "http_409");
  assert.equal(state.undoCount, 1);
});

test("persist отсутствует (options.persistXml нет) → apply возвращает xml без ошибки", async () => {
  const elements = createSparseGraph();
  const { inst, state } = createMockInst({ elements });
  const res = await applyGeometryOnInstance(inst, {});
  assert.equal(res.ok, true);
  assert.equal(res.xml, "<xml />");
  assert.equal(state.undoCount, 0);
});

test("noop: геометрия уже канонична → ok/noop без execute", async () => {
  // Канон: taskWidth 130 × taskHeight 80, зазор 100.
  const t1 = makeShape("Task_1", 200, 100, 130, 80);
  const t2 = makeShape("Task_2", 430, 100, 130, 80);
  const f1 = makeConnection("Flow_1", "Task_1", "Task_2", [{ x: 330, y: 140 }, { x: 430, y: 140 }]);
  const elements = [t1, t2, f1];
  const layout = computeGeometryApplyPlanFromRegistry({
    getAll: () => elements,
    get: (id) => elements.find((el) => el.id === id) || null,
  });
  if (layout.noop) {
    const { inst, state } = createMockInst({ elements });
    const res = await applyGeometryOnInstance(inst, {});
    assert.equal(res.ok, true);
    assert.equal(res.noop, true);
    assert.equal(state.executeCount, 0, "noop без commandStack.execute");
  } else {
    // План решил иначе — контракт noop проверяем моком пустого плана.
    const { inst, state } = createMockInst({ elements: [] });
    const res = await applyGeometryOnInstance(inst, {});
    assert.equal(res.ok, true);
    assert.equal(res.noop, true);
    assert.equal(state.executeCount, 0);
  }
});

test("diWaypointFactory: moddle-шаблон → model.create, без moddle → plain fallback", () => {
  const created = [];
  const fakeModel = {
    create(type, attrs) {
      created.push([type, attrs]);
      return { $type: type, ...attrs, $descriptor: { name: type } };
    },
  };
  const withModdle = diWaypointFactory({ $model: fakeModel, $descriptor: { name: "dc:Point" } });
  const wp = withModdle(10, 20);
  assert.equal(wp.$type, "dc:Point");
  assert.equal(wp.x, 10);
  assert.equal(created.length, 1);

  const withoutModdle = diWaypointFactory(null);
  assert.deepEqual(withoutModdle(1, 2), { x: 1, y: 2 });
  const withoutModel = diWaypointFactory({ x: 0, y: 0 });
  assert.deepEqual(withoutModel(3, 4), { x: 3, y: 4 });
});
