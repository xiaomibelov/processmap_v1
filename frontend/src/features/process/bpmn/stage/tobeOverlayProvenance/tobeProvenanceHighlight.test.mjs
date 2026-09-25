// tobeProvenanceHighlight — чистые функции обратной подсветки (T10):
// eventToDiagramPoint (client-координаты → точка диаграммы) и badgeKeyForCount
// (RU-плюрализация бейджа N→1). Node --test, без DOM: canvas — фейк-объект.
import test from "node:test";
import assert from "node:assert/strict";

import {
  badgeCountForHit,
  badgeKeyForCount,
  eventToDiagramPoint,
} from "./tobeProvenanceHighlight.js";

test("eventToDiagramPoint: viewbox-математика (canvas без eventToCoordinates)", () => {
  const canvas = {
    viewbox: () => ({ x: 100, y: 50, width: 500, height: 400, scale: 2 }),
    getContainer: () => ({ getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 }) }),
  };
  const point = eventToDiagramPoint({ clientX: 30, clientY: 40 }, canvas);
  assert.deepEqual(point, { x: 110, y: 60 }); // 100+(30-10)/2, 50+(40-20)/2
});

test("eventToDiagramPoint: делегирует в eventToCoordinates, если метод есть", () => {
  const canvas = {
    eventToCoordinates: (event) => ({ x: event.clientX * 10, y: event.clientY * 10 }),
    viewbox: () => ({ x: 0, y: 0, scale: 1 }),
    getContainer: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
  };
  assert.deepEqual(eventToDiagramPoint({ clientX: 3, clientY: 4 }, canvas), { x: 30, y: 40 });
});

test("eventToDiagramPoint: бросок eventToCoordinates → fallback на viewbox-математику", () => {
  const canvas = {
    eventToCoordinates: () => {
      throw new Error("broken");
    },
    viewbox: () => ({ x: 0, y: 0, scale: 1 }),
    getContainer: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
  };
  assert.deepEqual(eventToDiagramPoint({ clientX: 7, clientY: 8 }, canvas), { x: 7, y: 8 });
});

test("badgeKeyForCount: RU-грамматика (1/2..4/много, 12..14 исключение)", () => {
  const cases = [
    [1, "badgeOne"],
    [2, "badgeFew"],
    [3, "badgeFew"],
    [4, "badgeFew"],
    [5, "badgeMany"],
    [11, "badgeMany"],
    [12, "badgeMany"],
    [14, "badgeMany"],
    [21, "badgeMany"],
    [22, "badgeFew"],
    [25, "badgeMany"],
    [101, "badgeMany"],
  ];
  for (const [n, expected] of cases) {
    assert.equal(badgeKeyForCount(n), expected, `n=${n}`);
  }
  // Никакого «1 тасок»: единственное число — только badgeOne.
  assert.notEqual(badgeKeyForCount(1), "badgeFew");
  assert.notEqual(badgeKeyForCount(1), "badgeMany");
});

// T12 (ruling контролёра): бейдж сообщает кардинальность ОПЕРАЦИИ, а не
// длину reverse-списка. 1 op → N = |forward.get(op).asIsIds|; >1 ops →
// N = |reverse-список| (кавета сохраняется); 0 ops → null (бейджа нет).
test("badgeCountForHit: ровно 1 op → кардинальность операции из forward", () => {
  const forward = new Map([
    ["op_consolidated", { asIsIds: ["a1", "a2", "a3"] }],
  ]);
  // consolidated N→1: reverse-список длины 1, но операция объединяет 3 AS IS.
  assert.equal(badgeCountForHit([{ toBeId: "op_consolidated" }], forward), 3);
  // simple 1→1: обе ветки согласованы.
  const forwardSimple = new Map([["op_simple", { asIsIds: ["a4"] }]]);
  assert.equal(badgeCountForHit([{ toBeId: "op_simple" }], forwardSimple), 1);
});

test("badgeCountForHit: >1 ops → длина reverse-списка (кавета сохраняется)", () => {
  const forward = new Map([
    ["op_x", { asIsIds: ["a1"] }],
    ["op_y", { asIsIds: ["a2"] }],
  ]);
  const list = [{ toBeId: "op_x" }, { toBeId: "op_y" }, { toBeId: "op_x" }];
  // Дубликаты op_x в списке НЕ сводятся к 1 op — кавета: N = list.length.
  assert.equal(badgeCountForHit(list, forward), 3);
  assert.equal(badgeCountForHit([{ toBeId: "op_x" }, { toBeId: "op_y" }], forward), 2);
});

test("badgeCountForHit: unique по toBeId (1 op из нескольких записей N→1)", () => {
  const forward = new Map([
    ["op_consolidated", { asIsIds: ["a1", "a2", "a3"] }],
  ]);
  // Одна и та же операция от 3 предков: 3 reverse-записи, но op ровно 1.
  assert.equal(
    badgeCountForHit(
      [{ toBeId: "op_consolidated" }, { toBeId: "op_consolidated" }, { toBeId: "op_consolidated" }],
      forward,
    ),
    3,
  );
});

test("badgeCountForHit: 0 ops / пустой вход → null (бейдж не ставится)", () => {
  const forward = new Map([["op_x", { asIsIds: ["a1"] }]]);
  assert.equal(badgeCountForHit(null, forward), null);
  assert.equal(badgeCountForHit(undefined, forward), null);
  assert.equal(badgeCountForHit([], forward), null);
  // Записи без toBeId не образуют op.
  assert.equal(badgeCountForHit([{ fate: "transformed_to" }], forward), null);
});

test("badgeCountForHit: 1 op без forward-записи → fallback на длину списка", () => {
  // Защитная ветка: forward не знает op (индекс устарел) — деградируем к
  // прежней семантике list.length, а не к броску/нулю.
  assert.equal(badgeCountForHit([{ toBeId: "op_missing" }], new Map()), 1);
  const forwardEmpty = new Map([["op_x", { asIsIds: [] }]]);
  assert.equal(badgeCountForHit([{ toBeId: "op_x" }, { toBeId: "op_x" }], forwardEmpty), 2);
});

test("source-guard: highlight-модуль read-only (0 мутаций модели)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "src/features/process/bpmn/stage/tobeOverlayProvenance/tobeProvenanceHighlight.js"),
    "utf8",
  );
  const code = src.split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
  assert.doesNotMatch(code, /commandStack/);
  assert.doesNotMatch(code, /modeling/);
  assert.doesNotMatch(code, /saveCoordinator/);
  assert.doesNotMatch(code, /apiGetBpmnXml|\/lib\/api/);
});
