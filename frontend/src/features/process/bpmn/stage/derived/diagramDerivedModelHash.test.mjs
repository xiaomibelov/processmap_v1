import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildBpmnMetaVersionKey,
  buildInterviewVersionKey,
  buildNodesVersionKey,
  buildNotesVersionKey,
  buildHybridLayerVersionKey,
  buildDiagramSourceKey,
} from "./diagramDerivedModelHash.js";

describe("diagramDerivedModelHash", () => {
  it("buildBpmnMetaVersionKey returns same key for same input", () => {
    const meta = { node_path_meta: { a: 1 }, flow_meta: { b: 2 } };
    const k1 = buildBpmnMetaVersionKey(meta);
    const k2 = buildBpmnMetaVersionKey(meta);
    assert.strictEqual(k1, k2);
  });

  it("buildBpmnMetaVersionKey prefers explicit version fields", () => {
    const meta = { bpmn_graph_fingerprint: "abc123", node_path_meta: { a: 1 } };
    const k1 = buildBpmnMetaVersionKey(meta);
    assert.strictEqual(k1, "abc123");
  });

  it("buildInterviewVersionKey returns same key for same input", () => {
    const interview = { steps: [1, 2], analysis: { a: 1 }, notes_by_element: { x: 1 } };
    const k1 = buildInterviewVersionKey(interview);
    const k2 = buildInterviewVersionKey(interview);
    assert.strictEqual(k1, k2);
  });

  it("buildNodesVersionKey returns same key for same array", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const k1 = buildNodesVersionKey(nodes);
    const k2 = buildNodesVersionKey(nodes);
    assert.strictEqual(k1, k2);
  });

  it("buildNotesVersionKey returns same key for same map", () => {
    const map = { a: { items: [1, 2] }, b: { items: [3] } };
    const k1 = buildNotesVersionKey(map);
    const k2 = buildNotesVersionKey(map);
    assert.strictEqual(k1, k2);
  });

  it("buildDiagramSourceKey returns same key for same primitives", () => {
    const params = {
      sessionId: "s1",
      bpmnXmlVersion: 1,
      diagramStateVersion: 2,
      bpmnMetaVersion: "m1",
      nodesVersion: "n1",
      interviewVersion: "i1",
      notesVersion: "nt1",
      hybridLayerVersion: "h1",
      overlaySettingsFlags: "f1",
    };
    const k1 = buildDiagramSourceKey(params);
    const k2 = buildDiagramSourceKey(params);
    assert.strictEqual(k1, k2);
  });
});
