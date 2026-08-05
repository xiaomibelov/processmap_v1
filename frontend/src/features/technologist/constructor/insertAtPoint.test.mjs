// T3#1 — вставка блока кликом в точку канваса (modelUtils.buildOperationNode + wiring).
// Запуск: node --test src/features/technologist/constructor/insertAtPoint.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildOperationNode } from "./modelUtils.js";

const MODEL = {
  nodes: [
    { id: "Task_1", bpmn_type: "task", name: "Мойка", x: 100, y: 200 },
    { id: "Gateway_1", bpmn_type: "exclusiveGateway", name: "?", x: 500, y: 200 },
  ],
  flows: [],
  lanes: [],
};

const OP = { code: "heat", name: "Heating", name_ru: "Нагрев" };

test("buildOperationNode: id по nextId (Task), поля из операции каталога", () => {
  const node = buildOperationNode(MODEL, OP, { x: 320, y: 240 });
  assert.equal(node.id, "Task_2");
  assert.equal(node.bpmn_type, "task");
  assert.equal(node.operation_code, "heat");
  assert.equal(node.display_name, "Нагрев"); // язык UI (name_ru)
  assert.equal(node.x, 320);
  assert.equal(node.y, 240);
  assert.equal(node.width, 140);
  assert.equal(node.height, 70);
  assert.deepEqual(node.params, {});
});

test("buildOperationNode: фолбэки имени (name → code), кривая позиция → 0", () => {
  const node = buildOperationNode(MODEL, { code: "move", name: "Move" }, null);
  assert.equal(node.display_name, "Move");
  assert.equal(node.x, 0);
  assert.equal(node.y, 0);
  const node2 = buildOperationNode(MODEL, { code: "dose" }, { x: "abc" });
  assert.equal(node2.display_name, "dose");
  assert.equal(node2.x, 0);
});

test("buildOperationNode: модель не мутируется (чистая функция)", () => {
  const before = JSON.stringify(MODEL);
  buildOperationNode(MODEL, OP, { x: 1, y: 2 });
  assert.equal(JSON.stringify(MODEL), before);
});

test("GraphCanvas: onCanvasClick только по фону (guard event.target/suppressClick), маркер точки", () => {
  const src = readFileSync(new URL("../graph/GraphCanvas.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("onCanvasClick"), "пропс onCanvasClick объявлен");
  assert.ok(src.includes("insertPoint"), "маркер точки вставки рендерится");
  assert.ok(src.includes("event.target !== svgRef.current"), "клики по узлам/потокам не дают точку");
  assert.ok(src.includes("if (suppressClickRef.current) return;"), "drag не даёт ложный клик");
});

test("Constructor: insertPoint-state, клик → точка, handleAddOperation через buildOperationNode и расходует точку", () => {
  const src = readFileSync(new URL("./Constructor.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("const [insertPoint, setInsertPoint] = useState(null);"));
  assert.ok(src.includes("onCanvasClick={(x, y) => setInsertPoint({ x, y })}"));
  assert.ok(src.includes("insertPoint || nextNodePosition(uiModel)"), "фолбэк — прежняя позиция «в хвост справа»");
  assert.ok(src.includes("buildOperationNode(uiModel, op, pos)"));
  assert.ok(src.includes("setInsertPoint(null);"), "точка расходуется после вставки");
});

test("Workspace: те же гарантии на канвасе TO BE", () => {
  const src = readFileSync(new URL("../workspace/Workspace.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("const [insertPoint, setInsertPoint] = useState(null);"));
  assert.ok(src.includes("onCanvasClick={(x, y) => setInsertPoint({ x, y })}"));
  assert.ok(src.includes("insertPoint || {"), "фолбэк — прежняя ступенчатая раскладка");
  assert.ok(src.includes("buildOperationNode(uiModel, op, pos)"));
  assert.ok(src.includes("setInsertPoint(null);"));
});
