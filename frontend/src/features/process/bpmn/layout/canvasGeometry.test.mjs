import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  CANON_GEOMETRY_DEFAULTS,
  CANVAS_GEOMETRY_BOUNDS,
  getCanvasGeometry,
  initCanvasGeometry,
  parseCanvasGeometry,
} from "./canvasGeometry.js";
import { ALIGN_GAP, CANON_NODE_SIZES } from "./laneRowAlign.js";

// Smoke: дефолты — единый источник правды (re-export из laneRowAlign, без
// дублирования чисел); битые/пустые настройки → дефолты; getter отдаёт снапшот.

const here = dirname(fileURLToPath(import.meta.url));

test("дефолты re-export'ятся из laneRowAlign (один источник правды)", () => {
  assert.equal(CANON_GEOMETRY_DEFAULTS.taskWidth, CANON_NODE_SIZES.task.width);
  assert.equal(CANON_GEOMETRY_DEFAULTS.taskHeight, CANON_NODE_SIZES.task.height);
  assert.equal(CANON_GEOMETRY_DEFAULTS.sequenceGap, ALIGN_GAP);
  assert.equal(CANON_GEOMETRY_DEFAULTS.taskWidth, 130);
  assert.equal(CANON_GEOMETRY_DEFAULTS.taskHeight, 80);
  assert.equal(CANON_GEOMETRY_DEFAULTS.sequenceGap, 100);
});

test("parseCanvasGeometry: пустые/битые настройки → дефолты", () => {
  for (const bad of [null, undefined, {}, "x", 42]) {
    assert.deepEqual(parseCanvasGeometry(bad), { ...CANON_GEOMETRY_DEFAULTS }, `bad=${String(bad)}`);
  }
  assert.deepEqual(
    parseCanvasGeometry({ task_width: "abc", task_height: null, sequence_gap: {} }),
    { ...CANON_GEOMETRY_DEFAULTS }
  );
});

test("parseCanvasGeometry: вне границ → дефолт соответствующего поля", () => {
  const parsed = parseCanvasGeometry({ task_width: 59, task_height: 10000, sequence_gap: 0 });
  assert.equal(parsed.taskWidth, CANON_GEOMETRY_DEFAULTS.taskWidth);
  assert.equal(parsed.taskHeight, CANON_GEOMETRY_DEFAULTS.taskHeight);
  assert.equal(parsed.sequenceGap, CANON_GEOMETRY_DEFAULTS.sequenceGap);
  assert.deepEqual(parseCanvasGeometry({ task_width: 60, task_height: 400, sequence_gap: 500 }), {
    taskWidth: 60,
    taskHeight: 400,
    sequenceGap: 500,
  });
});

test("parseCanvasGeometry: валидные значения парсятся, bool/flot отклоняются", () => {
  assert.deepEqual(parseCanvasGeometry({ task_width: 200, task_height: 120, sequence_gap: 250 }), {
    taskWidth: 200,
    taskHeight: 120,
    sequenceGap: 250,
  });
  assert.equal(parseCanvasGeometry({ task_width: true }).taskWidth, CANON_GEOMETRY_DEFAULTS.taskWidth);
  assert.equal(parseCanvasGeometry({ task_width: 130.5 }).taskWidth, CANON_GEOMETRY_DEFAULTS.taskWidth);
});

test("init/getCanvasGeometry: getter отдаёт снапшот, дефолты до инициализации", () => {
  initCanvasGeometry(null);
  assert.deepEqual(getCanvasGeometry(), { ...CANON_GEOMETRY_DEFAULTS });
  initCanvasGeometry({ task_width: 210, task_height: 110, sequence_gap: 300 });
  const geo = getCanvasGeometry();
  assert.deepEqual(geo, { taskWidth: 210, taskHeight: 110, sequenceGap: 300 });
  geo.taskWidth = 999; // мутировать снапшот нельзя
  assert.equal(getCanvasGeometry().taskWidth, 210);
});

test("bounds зеркалят бэкенд (60–400 / 20–500)", () => {
  assert.deepEqual(CANVAS_GEOMETRY_BOUNDS.taskWidth, { min: 60, max: 400 });
  assert.deepEqual(CANVAS_GEOMETRY_BOUNDS.taskHeight, { min: 60, max: 400 });
  assert.deepEqual(CANVAS_GEOMETRY_BOUNDS.sequenceGap, { min: 20, max: 500 });
});

test("gate: laneRowAlign не импортирует canvasGeometry (зависимость односторонняя)", () => {
  // Шаг 2 снимает запрет шага 1 на чтение настроек из apply-потока, но
  // инвариант направления зависимостей сохраняем: laneRowAlign — нижний слой,
  // ничего не знает про настройки (канон — дефолтные аргументы).
  const files = [
    join(here, "laneRowAlign.js"),
    join(here, "laneRowAlign.test.mjs"),
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.ok(!src.includes("canvasGeometry"), `${file} не должен ссылаться на canvasGeometry`);
  }
});

test("gate: align-поток сам по себе на каноне — getCanvasGeometry только в apply", () => {
  const bpmnStage = readFileSync(
    join(here, "..", "..", "..", "..", "components", "process", "BpmnStage.jsx"), "utf8");
  const alignStart = bpmnStage.indexOf("function alignDiagramOnInstance");
  const alignEnd = bpmnStage.indexOf("function resetCanvasOnInstance");
  assert.ok(alignStart > 0 && alignEnd > alignStart, "регион alignDiagramOnInstance найден");
  const alignRegion = bpmnStage.slice(alignStart, alignEnd);
  assert.ok(!alignRegion.includes("getCanvasGeometry"), "align не читает настройки геометрии");
  // fix/canvas-apply-persist-validation: apply-поток (включая чтение
  // getCanvasGeometry) перенесён в canvasGeometryApplyInstance.js.
  const applyInstance = readFileSync(join(here, "canvasGeometryApplyInstance.js"), "utf8");
  assert.ok(applyInstance.includes("getCanvasGeometry"), "apply-поток читает настройки через getCanvasGeometry");
  assert.ok(applyInstance.includes("computeGeometryApplyPlan"), "apply-поток использует computeGeometryApplyPlan");
});
