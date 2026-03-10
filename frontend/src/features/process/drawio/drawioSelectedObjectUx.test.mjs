import test from "node:test";
import assert from "node:assert/strict";

import { resolveSelectedObjectUxModel } from "./drawioSelectedObjectUx.js";

test("selected object ux model resolves runtime text controls and advanced note", () => {
  const model = resolveSelectedObjectUxModel({
    selectedKind: "drawio",
    selectedEntityId: "text_1",
    selectedLayerId: "DL1",
    selectedDrawioTextEditable: true,
    selectedDrawioTextState: { width: 160, height: 48 },
    selectedDrawioStyleSurface: "text",
    selectedDrawioStylePresetCount: 3,
    selectedDrawioResizeSurface: "",
  });
  assert.equal(model.typeKey, "drawio_text");
  assert.equal(model.typeLabel, "Текстовый блок");
  assert.equal(model.showTextSection, true);
  assert.equal(model.showTextWidthSection, true);
  assert.equal(model.showResizeSection, false);
  assert.equal(model.showStyleSection, true);
  assert.deepEqual(model.capabilities.map((row) => row.label), [
    "Текст",
    "Ширина текста",
    "Быстрый цвет",
    "Скрыть",
    "Удалить",
  ]);
  assert.match(model.advancedHint, /full editor/i);
});

test("selected object ux model resolves shape controls without text controls", () => {
  const model = resolveSelectedObjectUxModel({
    selectedKind: "drawio",
    selectedEntityId: "rect_1",
    selectedLayerId: "DL1",
    selectedDrawioTextEditable: false,
    selectedDrawioTextState: null,
    selectedDrawioStyleSurface: "shape",
    selectedDrawioStylePresetCount: 4,
    selectedDrawioResizeSurface: "box",
  });
  assert.equal(model.typeKey, "drawio_box");
  assert.equal(model.typeLabel, "Блок / контейнер");
  assert.equal(model.showTextSection, false);
  assert.equal(model.showResizeSection, true);
  assert.equal(model.showStyleSection, true);
  assert.deepEqual(model.capabilities.map((row) => row.label), [
    "Быстрый стиль",
    "Размер блока",
    "Скрыть",
    "Удалить",
  ]);
});

test("selected object ux model degrades safely for unsupported drawio surfaces", () => {
  const model = resolveSelectedObjectUxModel({
    selectedKind: "drawio",
    selectedEntityId: "shape_weird",
    selectedDrawioTextEditable: false,
    selectedDrawioTextState: null,
    selectedDrawioStyleSurface: "",
    selectedDrawioStylePresetCount: 0,
    selectedDrawioResizeSurface: "",
  });
  assert.equal(model.typeKey, "drawio_other");
  assert.equal(model.showTextSection, false);
  assert.equal(model.showStyleSection, false);
  assert.equal(model.showResizeSection, false);
  assert.deepEqual(model.capabilities.map((row) => row.label), ["Скрыть", "Удалить"]);
});

test("selected object ux model stays empty-safe when nothing is selected", () => {
  const model = resolveSelectedObjectUxModel();
  assert.equal(model.hasSelection, false);
  assert.equal(model.typeKey, "none");
  assert.equal(model.typeLabel, "Ничего не выбрано");
  assert.deepEqual(model.capabilities, []);
});
