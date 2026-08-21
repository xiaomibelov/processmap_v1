import test from "node:test";
import assert from "node:assert/strict";

import {
  parseDurationModelFromText,
  parseStepTimeModel,
  summarizeBranchNodesTime,
  summarizeBranchesTime,
} from "./timeModel.js";

test("parseDurationModelFromText parses fixed minutes", () => {
  const model = parseDurationModelFromText("Операция занимает 15 мин");
  assert.equal(model.time_kind, "fixed");
  assert.equal(model.expected_sec, 900);
  assert.equal(model.label, "15 мин");
});

test("parseStepTimeModel parses seconds and ranges", () => {
  const fixed = parseStepTimeModel({ duration_sec: 45 });
  assert.equal(fixed.expected_sec, 45);
  assert.equal(fixed.time_kind, "fixed");

  const range = parseStepTimeModel({ duration_min_min: 2, duration_min_max: 4 });
  assert.equal(range.time_kind, "range");
  assert.equal(range.min_sec, 120);
  assert.equal(range.max_sec, 240);
});

test("summarizeBranchesTime keeps primary expected and marks loop", () => {
  const nodeTimeByNodeId = {
    A: { time_kind: "fixed", expected_sec: 600, min_sec: 600, max_sec: 600, label: "10 мин" },
    B: { time_kind: "fixed", expected_sec: 120, min_sec: 120, max_sec: 120, label: "2 мин" },
  };
  const branches = [
    {
      key: "A",
      label: "Да",
      isPrimary: true,
      children: [
        { kind: "step", nodeId: "A" },
        { kind: "continue", targetNodeId: "N7", targetGraphNo: "7", targetTitle: "Next" },
      ],
    },
    {
      key: "B",
      label: "Нет",
      isPrimary: false,
      children: [
        { kind: "step", nodeId: "B" },
        { kind: "loop", targetNodeId: "G6", targetGraphNo: "6", targetTitle: "Gateway" },
      ],
    },
  ];

  const summary = summarizeBranchesTime(branches, nodeTimeByNodeId);
  assert.equal(summary.expected_sec, 600);
  assert.equal(summary.best_case_sec, 120);
  assert.equal(summary.worst_case_sec, 600);
  assert.equal(summary.has_loop, true);
});

test("summarizeBranchNodesTime handles nested decision range", () => {
  const nodeTimeByNodeId = {
    A: { time_kind: "fixed", expected_sec: 300, min_sec: 300, max_sec: 300, label: "5 мин" },
    B: { time_kind: "fixed", expected_sec: 120, min_sec: 120, max_sec: 120, label: "2 мин" },
    C: { time_kind: "fixed", expected_sec: 240, min_sec: 240, max_sec: 240, label: "4 мин" },
  };
  const nodes = [
    { kind: "step", nodeId: "A" },
    {
      kind: "decision",
      branches: [
        { key: "A", isPrimary: true, children: [{ kind: "step", nodeId: "B" }] },
        { key: "B", isPrimary: false, children: [{ kind: "step", nodeId: "C" }] },
      ],
    },
  ];
  const summary = summarizeBranchNodesTime(nodes, nodeTimeByNodeId);
  assert.equal(summary.expected_sec, 420);
  assert.equal(summary.min_sec, 420);
  assert.equal(summary.max_sec, 540);
});
