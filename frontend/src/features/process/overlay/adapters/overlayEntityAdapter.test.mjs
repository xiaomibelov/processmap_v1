import test from "node:test";
import assert from "node:assert/strict";
import { OVERLAY_ENTITY_KINDS } from "../../drawio/domain/drawioEntityKinds.js";
import { buildOverlayEntityRows, buildOverlaySelectedEntity } from "./overlayEntityAdapter.js";

test("overlayEntityAdapter: legacy rows keep explicit legacy kind", () => {
  const rows = buildOverlayEntityRows({
    hybridLayerRenderRows: [
      { elementId: "Lane_03dntrc", title: "Lane_03dntrc", hasCenter: true },
      { elementId: "Collaboration_06ftemy", title: "Collab", hasCenter: false },
    ],
    hybridV2Renderable: { elements: [{ id: "h1", text: "H1" }] },
  });
  const legacyRows = rows.filter((row) => row.entityKind === OVERLAY_ENTITY_KINDS.LEGACY);
  assert.equal(legacyRows.length, 2);
  assert.equal(legacyRows[0].entityId, "Lane_03dntrc");
  assert.equal(legacyRows[1].entityId, "Collaboration_06ftemy");
});

test("overlayEntityAdapter: selected entity resolves drawio -> hybrid -> legacy", () => {
  const drawioState = {
    drawio_elements_v1: [
      { id: "shape1", label: "Shape 1", deleted: false },
    ],
  };
  const selectedDrawio = buildOverlaySelectedEntity({
    drawioState,
    drawioSelectedElementId: "shape1",
    hybridV2SelectedIds: [],
    legacyActiveElementId: "legacy_1",
  });
  assert.equal(selectedDrawio.entityKind, OVERLAY_ENTITY_KINDS.DRAWIO);
  assert.equal(selectedDrawio.entityId, "shape1");

  const selectedHybrid = buildOverlaySelectedEntity({
    drawioState,
    hybridV2SelectedIds: ["h1", "h2"],
    hybridV2ActiveId: "h2",
  });
  assert.equal(selectedHybrid.entityKind, OVERLAY_ENTITY_KINDS.HYBRID);
  assert.deepEqual(selectedHybrid.entityIds, ["h1", "h2"]);

  const selectedLegacy = buildOverlaySelectedEntity({
    drawioState: {},
    legacyActiveElementId: "Lane_03dntrc",
  });
  assert.equal(selectedLegacy.entityKind, OVERLAY_ENTITY_KINDS.LEGACY);
  assert.equal(selectedLegacy.entityId, "Lane_03dntrc");
});

test("overlayEntityAdapter: legacy active id does not masquerade as drawio selection", () => {
  const drawioState = {
    drawio_elements_v1: [
      { id: "Activity_123", label: "Drawio copy", deleted: false },
    ],
  };
  const selected = buildOverlaySelectedEntity({
    drawioState,
    drawioSelectedElementId: "",
    hybridV2SelectedIds: [],
    legacyActiveElementId: "Activity_123",
  });
  assert.equal(selected.entityKind, OVERLAY_ENTITY_KINDS.LEGACY);
  assert.equal(selected.entityId, "Activity_123");
});
