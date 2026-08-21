import test from "node:test";
import assert from "node:assert/strict";

import { buildDrawioNormalizationSnapshot } from "./drawioNormalizationDiagnostics.js";

test("buildDrawioNormalizationSnapshot counts ghost and invalid rows", () => {
  const snapshot = buildDrawioNormalizationSnapshot({
    sessionId: "s1",
    source: "unit_test",
    drawioMeta: {
      enabled: true,
      opacity: 0.6,
      interaction_mode: "edit",
      svg_cache: "<svg><rect id='shape1'/></svg>",
      drawio_elements_v1: [
        { id: "shape1", deleted: false },
        { id: "ghost1", deleted: false },
        { id: "", deleted: false },
        { id: "shape_deleted", deleted: true },
      ],
    },
  });
  assert.equal(snapshot.key, "overlay_norm:s1");
  assert.equal(snapshot.source, "unit_test");
  assert.equal(snapshot.element_count, 4);
  assert.equal(snapshot.invalid_count, 1);
  assert.equal(snapshot.ghost_count, 1);
  assert.equal(snapshot.deleted_count, 1);
  assert.equal(snapshot.interaction_mode, "edit");
});
