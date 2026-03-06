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
    hybridModeEffective: "view",
    hybridUiPrefs: { lock: false },
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
});
