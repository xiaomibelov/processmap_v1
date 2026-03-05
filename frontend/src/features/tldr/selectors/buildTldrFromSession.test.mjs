import test from "node:test";
import assert from "node:assert/strict";
import { buildTldrFromSession } from "./buildTldrFromSession.js";

test("buildTldrFromSession: returns empty summary when session has no data", () => {
  const out = buildTldrFromSession({});
  assert.equal(out.empty, true);
  assert.equal(out.sourceKind, "none");
  assert.equal(out.sourceLabel, "No data");
  assert.equal(String(out.summary || "").trim(), "");
});

test("buildTldrFromSession: builds live summary from steps, path tags and hybrid", () => {
  const out = buildTldrFromSession({
    nodes: [{ id: "Task_1" }, { id: "Task_2" }],
    bpmn_meta: {
      node_path_meta: {
        Task_1: { paths: ["P0"] },
        Task_2: { paths: ["P1", "P2"] },
      },
      hybrid_v2: {
        elements: [{ id: "h1" }, { id: "h2" }],
        edges: [{ id: "e1" }],
      },
    },
    interview: {
      path_spec: {
        steps: [{ id: "s1", bpmn_ref: "Task_1" }, { id: "s2", bpmn_ref: "Task_2" }],
      },
    },
  });
  assert.equal(out.empty, false);
  assert.equal(out.sourceKind, "live");
  assert.equal(out.metrics.stepsCount, 2);
  assert.equal(out.metrics.pathTierCounts.P0, 1);
  assert.equal(out.metrics.pathTierCounts.P1, 1);
  assert.equal(out.metrics.pathTierCounts.P2, 1);
  assert.equal(out.metrics.hybridElements, 2);
  assert.equal(out.metrics.hybridEdges, 1);
  assert.match(out.summary, /Coverage:/);
});

test("buildTldrFromSession: falls back to report source when only reports exist", () => {
  const out = buildTldrFromSession({
    interview: {
      report_versions: {
        primary: [
          { id: "5", created_at: 1700000000000 },
        ],
      },
    },
  });
  assert.equal(out.sourceKind, "report");
  assert.match(out.sourceLabel, /Report v5/);
  assert.equal(out.empty, true);
});
