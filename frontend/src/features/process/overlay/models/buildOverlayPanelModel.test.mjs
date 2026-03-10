import test from "node:test";
import assert from "node:assert/strict";
import buildOverlayPanelModel from "./buildOverlayPanelModel.js";

test("buildOverlayPanelModel: drawio ON without preview is degraded preview_missing state", () => {
  const model = buildOverlayPanelModel({
    drawioState: {
      enabled: true,
      opacity: 0.6,
      doc_xml: "<mxfile></mxfile>",
      svg_cache: "",
      drawio_elements_v1: [{ id: "shape1", deleted: false }],
    },
    drawioEditorStatus: {
      editorAvailable: true,
      editorOpened: false,
      editorStatus: "saved",
      lastSavedAt: "2026-03-06T10:00:00.000Z",
      saved: true,
      previewAvailable: false,
      overlayEnabled: true,
      docAvailable: true,
    },
    hybridVisible: true,
    hybridTotalCount: 4,
    hybridModeEffective: "view",
    hybridUiPrefs: { lock: false, opacity: 60 },
    hybridV2HiddenCount: 2,
    hybridLayerRenderRows: [],
    hybridV2Renderable: { elements: [] },
    hybridV2BindingByHybridId: {},
    drawioSelectedElementId: "shape1",
    hybridV2ActiveId: "",
    hybridV2SelectedIds: [],
    legacyActiveElementId: "",
  });
  assert.equal(model.status.key, "on_preview_missing");
  assert.equal(model.status.drawioOpacity, 60);
  assert.equal(model.selected.entityKind, "drawio");
  assert.equal(model.selected.entityId, "shape1");
  assert.ok(Array.isArray(model.tools.runtime));
  assert.ok(model.tools.runtime.length >= 4);
  assert.equal(model.editor.status, "saved");
  assert.equal(model.layerGroups.drawio.length, 1);
  assert.equal(model.drawio.statusLabel, "ON · preview missing · hidden");
  assert.equal(model.drawio.visibleOnCanvas, false);
  assert.equal(model.drawio.opacityControlEnabled, false);
  assert.equal(model.status.visibleOnCanvas, false);
  assert.equal(model.status.opacityControlEnabled, false);
  assert.equal(model.hybridLegacy.visible, true);
  assert.equal(model.hybridLegacy.opacityPct, 60);
  assert.equal(model.hybridLegacy.totalCount, 4);
});

test("buildOverlayPanelModel: drawio placement-ready state is visible without persisted preview", () => {
  const model = buildOverlayPanelModel({
    drawioState: {
      enabled: true,
      interaction_mode: "edit",
      active_tool: "rect",
      opacity: 1,
      doc_xml: "",
      svg_cache: "",
      drawio_elements_v1: [],
    },
    drawioEditorStatus: {},
    hybridVisible: false,
    hybridTotalCount: 0,
    hybridModeEffective: "view",
    hybridUiPrefs: { lock: false, opacity: 60 },
    hybridV2HiddenCount: 0,
    hybridLayerRenderRows: [],
    hybridV2Renderable: { elements: [] },
    hybridV2BindingByHybridId: {},
    drawioSelectedElementId: "",
    hybridV2ActiveId: "",
    hybridV2SelectedIds: [],
    legacyActiveElementId: "",
  });
  assert.equal(model.status.key, "on_placement_ready");
  assert.equal(model.drawio.statusLabel, "ON · placement ready");
  assert.equal(model.drawio.visibleOnCanvas, true);
  assert.equal(model.drawio.opacityControlEnabled, true);
  assert.equal(model.status.previewStatus, "placement_ready");
});

test("buildOverlayPanelModel: drawio mode is owned by drawio state, not hybrid mode", () => {
  const model = buildOverlayPanelModel({
    drawioState: {
      enabled: true,
      interaction_mode: "edit",
      opacity: 1,
      doc_xml: "<mxfile></mxfile>",
      svg_cache: "<svg><rect id='shape1'/></svg>",
      drawio_elements_v1: [{ id: "shape1", deleted: false }],
    },
    drawioEditorStatus: {},
    hybridVisible: true,
    hybridTotalCount: 0,
    hybridModeEffective: "view",
    hybridUiPrefs: { lock: false, opacity: 80 },
    hybridV2HiddenCount: 0,
    hybridLayerRenderRows: [],
    hybridV2Renderable: { elements: [] },
    hybridV2BindingByHybridId: {},
    drawioSelectedElementId: "",
    hybridV2ActiveId: "",
    hybridV2SelectedIds: [],
    legacyActiveElementId: "",
  });
  assert.equal(model.drawio.mode, "edit");
  assert.equal(model.drawio.visibleOnCanvas, true);
  assert.equal(model.drawio.opacityControlEnabled, true);
  assert.equal(model.hybridLegacy.mode, "view");
});

test("buildOverlayPanelModel: hybrid focus reports actual dimming effect, not stored pref", () => {
  const hiddenModel = buildOverlayPanelModel({
    drawioState: {},
    drawioEditorStatus: {},
    hybridVisible: false,
    hybridTotalCount: 0,
    hybridModeEffective: "view",
    hybridUiPrefs: { lock: false, opacity: 60, focus: true },
    hybridV2HiddenCount: 0,
    hybridLayerRenderRows: [],
    hybridV2Renderable: { elements: [] },
    hybridV2BindingByHybridId: {},
    drawioSelectedElementId: "",
    hybridV2ActiveId: "",
    hybridV2SelectedIds: [],
    legacyActiveElementId: "",
  });
  assert.equal(hiddenModel.hybridLegacy.visible, false);
  assert.equal(hiddenModel.hybridLegacy.focusPref, true);
  assert.equal(hiddenModel.hybridLegacy.focusActive, false);
  assert.equal(hiddenModel.hybridLegacy.focus, false);

  const visibleModel = buildOverlayPanelModel({
    drawioState: {},
    drawioEditorStatus: {},
    hybridVisible: true,
    hybridTotalCount: 0,
    hybridModeEffective: "view",
    hybridUiPrefs: { lock: false, opacity: 60, focus: true },
    hybridV2HiddenCount: 0,
    hybridLayerRenderRows: [],
    hybridV2Renderable: { elements: [] },
    hybridV2BindingByHybridId: {},
    drawioSelectedElementId: "",
    hybridV2ActiveId: "",
    hybridV2SelectedIds: [],
    legacyActiveElementId: "",
  });
  assert.equal(visibleModel.hybridLegacy.visible, true);
  assert.equal(visibleModel.hybridLegacy.focusActive, true);
  assert.equal(visibleModel.hybridLegacy.focus, true);
});
