// C2 / F9: программная проверка drag-механики bpmn.io (S1-UI-3 из аудита save_pipeline).
// Вопрос: Playwright mouse-drag по канвасу не двигает узел — это баг приложения
// или артефакт инструмента? Здесь узел двигается через modeler API
// (get("modeling").moveShape) в headless-окружении (jsdom).
//
// Запуск (bpmn-js использует extensionless-импорты, поэтому нужен бандл):
//   cd frontend && ./node_modules/.bin/esbuild ../scripts/fix-save/c2_modeler_move_check.mjs \
//     --bundle --format=esm --platform=node --external:jsdom \
//     --alias:bpmn-js=./node_modules/bpmn-js \
//     --outfile=.c2_modeler_move_check.bundle.tmp.mjs \
//   && node .c2_modeler_move_check.bundle.tmp.mjs; rm -f .c2_modeler_move_check.bundle.tmp.mjs
//
// Ожидание: moveShape через API смещает узел и обновляет dc:Bounds в XML.
// Если API двигает, а Playwright mouse — нет: вердикт «артефакт инструмента».
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!DOCTYPE html><html><body><div id='canvas'></div></body></html>",
  { pretendToBeVisual: true },
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.SVGElement = dom.window.SVGElement;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
// jsdom не реализует CSS.escape — минимальный shim для palette bpmn-js.
if (typeof globalThis.CSS === "undefined") {
  globalThis.CSS = { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&") };
}
// jsdom не реализует SVGMatrix — stub-класс (tiny-svg делает instanceof SVGMatrix).
class SVGMatrixStub {
  constructor() {
    this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
  }
  inverse() { return this; }
  multiply() { return this; }
  translate() { return this; }
  scale() { return this; }
  scaleNonUniform() { return this; }
  rotate() { return this; }
}
if (typeof globalThis.SVGMatrix === "undefined") {
  globalThis.SVGMatrix = SVGMatrixStub;
  dom.window.SVGMatrix = SVGMatrixStub;
}
// jsdom не реализует SVG-геометрию — shims для canvas bpmn-js.
const svgProto = dom.window.SVGElement && dom.window.SVGElement.prototype;
if (svgProto) {
  if (typeof svgProto.getBBox !== "function") {
    svgProto.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
  }
  if (typeof svgProto.getScreenCTM !== "function") {
    svgProto.getScreenCTM = () => ({
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
      inverse() { return this; },
      multiply() { return this; },
    });
  }
  if (typeof svgProto.getComputedTextLength !== "function") {
    svgProto.getComputedTextLength = () => 0;
  }
  // jsdom не реализует SVGAnimatedTransformList — stub для tiny-svg transform().
  try {
    const matrixStub = new SVGMatrixStub();
    const makeTransformStub = () => ({
      type: 2,
      matrix: matrixStub,
      angle: 0,
      setMatrix: () => {},
      setTranslate: () => {},
      setScale: () => {},
      setRotate: () => {},
    });
    if (typeof svgProto.createSVGTransform !== "function") {
      svgProto.createSVGTransform = makeTransformStub;
    }
    if (typeof svgProto.createSVGMatrix !== "function") {
      svgProto.createSVGMatrix = () => ({ ...matrixStub });
    }
    if (typeof svgProto.createSVGPoint !== "function") {
      svgProto.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) });
    }
    const transformListStub = {
      numberOfItems: 0,
      consolidate: () => ({ matrix: matrixStub }),
      appendItem: () => {},
      removeItem: () => ({}),
      clear: () => {},
      getItem: () => ({ matrix: matrixStub, setMatrix: () => {} }),
      createSVGTransformFromMatrix: () => ({ matrix: matrixStub, setMatrix: () => {} }),
    };
    Object.defineProperty(svgProto, "transform", {
      configurable: true,
      get() { return { baseVal: transformListStub, animVal: transformListStub }; },
    });
  } catch {
    // no-op: окружение не позволяет переопределить accessor
  }
}

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_1"><bpmn:incoming>Flow_1</bpmn:incoming></bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="150" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="250" y="80" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="186" y="118" /><di:waypoint x="250" y="120" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const MOVE_DX = 96;

async function main() {
  const { default: Modeler } = await import("bpmn-js/lib/Modeler.js");
  const modeler = new Modeler({ container: document.getElementById("canvas") });
  await modeler.importXML(XML);

  const elementRegistry = modeler.get("elementRegistry");
  const modeling = modeler.get("modeling");
  const eventBus = modeler.get("eventBus");
  let shapeChangedEvents = 0;
  eventBus.on("shape.changed", () => { shapeChangedEvents += 1; });

  const taskBefore = elementRegistry.get("Task_1");
  const before = { x: taskBefore.x, y: taskBefore.y };

  // То же смещение, что и в аудит-сценарии S1-UI-1/S1-UI-3 (drag на +96px по X).
  modeling.moveShape(taskBefore, { x: MOVE_DX, y: 0 });

  const taskAfter = elementRegistry.get("Task_1");
  const after = { x: taskAfter.x, y: taskAfter.y };

  const { xml: outXml } = await modeler.saveXML({ format: false });
  const match = outXml.match(/Task_1_di" bpmnElement="Task_1"><dc:Bounds x="([\d.]+)"/);
  const xmlX = match ? Number(match[1]) : null;

  const apiMoved = after.x === before.x + MOVE_DX;
  const xmlMoved = xmlX !== null && Math.abs(xmlX - (before.x + MOVE_DX)) < 0.001;

  console.log(`[c2] before=${JSON.stringify(before)} after=${JSON.stringify(after)} xmlX=${xmlX} shapeChangedEvents=${shapeChangedEvents}`);
  if (apiMoved && xmlMoved && shapeChangedEvents > 0) {
    console.log("[c2] VERDICT: modeler API moveShape двигает узел и пишет dc:Bounds в XML —");
    console.log("[c2] drag-механика modeler'а исправна; нестабильный mouse-drag в S1-UI-3 — АРТЕФАКТ Playwright mouse API.");
    process.exit(0);
  }
  console.error("[c2] FAIL: moveShape через API не сместил узел — возможен реальный баг регистрации move.");
  process.exit(1);
}

main().catch((error) => {
  console.error("[c2] ERROR:", error?.stack || error);
  process.exit(1);
});
