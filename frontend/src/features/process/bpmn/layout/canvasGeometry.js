// canvasGeometry.js — настройки геометрии канваса (контур feature/canvas-geometry-settings).
//
// Шаг 1: только хранение и чтение. Модуль НЕ импортируется align-потоком
// (laneRowAlign.js / BpmnStage.jsx) — это сознательное ограничение шага 1,
// зафиксированное gate-тестом canvasGeometry.align-gate.test.mjs.
//
// Дефолты re-export'ятся из laneRowAlign.js — один источник правды для канона
// (таска 130×80, зазор 100). Если настройки не загрузились или битые —
// getter отдаёт дефолты, поведение продукта не меняется.

import { ALIGN_GAP, CANON_NODE_SIZES } from "./laneRowAlign.js";

export const CANON_GEOMETRY_DEFAULTS = Object.freeze({
  taskWidth: CANON_NODE_SIZES.task.width,
  taskHeight: CANON_NODE_SIZES.task.height,
  sequenceGap: ALIGN_GAP,
});

// Границы зеркалят бэкенд-валидацию (CANVAS_GEOMETRY_BOUNDS в routers/feature_flags.py).
export const CANVAS_GEOMETRY_BOUNDS = Object.freeze({
  taskWidth: Object.freeze({ min: 60, max: 400 }),
  taskHeight: Object.freeze({ min: 60, max: 400 }),
  sequenceGap: Object.freeze({ min: 20, max: 500 }),
});

function coerceInt(value) {
  if (typeof value === "boolean" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function pickWithinBounds(value, bounds, fallback) {
  if (value === null) return fallback;
  if (value < bounds.min || value > bounds.max) return fallback;
  return value;
}

// Чистая функция: typed settings из GET /api/settings/canvas-geometry →
// канонический вид; любая битость поля → дефолт этого поля.
export function parseCanvasGeometry(settings) {
  const src = settings && typeof settings === "object" ? settings : {};
  return {
    taskWidth: pickWithinBounds(
      coerceInt(src.task_width),
      CANVAS_GEOMETRY_BOUNDS.taskWidth,
      CANON_GEOMETRY_DEFAULTS.taskWidth
    ),
    taskHeight: pickWithinBounds(
      coerceInt(src.task_height),
      CANVAS_GEOMETRY_BOUNDS.taskHeight,
      CANON_GEOMETRY_DEFAULTS.taskHeight
    ),
    sequenceGap: pickWithinBounds(
      coerceInt(src.sequence_gap),
      CANVAS_GEOMETRY_BOUNDS.sequenceGap,
      CANON_GEOMETRY_DEFAULTS.sequenceGap
    ),
  };
}

let currentGeometry = { ...CANON_GEOMETRY_DEFAULTS };

// Вызывается из FeatureFlagsProvider после загрузки настроек (и при ре-инициализации).
export function initCanvasGeometry(settings) {
  currentGeometry = parseCanvasGeometry(settings);
  return currentGeometry;
}

// Getter для шага 2 (применение к схеме): до инициализации отдаёт дефолты.
export function getCanvasGeometry() {
  return { ...currentGeometry };
}
