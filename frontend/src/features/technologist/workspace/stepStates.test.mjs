// UXF/B3: визуальные состояния step-bar'а (W4-инвариант сессионности).
import { test } from "vitest";
import assert from "node:assert/strict";
import { decorateSteps } from "./stepStates.js";

test("B3: новая сессия (все todo) — первый current, остальные pending", () => {
  const steps = ["a", "b", "c"].map((id) => ({ id, state: "todo" }));
  const out = decorateSteps(steps);
  assert.deepEqual(out.map((s) => s.visual), ["current", "pending", "pending"]);
});

test("B3: пройденные — done, текущий — первый todo после них", () => {
  const steps = [
    { id: "import", state: "done" },
    { id: "transform", state: "done" },
    { id: "constructor", state: "todo" },
    { id: "recipe", state: "todo" },
  ];
  const out = decorateSteps(steps);
  assert.deepEqual(out.map((s) => s.visual), ["done", "done", "current", "pending"]);
});

test("B3: na («не требуется», чистый лист) — отдельное состояние, не current", () => {
  const steps = [
    { id: "import", state: "na" },
    { id: "transform", state: "na" },
    { id: "constructor", state: "todo" },
  ];
  const out = decorateSteps(steps);
  assert.deepEqual(out.map((s) => s.visual), ["na", "na", "current"]);
});

test("B3: всё done — current отсутствует", () => {
  const steps = [{ id: "a", state: "done" }, { id: "b", state: "done" }];
  const out = decorateSteps(steps);
  assert.deepEqual(out.map((s) => s.visual), ["done", "done"]);
});

test("B3: пустой/битый ввод не падает", () => {
  assert.deepEqual(decorateSteps(null), []);
  assert.deepEqual(decorateSteps([]), []);
});
