import test from "node:test";
import assert from "node:assert/strict";

import { renderDodSnapshotMarkdown } from "./renderDodSnapshotMarkdown.js";

function makeBaseSnapshot() {
  return {
    meta: {
      processTitle: "Test process",
      generatedAtIso: "2026-02-27T00:00:00Z",
      version: "DoDSnapshot.v1",
    },
    counts: {
      bpmn: { nodesTotal: 0, flowsTotal: 0, annotationsTotal: 0, lanesTotal: 0 },
      interview: { stepsTotal: 0, subprocessGroupsTotal: 0, notesSectionsTotal: 0 },
      tiers: { P0: 0, P1: 0, P2: 0, None: 0 },
    },
    time: { processTotalSec: 0, mainlineTotalSec: 0, byLaneSec: [] },
    lanes: [],
    graph: { nodes: [], flows: [] },
    steps: [],
    quality: { items: [] },
    r_variants: [
      {
        key: "R0",
        stopReason: "success",
        summary: { stepsCount: 3, totalTimeSec: 120, dodPct: 80 },
        steps: [{ nodeId: "S" }, { nodeId: "A" }, { nodeId: "END" }],
        edges: [
          { flowId: "F1", from: "S", to: "A", label: "go", rtier: "R0" },
          { flowId: "F2", from: "A", to: "END", label: "", rtier: "R0" },
        ],
      },
    ],
    r_tiers: {
      source: "meta",
      warning: "",
    },
  };
}

test("renderDodSnapshotMarkdown renders R-variants section from snapshot", () => {
  const md = renderDodSnapshotMarkdown(makeBaseSnapshot());
  assert.ok(md.includes("## 5. Варианты прохождения"));
  assert.ok(md.includes("| Вариант | Steps | Time | DoD | stopReason |"));
  assert.ok(md.includes("### R0"));
  assert.equal(md.includes("trace-derived"), false);
});

test("renderDodSnapshotMarkdown shows inferred warning when r_tiers source is inferred", () => {
  const snapshot = makeBaseSnapshot();
  snapshot.r_tiers = {
    source: "inferred",
    warning: "R-tier вычислен на лету (inferred)",
  };
  const md = renderDodSnapshotMarkdown(snapshot);
  assert.ok(md.includes("R-tier вычислен на лету (inferred)"));
});
