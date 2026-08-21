import { buildScenarioSequenceForReport } from "../services/pathReport.js";
import { sanitizeDisplayText, toArray, toText } from "../utils.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toNonNegativeInt(valueRaw) {
  const value = Number(valueRaw || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.round(value));
}

function fallbackSequenceRows(scenarioRaw) {
  return toArray(scenarioRaw?.sequence)
    .map((stepRaw, idx) => {
      const step = asObject(stepRaw);
      const nodeId = toText(step?.node_id || step?.nodeId || step?.bpmn_ref);
      if (!nodeId) return null;
      return {
        order_index: idx + 1,
        node_id: nodeId,
        title: sanitizeDisplayText(step?.title || nodeId, nodeId),
        lane_name: toText(step?.lane_name || step?.laneName || step?.lane),
        tier: toText(step?.tier),
        row_type: step?.decision ? "decision" : "step",
        decision: asObject(step?.decision),
      };
    })
    .filter(Boolean);
}

export function buildScenarioStepRows(scenarioRaw) {
  const fromRows = buildScenarioSequenceForReport(scenarioRaw)
    .map((stepRaw, idx) => {
      const step = asObject(stepRaw);
      const nodeId = toText(step?.node_id || step?.bpmn_ref);
      if (!nodeId) return null;
      return {
        order_index: idx + 1,
        node_id: nodeId,
        title: sanitizeDisplayText(step?.title || nodeId, nodeId),
        lane_name: toText(step?.lane_name || step?.laneName || step?.lane),
        tier: toText(step?.tier),
        row_type: step?.decision ? "decision" : "step",
        decision: asObject(step?.decision),
      };
    })
    .filter(Boolean);

  if (fromRows.length) return fromRows;
  return fallbackSequenceRows(scenarioRaw);
}

export function buildScenarioMetrics(scenarioRaw, stepTimeByNodeIdRaw) {
  const stepTimeByNodeId = asObject(stepTimeByNodeIdRaw);
  const rows = buildScenarioStepRows(scenarioRaw);
  const totals = rows.reduce((acc, row) => {
    const time = asObject(stepTimeByNodeId[toText(row?.node_id)]);
    const workSec = toNonNegativeInt(time?.work_duration_sec);
    const waitSec = toNonNegativeInt(time?.wait_duration_sec);
    return {
      work_time_total_sec: acc.work_time_total_sec + workSec,
      wait_time_total_sec: acc.wait_time_total_sec + waitSec,
    };
  }, { work_time_total_sec: 0, wait_time_total_sec: 0 });
  return {
    steps_count: rows.length,
    work_time_total_sec: totals.work_time_total_sec,
    wait_time_total_sec: totals.wait_time_total_sec,
    total_time_sec: totals.work_time_total_sec + totals.wait_time_total_sec,
  };
}

