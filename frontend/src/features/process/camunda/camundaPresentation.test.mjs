import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCamundaPresentationMap,
  shouldResetPropertiesOverlayPreviewForSelection,
} from "./camundaPresentation.js";

test("normalizeCamundaPresentationMap keeps enabled presentation rows only", () => {
  assert.deepEqual(
    normalizeCamundaPresentationMap({
      Activity_1: { showPropertiesOverlay: true },
      Activity_2: { showPropertiesOverlay: false },
    }),
    {
      Activity_1: {
        showPropertiesOverlay: true,
        show_properties_overlay: true,
      },
    },
  );
});

test("properties overlay preview is not reset on repeated selection of the same element", () => {
  assert.equal(
    shouldResetPropertiesOverlayPreviewForSelection("Activity_0m9b0nx", "Activity_0m9b0nx"),
    false,
  );
  assert.equal(
    shouldResetPropertiesOverlayPreviewForSelection("Activity_0m9b0nx", "Activity_other"),
    true,
  );
  assert.equal(
    shouldResetPropertiesOverlayPreviewForSelection("Activity_0m9b0nx", ""),
    true,
  );
});
