import test from "node:test";
import assert from "node:assert/strict";

import { computeDodPercent, formatDodBreakdownTooltip } from "./computeDodPercent.js";

test("computeDodPercent calculates 100% when all checkpoints are done", () => {
  const result = computeDodPercent({
    dod_artifacts: {
      bpmn_present: true,
      paths_mapped: true,
      interview_filled: true,
      ai_report_created: true,
      robotmeta_filled: true,
      hybrid_or_drawio_present: true,
      notes_reviewed: true,
    },
  });
  assert.equal(result.percent, 100);
  assert.equal(result.doneWeight, 100);
  assert.equal(result.totalWeight, 100);
  assert.equal(result.hasData, true);
});

test("computeDodPercent follows canonical weighted formula", () => {
  const result = computeDodPercent({
    bpmn_xml_version: 1,
    reports_versions: 2,
    dod_artifacts: {
      path_artifacts_count: 1,
      interview_steps_count: 3,
      notes_summary_count: 1,
      robotmeta_count: 0,
      hybrid_items_count: 0,
    },
  });
  // BPMN(10) + Paths(20) + Interview(20) + AI report(20) + Notes(10) = 80
  assert.equal(result.percent, 80);
  assert.equal(result.doneWeight, 80);
  assert.equal(result.totalWeight, 100);
});

test("computeDodPercent returns null when no signals exist", () => {
  const result = computeDodPercent({});
  assert.equal(result.percent, null);
  assert.equal(result.hasData, false);
  assert.equal(formatDodBreakdownTooltip(result), "No snapshot yet");
});

test("formatDodBreakdownTooltip includes detailed breakdown", () => {
  const result = computeDodPercent({
    bpmn_xml_version: 1,
    dod_artifacts: {
      path_artifacts_count: 1,
    },
  });
  const tooltip = formatDodBreakdownTooltip(result);
  assert.equal(tooltip.includes("DoD:"), true);
  assert.equal(tooltip.includes("BPMN есть"), true);
  assert.equal(tooltip.includes("Paths размечены"), true);
});

