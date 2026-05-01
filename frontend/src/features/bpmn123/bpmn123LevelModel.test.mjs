import assert from "node:assert/strict";
import test from "node:test";

import {
  BPMN123_LEVEL_1_ID,
  BPMN123_LEVELS_BY_ID,
  getBpmn123Level,
} from "./bpmn123LevelModel.js";

test("default BPMN 123 Level 1 exists", () => {
  const level = BPMN123_LEVELS_BY_ID[BPMN123_LEVEL_1_ID];

  assert.ok(level);
  assert.equal(level.title, "BPMN 1 — Первый процесс");
  assert.equal(level.id, BPMN123_LEVEL_1_ID);
});

test("Level 1 exposes static objectives for the shell", () => {
  const level = getBpmn123Level(BPMN123_LEVEL_1_ID);

  assert.ok(Array.isArray(level.objectives));
  assert.equal(level.objectives.length, 6);
  assert.ok(level.objectives.some((item) => item.includes("Start Event")));
  assert.ok(level.objectives.some((item) => item.includes("Подготовить ответ")));
});

test("unknown level ids fall back to Level 1", () => {
  const level = getBpmn123Level("unknown-level");

  assert.equal(level.id, BPMN123_LEVEL_1_ID);
});
