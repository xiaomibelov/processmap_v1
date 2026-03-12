import test from "node:test";
import assert from "node:assert/strict";
import { buildBpmnFragmentTemplate } from "./buildBpmnFragmentTemplate.js";

function createPack(nodeType = "bpmn:Task") {
  return {
    title: "Pack",
    fragment: {
      nodes: [
        { id: "A", type: nodeType, di: { x: 10, y: 20, w: 120, h: 80 } },
        { id: "B", type: "bpmn:Task", di: { x: 180, y: 20, w: 120, h: 80 } },
      ],
      edges: [{ id: "Flow_1", sourceId: "A", targetId: "B" }],
    },
    entryNodeId: "A",
    exitNodeId: "B",
    hints: { defaultLaneName: "Lane 1" },
  };
}

test("buildBpmnFragmentTemplate maps capture pack to bpmn_fragment_v1 template", async () => {
  const result = await buildBpmnFragmentTemplate(async () => ({ ok: true, pack: createPack() }), {
    title: "Fragment A",
    scope: "personal",
    sourceSessionId: "sess_1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.template.template_type, "bpmn_fragment_v1");
  assert.equal(result.template.payload.pack.fragment.nodes.length, 2);
  assert.equal(result.template.payload.bbox.w > 0, true);
  assert.equal(result.template.source_session_id, "sess_1");
});

test("buildBpmnFragmentTemplate returns capture error", async () => {
  const result = await buildBpmnFragmentTemplate(async () => ({ ok: false, error: "no_selection" }), {
    title: "Fragment B",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "no_selection");
});

test("buildBpmnFragmentTemplate surfaces raw-selection diagnostics for unsupported current selection", async () => {
  const result = await buildBpmnFragmentTemplate(async () => ({
    ok: false,
    error: "no_selection",
    diagnostics: {
      rawSelection: [{ id: "Lane_1", type: "bpmn:Lane" }],
      normalizedSelection: [],
      unsupportedSelectionTypes: [],
    },
  }), {
    title: "Fragment Diagnostics",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "no_selection");
  assert.match(String(result.warning || ""), /Raw selection: bpmn:Lane/);
});

test("buildBpmnFragmentTemplate rejects unsupported fragment node types", async () => {
  const result = await buildBpmnFragmentTemplate(async () => ({ ok: true, pack: createPack("bpmn:BoundaryEvent") }), {
    title: "Fragment C",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "unsupported_fragment_nodes");
  assert.match(String(result.warning || ""), /boundaryevent/i);
});
