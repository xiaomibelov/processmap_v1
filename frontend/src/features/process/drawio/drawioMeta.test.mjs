import test from "node:test";
import assert from "node:assert/strict";

import { buildDrawioJazzSnapshot, mergeDrawioMeta, normalizeDrawioMeta } from "./drawioMeta.js";

test("mergeDrawioMeta uses fallback when primary is empty and fallback has svg cache", () => {
  const merged = mergeDrawioMeta(
    normalizeDrawioMeta({}),
    normalizeDrawioMeta({
      enabled: true,
      svg_cache: "<svg><rect id='shape1' x='10' y='10' width='20' height='20'/></svg>",
      transform: { x: 120, y: 70 },
    }),
  );

  assert.equal(merged.enabled, true);
  assert.equal(String(merged.svg_cache || "").includes("<svg"), true);
  assert.equal(Number(merged.transform?.x || 0), 120);
  assert.equal(Number(merged.transform?.y || 0), 70);
});

test("mergeDrawioMeta keeps primary payload when it already has svg cache", () => {
  const merged = mergeDrawioMeta(
    normalizeDrawioMeta({
      enabled: true,
      svg_cache: "<svg><circle id='local' cx='5' cy='5' r='5'/></svg>",
    }),
    normalizeDrawioMeta({
      enabled: true,
      svg_cache: "<svg><rect id='server' x='1' y='1' width='2' height='2'/></svg>",
    }),
  );

  assert.equal(String(merged.svg_cache || "").includes("local"), true);
  assert.equal(String(merged.svg_cache || "").includes("server"), false);
});

test("normalizeDrawioMeta creates Default layer and assigns svg elements to layer", () => {
  const meta = normalizeDrawioMeta({
    enabled: true,
    svg_cache: "<svg><rect id='rect_1' x='10' y='10' width='20' height='20'/><circle id='c1' cx='6' cy='6' r='3'/></svg>",
  });
  assert.equal(Array.isArray(meta.drawio_layers_v1), true);
  assert.equal(meta.drawio_layers_v1.length >= 1, true);
  assert.equal(String(meta.drawio_layers_v1[0]?.name || ""), "Default");
  assert.equal(Array.isArray(meta.drawio_elements_v1), true);
  assert.equal(meta.drawio_elements_v1.some((row) => String(row?.id) === "rect_1"), true);
  assert.equal(meta.drawio_elements_v1.some((row) => String(row?.id) === "c1"), true);
  assert.equal(
    meta.drawio_elements_v1.every((row) => String(row?.layer_id || "").trim().length > 0),
    true,
  );
});

test("buildDrawioJazzSnapshot excludes transient editor mode and tool state", () => {
  const snapshot = buildDrawioJazzSnapshot({
    enabled: true,
    interaction_mode: "edit",
    active_tool: "rect",
    doc_xml: "<mxfile><diagram id='p1'/></mxfile>",
    svg_cache: "<svg><rect id='shape_1'/></svg>",
  });

  assert.equal(snapshot.interaction_mode, "view");
  assert.equal(snapshot.active_tool, "select");
  assert.equal(String(snapshot.doc_xml || "").includes("<mxfile"), true);
  assert.equal(String(snapshot.svg_cache || "").includes("<svg"), true);
});

test("normalizeDrawioMeta keeps valid anchor_v1 on eligible drawio rows", () => {
  const meta = normalizeDrawioMeta({
    svg_cache: "<svg><text id='text_1'>A</text></svg>",
    drawio_elements_v1: [{
      id: "text_1",
      text: "A",
      anchor_v1: {
        target_kind: "bpmn_node",
        target_id: "Task_1",
        relation: "explains",
        status: "anchored",
      },
    }],
  });
  assert.deepEqual(meta.drawio_elements_v1[0].anchor_v1, {
    target_kind: "bpmn_node",
    target_id: "Task_1",
    relation: "explains",
    status: "anchored",
  });
});

test("normalizeDrawioMeta marks malformed anchor_v1 as invalid instead of treating it as anchored", () => {
  const meta = normalizeDrawioMeta({
    svg_cache: "<svg><rect id='ellipse_1'/></svg>",
    drawio_elements_v1: [{
      id: "ellipse_1",
      anchor_v1: {
        target_kind: "bpmn_edge",
        target_id: "Flow_1",
        relation: "calls_out",
      },
    }],
  });
  assert.equal(meta.drawio_elements_v1[0].anchor_v1.status, "invalid");
  assert.equal(meta.drawio_elements_v1[0].anchor_v1.target_kind, "bpmn_edge");
});
