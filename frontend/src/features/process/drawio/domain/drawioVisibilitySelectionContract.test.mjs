import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDrawioVisibilitySelectionContract,
  shouldClearDrawioSelectionByContract,
} from "./drawioVisibilitySelectionContract.js";

test("drawio visibility-selection contract: preview missing is not renderable/selectable", () => {
  const contract = buildDrawioVisibilitySelectionContract({
    enabled: true,
    svg_cache: "",
    interaction_mode: "edit",
    locked: false,
  });
  assert.equal(contract.enabled, true);
  assert.equal(contract.visibleOnCanvas, false);
  assert.equal(contract.renderable, false);
  assert.equal(contract.selectableOnCanvas, false);
  assert.equal(contract.opacityControlEnabled, false);
  assert.equal(contract.shouldClearSelection, true);
  assert.equal(contract.statusKey, "on_preview_missing");
  assert.equal(contract.statusTone, "warning");
});

test("drawio visibility-selection contract: placement-ready create tool is visible but not selectable", () => {
  const contract = buildDrawioVisibilitySelectionContract({
    enabled: true,
    svg_cache: "",
    interaction_mode: "edit",
    active_tool: "rect",
    locked: false,
  });
  assert.equal(contract.visibleOnCanvas, true);
  assert.equal(contract.renderable, true);
  assert.equal(contract.selectableOnCanvas, false);
  assert.equal(contract.opacityControlEnabled, true);
  assert.equal(contract.placementToolActive, true);
  assert.equal(contract.statusKey, "on_placement_ready");
  assert.equal(contract.statusTone, "ok");
});

test("drawio visibility-selection contract: editable preview allows selection", () => {
  const contract = buildDrawioVisibilitySelectionContract({
    enabled: true,
    svg_cache: "<svg></svg>",
    interaction_mode: "edit",
    locked: false,
  });
  assert.equal(contract.visibleOnCanvas, true);
  assert.equal(contract.opacityControlEnabled, true);
  assert.equal(contract.selectable, true);
  assert.equal(
    shouldClearDrawioSelectionByContract({ contract, selectedId: "shape_1" }),
    false,
  );
});
