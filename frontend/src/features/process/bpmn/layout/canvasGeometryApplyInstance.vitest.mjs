// @vitest-environment happy-dom
// canvasGeometryApplyInstance.vitest.mjs — интеграция apply→persist→undo
// на REAL headless bpmn-js и REAL-фикстуре «Лагман» (lagmanV387.xml,
// stage bpmn_versions v387; источник — контур fix/canvas-geometry-real-golden-fixture).
//
// Почему vitest, а не node --test: bpmn-js/lib использует extensionless-импорты
// (node ESM их не резолвит), и нужен DOM (happy-dom). Запуск: npm run test:smoke.
//
// Классы дефектов контура fix/canvas-apply-persist-validation (RED.md):
//   A: reroute-ветка хендлера заменяла di.waypoint moddle-элементы plain-{x,y}
//      → saveXML падал («isGeneric») ДО persist; persist не выполнялся,
//      undo не выполнялся, схема оставалась применённой (симптом приёмки).
//   B: исключение saveXML улетало во внешний catch без undo.
//   C: ok:true без bpmnVersionSnapshot (серверный no-op guard, см.
//      backend/tests/test_bpmn_put_noop_guard_contract.py) трактовался как
//      сбой → ложный undo + error-тост.
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "vitest";
import Modeler from "bpmn-js/lib/Modeler.js";

import {
  applyGeometryOnInstance,
  computeGeometryApplyPlanFromRegistry,
} from "./canvasGeometryApplyInstance.js";

// happy-dom-полифилы для headless bpmn-js (CSS.escape отсутствует; SVG getBBox
// и SVGAnimatedTransformList.consolidate не реализованы).
if (typeof globalThis.CSS === "undefined") globalThis.CSS = {};
if (typeof globalThis.CSS.escape !== "function") {
  globalThis.CSS.escape = (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}
if (typeof SVGElement !== "undefined" && typeof SVGElement.prototype.getBBox !== "function") {
  SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
}
{
  const probe = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const tl = probe.transform?.baseVal;
  if (tl && typeof tl.consolidate !== "function") {
    Object.getPrototypeOf(tl).consolidate = () => ({ matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } });
  }
}

const FIXTURE_XML = readFileSync(
  path.resolve(process.cwd(), "src/features/process/bpmn/layout/__fixtures__/lagmanV387.xml"),
  "utf8",
);

async function createModelerWithLagman() {
  const container = document.createElement("div");
  container.style.width = "1600px";
  container.style.height = "900px";
  document.body.appendChild(container);
  const modeler = new Modeler({ container });
  await modeler.importXML(FIXTURE_XML);
  // headless: 0-size контейнер → NaN во viewbox при fit-viewport; поведение
  // zoom вне скоупа теста (в браузере контейнер имеет размер).
  modeler.get("canvas").zoom = () => 1;
  return modeler;
}

function snapshotGeometry(modeler) {
  const registry = modeler.get("elementRegistry");
  const snap = new Map();
  for (const el of registry.getAll()) {
    if (Array.isArray(el.waypoints) && el.waypoints.length > 0) {
      snap.set(el.id, el.waypoints.map((p) => ({ x: p.x, y: p.y })));
    } else if (Number.isFinite(Number(el.x)) && Number(el.width) > 0) {
      snap.set(el.id, {
        x: el.x, y: el.y, width: el.width, height: el.height,
        di: el.di?.bounds
          ? { x: el.di.bounds.x, y: el.di.bounds.y, width: el.di.bounds.width, height: el.di.bounds.height }
          : null,
      });
    }
  }
  return snap;
}

function diffGeometry(before, after) {
  const changed = [];
  for (const [id, b] of before) {
    const a = after.get(id);
    if (!a) continue;
    if (Array.isArray(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(id);
    } else if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height
      || (a.di && b.di && JSON.stringify(a.di) !== JSON.stringify(b.di))) {
      changed.push(id);
    }
  }
  return changed;
}

function assertFiniteCoordinates(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  expect(doc.getElementsByTagName("parsererror").length, "XML парсится").toBe(0);
  let checked = 0;
  for (const tag of ["dc:Bounds", "di:waypoint"]) {
    for (const node of Array.from(doc.getElementsByTagName(tag))) {
      for (const attr of ["x", "y", "width", "height"]) {
        if (!node.hasAttribute(attr)) continue;
        expect(Number.isFinite(Number(node.getAttribute(attr)))).toBe(true);
        checked += 1;
      }
    }
  }
  expect(checked, "проверено координат").toBeGreaterThan(100);
}

test("Лагман: apply-план на реальном registry — не noop, reroute есть", async () => {
  const modeler = await createModelerWithLagman();
  try {
    const layout = computeGeometryApplyPlanFromRegistry(modeler.get("elementRegistry"));
    expect(layout.noop).toBeFalsy();
    expect(layout.stats.nodesShifted).toBeGreaterThan(0);
    expect(layout.stats.connectionsRerouted).toBeGreaterThan(0);
    expect(layout.stats.connectionsChannelConflicts).toBe(0);
  } finally {
    modeler.destroy();
  }
});

test("FIX A: production apply → saveXML валиден, координаты финитны (reroute DI моддл-безопасен)", async () => {
  const modeler = await createModelerWithLagman();
  try {
    const res = await applyGeometryOnInstance(modeler, {});
    expect(res.ok).toBe(true);
    assertFiniteCoordinates(res.xml);
    expect(res.xml).toContain("<di:waypoint");
    expect(res.xml.length).toBeGreaterThan(100000);
  } finally {
    modeler.destroy();
  }
});

test("undo-факт: undo откатывает геометрию apply к исходному XML побайтово", async () => {
  const modeler = await createModelerWithLagman();
  try {
    const before = snapshotGeometry(modeler);
    const res = await applyGeometryOnInstance(modeler, {});
    expect(res.ok).toBe(true);
    expect(diffGeometry(before, snapshotGeometry(modeler)).length).toBeGreaterThan(0);
    modeler.get("commandStack").undo();
    expect(diffGeometry(before, snapshotGeometry(modeler)), "после undo геометрия идентична исходной").toEqual([]);
    const saved = await modeler.saveXML({ format: true });
    expect(saved.xml.replace(/\s+/g, " ")).toBe(FIXTURE_XML.replace(/\s+/g, " "));
  } finally {
    modeler.destroy();
  }
});

test("FIX C: persist ok:true без bpmnVersionSnapshot (no-op guard сервера) → успех, без undo", async () => {
  const modeler = await createModelerWithLagman();
  try {
    const before = snapshotGeometry(modeler);
    const res = await applyGeometryOnInstance(modeler, {
      persistXml: async () => ({ ok: true, bpmnVersionSnapshot: null }),
    });
    expect(res.ok).toBe(true);
    expect(diffGeometry(before, snapshotGeometry(modeler)).length).toBeGreaterThan(0);
  } finally {
    modeler.destroy();
  }
});

test("контракт #1043: persist ok:false → undo откатывает apply", async () => {
  const modeler = await createModelerWithLagman();
  try {
    const before = snapshotGeometry(modeler);
    const res = await applyGeometryOnInstance(modeler, {
      persistXml: async () => ({ ok: false, error: "http_409" }),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("http_409");
    expect(diffGeometry(before, snapshotGeometry(modeler))).toEqual([]);
  } finally {
    modeler.destroy();
  }
});

test("FIX B: saveXML бросает → undo + error, apply не остаётся применённым", async () => {
  const modeler = await createModelerWithLagman();
  try {
    const before = snapshotGeometry(modeler);
    modeler.saveXML = async () => { throw new Error("forced savexml failure"); };
    const res = await applyGeometryOnInstance(modeler, {
      persistXml: async () => ({ ok: true, bpmnVersionSnapshot: { id: "s" } }),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("forced savexml failure");
    expect(diffGeometry(before, snapshotGeometry(modeler))).toEqual([]);
  } finally {
    modeler.destroy();
  }
});
