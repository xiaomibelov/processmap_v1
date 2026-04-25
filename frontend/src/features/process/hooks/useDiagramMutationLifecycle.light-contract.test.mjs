import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDiagramInterviewSemanticFingerprint,
  hasMeaningfulDiagramInterviewDelta,
  buildDiagramSessionPatchFromProjection,
} from "./diagramSessionPatchContract.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readHookSource() {
  return fs.readFileSync(path.join(__dirname, "useDiagramMutationLifecycle.js"), "utf8");
}

test("diagram projection patch does not include heavy interview when only technical interview fields changed", () => {
  const draftInterview = {
    boundaries: { trigger: "Старт", finish_state: "Готово" },
    steps: [
      { id: "s1", node_id: "Task_1", action: "Нарезка", area: "Кухня", order_index: 1 },
    ],
    transitions: [
      { id: "tr_1", from_node_id: "Task_1", to_node_id: "Task_2", when: "" },
    ],
    subprocesses: ["Основной"],
    report_versions: { main: [{ id: "rv1", version: 1 }] },
    ai_questions_by_element: { Task_1: [{ qid: "q1", text: "?" }] },
  };
  const nextInterview = {
    ...draftInterview,
    report_versions: { main: [{ id: "rv2", version: 2 }] },
    path_reports: { main: { id: "rep_2" } },
    ai_questions_by_element: { Task_1: [{ qid: "q1", text: "?", comment: "cached" }] },
  };

  const plan = buildDiagramSessionPatchFromProjection({
    draftInterviewRaw: draftInterview,
    nextInterviewRaw: nextInterview,
    nextNodesRaw: [{ id: "Task_1", title: "Нарезка", type: "step" }],
    draftNodesRaw: [{ id: "Task_1", title: "Нарезка", type: "step" }],
    nextEdgesRaw: [{ from_id: "Task_1", to_id: "Task_2", when: "" }],
    draftEdgesRaw: [{ from_id: "Task_1", to_id: "Task_2", when: "" }],
  });

  assert.equal(hasMeaningfulDiagramInterviewDelta(draftInterview, nextInterview), false);
  assert.equal(Object.prototype.hasOwnProperty.call(plan.patch, "interview"), false);
  assert.equal(Object.keys(plan.patch).length, 0);
});

test("diagram projection patch includes interview when BPMN-meaningful interview semantics changed", () => {
  const draftInterview = {
    boundaries: { trigger: "Старт" },
    steps: [{ id: "s1", node_id: "Task_1", action: "Нарезка", order_index: 1 }],
    transitions: [],
    subprocesses: [],
  };
  const nextInterview = {
    ...draftInterview,
    steps: [{ id: "s1", node_id: "Task_1", action: "Варка", order_index: 1 }],
  };

  const plan = buildDiagramSessionPatchFromProjection({
    draftInterviewRaw: draftInterview,
    nextInterviewRaw: nextInterview,
    nextNodesRaw: [{ id: "Task_1", title: "Варка", type: "step" }],
    draftNodesRaw: [{ id: "Task_1", title: "Нарезка", type: "step" }],
    nextEdgesRaw: [],
    draftEdgesRaw: [],
  });

  assert.equal(hasMeaningfulDiagramInterviewDelta(draftInterview, nextInterview), true);
  assert.equal(Object.prototype.hasOwnProperty.call(plan.patch, "interview"), true);
});

test("diagram projection patch can send nodes/edges without interview when interview semantics did not change", () => {
  const draftInterview = {
    boundaries: { trigger: "Старт" },
    steps: [{ id: "s1", node_id: "Task_1", action: "Нарезка", order_index: 1 }],
    transitions: [{ from_node_id: "Task_1", to_node_id: "Task_2", when: "" }],
  };
  const nextInterview = {
    ...draftInterview,
    report_versions: { pathA: [{ id: "rv_2", version: 2 }] },
  };

  const plan = buildDiagramSessionPatchFromProjection({
    draftInterviewRaw: draftInterview,
    nextInterviewRaw: nextInterview,
    nextNodesRaw: [{ id: "Task_1", title: "Нарезка++", type: "step" }],
    draftNodesRaw: [{ id: "Task_1", title: "Нарезка", type: "step" }],
    nextEdgesRaw: [{ from_id: "Task_1", to_id: "Task_2", when: "ok" }],
    draftEdgesRaw: [{ from_id: "Task_1", to_id: "Task_2", when: "" }],
  });

  assert.equal(Object.prototype.hasOwnProperty.call(plan.patch, "interview"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(plan.patch, "nodes"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(plan.patch, "edges"), true);
});

test("diagram mutation patch ack uses lightweight sync payload instead of full patch session hydration", () => {
  const source = readHookSource();
  assert.equal(
    source.includes('_sync_source: "diagram.autosave_patch_ack"'),
    true,
  );
  assert.equal(
    source.includes("const patchedSession = patchRes.session && typeof patchRes.session === \"object\""),
    false,
  );
  assert.equal(
    source.includes("...patchedSession"),
    false,
  );
});

test("diagram interview semantic fingerprint is stable for key order and technical metadata noise", () => {
  const left = {
    boundaries: { finish_state: "Готово", trigger: "Старт" },
    steps: [{ action: "A", node_id: "Task_1", order_index: 1 }],
    transitions: [{ to_node_id: "Task_2", from_node_id: "Task_1", when: "" }],
    subprocesses: ["Main"],
    report_versions: { main: [{ id: "1" }] },
  };
  const right = {
    transitions: [{ from_node_id: "Task_1", to_node_id: "Task_2", when: "" }],
    boundaries: { trigger: "Старт", finish_state: "Готово" },
    subprocesses: ["Main"],
    steps: [{ node_id: "Task_1", action: "A", order_index: 1 }],
    report_versions: { main: [{ id: "2" }] },
    path_reports: { main: { id: "r2" } },
  };
  assert.equal(
    buildDiagramInterviewSemanticFingerprint(left),
    buildDiagramInterviewSemanticFingerprint(right),
  );
});
