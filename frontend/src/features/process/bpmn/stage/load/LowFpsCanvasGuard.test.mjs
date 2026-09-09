import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createLowFpsGuardState,
  reduceLowFpsGuardState,
} from "./lowFpsGuardModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("low FPS guard uses sustained thresholds and recovery hysteresis", () => {
  let state = createLowFpsGuardState();

  state = reduceLowFpsGuardState(state, 0, { sampleReady: false });
  assert.equal(state.active, false, "the initial incomplete sample must not show the guard");

  state = reduceLowFpsGuardState(state, 9);
  assert.equal(state.active, false);
  state = reduceLowFpsGuardState(state, 8);
  assert.equal(state.active, true, "two consecutive samples below 10 FPS show the guard");

  state = reduceLowFpsGuardState(state, 12);
  assert.equal(state.active, true, "FPS between enter and exit thresholds must not flicker");
  state = reduceLowFpsGuardState(state, 15);
  assert.equal(state.active, true);
  state = reduceLowFpsGuardState(state, 18);
  assert.equal(state.active, false, "two samples at or above 15 FPS hide the guard");
});

test("canvas guard reuses FlowArcSpinner and blocks pointer input while active", () => {
  const source = fs.readFileSync(path.join(__dirname, "LowFpsCanvasGuard.jsx"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "LowFpsCanvasGuard.css"), "utf8");

  assert.equal(source.includes('import FlowArcSpinner from "./FlowArcSpinner"'), true);
  assert.equal(source.includes('data-testid="low-fps-canvas-guard"'), true);
  assert.equal(css.includes("pointer-events: auto"), true);
  assert.equal(css.includes("backdrop-filter"), false, "the recovery overlay must remain paint-cheap");

  const stageSource = fs.readFileSync(
    path.resolve(__dirname, "../../../../../components/process/BpmnStage.jsx"),
    "utf8",
  );
  assert.equal(stageSource.includes("<LowFpsCanvasGuard enabled={diagramReady && view !== \"xml\"} />"), true);
});
