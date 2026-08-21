import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultRuntimeStylePreset,
  getRuntimeStylePresetById,
  getRuntimeStylePresets,
  matchRuntimeStylePreset,
  resolveRuntimeStyleSurface,
} from "./drawioRuntimeStylePresets.js";

test("drawio runtime style presets resolve surface from tool id", () => {
  assert.equal(resolveRuntimeStyleSurface("rect"), "shape");
  assert.equal(resolveRuntimeStyleSurface("container"), "container");
  assert.equal(resolveRuntimeStyleSurface("text"), "text");
  assert.equal(resolveRuntimeStyleSurface("note"), "note");
});

test("drawio runtime style presets resolve surface from element snapshot", () => {
  assert.equal(resolveRuntimeStyleSurface({ tagName: "rect" }), "shape");
  assert.equal(resolveRuntimeStyleSurface({ tagName: "text" }), "text");
});

test("drawio runtime style presets return default presets for each surface", () => {
  assert.equal(getDefaultRuntimeStylePreset("shape")?.id, "accent");
  assert.equal(getDefaultRuntimeStylePreset("container")?.id, "neutral");
  assert.equal(getDefaultRuntimeStylePreset("text")?.id, "default");
  assert.equal(getDefaultRuntimeStylePreset("note")?.id, "default");
});

test("drawio runtime style presets include container and note palettes", () => {
  assert.ok(getRuntimeStylePresets("container").length >= 2);
  assert.ok(getRuntimeStylePresets("note").length >= 3);
});

test("drawio runtime style presets find preset by id", () => {
  assert.equal(getRuntimeStylePresetById("shape", "success")?.label, "Зелёный");
  assert.equal(getRuntimeStylePresetById("container", "neutral")?.id, "neutral");
});

test("drawio runtime style presets match preset by svg attrs for container", () => {
  const preset = getRuntimeStylePresets("container")[0];
  const matched = matchRuntimeStylePreset("container", preset.svg);
  assert.equal(matched?.id, preset.id);
});

test("drawio runtime style presets note presets have required color keys", () => {
  const preset = getDefaultRuntimeStylePreset("note");
  assert.ok(preset.svg.bg_color);
  assert.ok(preset.svg.border_color);
  assert.ok(preset.svg.text_color);
});
