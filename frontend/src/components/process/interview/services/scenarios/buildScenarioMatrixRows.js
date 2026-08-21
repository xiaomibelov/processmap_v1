import { toArray, toText } from "../../utils.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

function isStepLike(row) {
  const kind = toText(row?.kind).toLowerCase();
  if (kind !== "row_step") return false;
  const rowType = toText(row?.row_type).toLowerCase();
  return rowType === "step" || rowType === "decision" || rowType === "continue" || rowType === "terminal";
}

function countStepDescendants(rowsRaw) {
  let total = 0;
  function walk(list) {
    toArray(list).forEach((row) => {
      if (isStepLike(row)) total += 1;
      walk(row?.children);
    });
  }
  walk(rowsRaw);
  return total;
}

function sumDuration(rowsRaw, stepMetaByNodeId) {
  let total = 0;
  function walk(list) {
    toArray(list).forEach((row) => {
      if (isStepLike(row)) {
        const nodeId = toText(row?.node_id);
        const meta = asObject(stepMetaByNodeId[nodeId]);
        const n = Number(meta?.duration_sec || 0);
        if (Number.isFinite(n) && n > 0) total += n;
      }
      walk(row?.children);
    });
  }
  walk(rowsRaw);
  return total;
}

function maxDurationByBranch(branchRowsRaw, stepMetaByNodeId) {
  const branches = toArray(branchRowsRaw).filter((row) => toText(row?.kind).toLowerCase() === "row_branch");
  if (!branches.length) return sumDuration(branchRowsRaw, stepMetaByNodeId);
  return branches.reduce((acc, branch) => {
    const branchTime = sumDuration(branch?.children, stepMetaByNodeId);
    return Math.max(acc, branchTime);
  }, 0);
}

function summarizeGroup(row, stepMetaByNodeId) {
  const rowType = toText(row?.row_type).toLowerCase();
  const stepsCount = countStepDescendants(row?.children);
  const timeSec = rowType === "parallel"
    ? maxDurationByBranch(row?.children, stepMetaByNodeId)
    : sumDuration(row?.children, stepMetaByNodeId);
  const hasLoop = rowType === "loop"
    || toArray(row?.children).some((child) => toText(child?.row_type).toLowerCase() === "loop");
  const risk = hasLoop ? "loop" : (rowType === "parallel" ? "parallel" : "normal");
  return {
    steps_count: stepsCount,
    time_sec: timeSec,
    dod_summary: "—",
    risk,
  };
}

function makeSequenceContext(scenario) {
  const sequence = toArray(scenario?.sequence);
  const queueByNodeId = {};
  sequence.forEach((step, idx) => {
    const nodeId = toText(step?.node_id);
    if (!nodeId) return;
    if (!queueByNodeId[nodeId]) queueByNodeId[nodeId] = [];
    queueByNodeId[nodeId].push(idx);
  });
  return {
    sequence,
    queueByNodeId,
    takeIndexForNode(nodeIdRaw) {
      const nodeId = toText(nodeIdRaw);
      const q = queueByNodeId[nodeId];
      if (!Array.isArray(q) || !q.length) return -1;
      return Number(q.shift());
    },
  };
}

function defaultCollapsedForRow(row, { p0Mode }) {
  const rowType = toText(row?.row_type).toLowerCase();
  if (rowType === "loop") return true;
  if (rowType === "parallel") {
    return countStepDescendants(row?.children) > 20;
  }
  if (rowType === "branch" && p0Mode && !row?.is_primary) return true;
  return false;
}

function decisionAlternativesMap(scenario) {
  const out = {};
  toArray(scenario?.groups).forEach((group) => {
    const gatewayId = toText(group?.anchor_node_id);
    if (!gatewayId) return;
    const branches = toArray(group?.branches).map((branch) => ({
      flow_id: toText(branch?.flow_id),
      label: toText(branch?.label),
      tier: normalizeTier(branch?.tier),
      is_primary: !!branch?.is_primary,
      stop_reason: toText(branch?.stop_reason),
    }));
    out[gatewayId] = branches;
  });
  return out;
}

export function buildStepMetaByNodeId(vmStepsRaw) {
  const out = {};
  toArray(vmStepsRaw).forEach((step) => {
    const nodeId = toText(step?.node_id);
    if (!nodeId) return;
    const prev = asObject(out[nodeId]);
    const workSec = Number(step?.work_duration_sec ?? step?.duration_sec ?? 0);
    const waitSec = Number(step?.wait_duration_sec ?? 0);
    out[nodeId] = {
      node_id: nodeId,
      lane_name: toText(step?.lane_name || prev?.lane_name),
      tier: normalizeTier(step?.tier || prev?.tier),
      work_duration_sec: Number.isFinite(workSec) && workSec > 0 ? workSec : Number(prev?.work_duration_sec || 0),
      wait_duration_sec: Number.isFinite(waitSec) && waitSec > 0 ? waitSec : Number(prev?.wait_duration_sec || 0),
      duration_sec: Number.isFinite(workSec) && workSec > 0 ? workSec : Number(prev?.duration_sec || 0),
      ai_count: Math.max(Number(prev?.ai_count || 0), Number(step?.ai_count || 0)),
      notes_count: Math.max(Number(prev?.notes_count || 0), Number(step?.notes_count || 0)),
    };
    out[nodeId].total_duration_sec = Number(out[nodeId].work_duration_sec || 0) + Number(out[nodeId].wait_duration_sec || 0);
  });
  return out;
}

export function validateScenarioRowOrder(matrixRowsRaw) {
  const rows = toArray(matrixRowsRaw).filter((row) => toText(row?.kind) === "step" || toText(row?.kind) === "decision");
  const violations = [];
  let checkedPairs = 0;
  let skippedScopePairs = 0;
  rows.forEach((row, idx) => {
    if (idx <= 0) return;
    const prev = rows[idx - 1];
    const prevScope = toArray(prev?.group_stack).map((token) => toText(token)).filter(Boolean).join(" > ");
    const curScope = toArray(row?.group_stack).map((token) => toText(token)).filter(Boolean).join(" > ");
    if (prevScope !== curScope) {
      skippedScopePairs += 1;
      return;
    }
    checkedPairs += 1;
    const prevOrder = Number(prev?.order_index || 0);
    const curOrder = Number(row?.order_index || 0);
    if (!Number.isFinite(prevOrder) || !Number.isFinite(curOrder) || curOrder > prevOrder) return;
    violations.push({
      prev_order_index: prevOrder,
      current_order_index: curOrder,
      node_id: toText(row?.node_id),
      title: toText(row?.step || row?.title),
      scope: curScope,
    });
  });
  const nonMonotonic = violations.length > 0;
  const hasStart = rows.some((row) => toText(row?.node_type).toLowerCase().includes("start"));
  const first = rows[0] || {};
  const firstType = toText(first?.node_type).toLowerCase();
  return {
    ok: !nonMonotonic && (!hasStart || firstType.includes("start")),
    nonMonotonic,
    firstNotStart: hasStart && !firstType.includes("start"),
    checked_pairs: checkedPairs,
    skipped_scope_pairs: skippedScopePairs,
    violations,
  };
}

export function buildScenarioMatrixRows({
  scenario,
  vmSteps,
  collapseById = {},
  p0Mode = false,
} = {}) {
  const scenarioRef = asObject(scenario);
  const rawRows = toArray(scenarioRef?.rows);
  const stepMetaByNodeId = buildStepMetaByNodeId(vmSteps);
  const seqCtx = makeSequenceContext(scenarioRef);
  const decisionAlternativesByGateway = decisionAlternativesMap(scenarioRef);
  const out = [];

  function pushStepRow(row, depth, groupStack) {
    const rowType = toText(row?.row_type).toLowerCase();
    const seqIndex = seqCtx.takeIndexForNode(row?.node_id);
    const prev = seqIndex > 0 ? seqCtx.sequence[seqIndex - 1] : null;
    const next = seqIndex >= 0 ? seqCtx.sequence[seqIndex + 1] : null;
    const nodeId = toText(row?.node_id);
    const meta = asObject(stepMetaByNodeId[nodeId]);
    const alternatives = toArray(decisionAlternativesByGateway[nodeId]);
    const selectedFlowId = toText(row?.decision?.selected_flow_id);
    out.push({
      kind: rowType === "decision" ? "decision" : "step",
      row_type: rowType || "step",
      order_index: Number(row?.order_index || 0),
      depth: Number(depth || 0),
      group_stack: [...groupStack],
      key: `row_step_${Number(row?.order_index || 0)}_${nodeId || "unknown"}`,
      from: toText(prev?.title),
      step: toText(row?.title),
      to: toText(next?.title),
      lane: toText(meta?.lane_name || row?.lane_name),
      node_id: nodeId,
      node_type: toText(row?.node_type),
      tier: normalizeTier(meta?.tier || row?.decision?.selected_tier || "None"),
      duration_sec: Number(meta?.duration_sec || 0),
      dod: "—",
      ai_count: Number(meta?.ai_count || 0),
      notes_count: Number(meta?.notes_count || 0),
      decision_key: rowType === "decision" ? nodeId : "",
      selected_outgoing_flow_id: rowType === "decision" ? selectedFlowId : "",
      selected_condition: rowType === "decision" ? toText(row?.decision?.selected_label) : "",
      alternatives_count: rowType === "decision"
        ? Math.max(0, alternatives.filter((branch) => toText(branch?.flow_id) !== selectedFlowId).length)
        : 0,
      alternatives: rowType === "decision"
        ? alternatives.filter((branch) => toText(branch?.flow_id) !== selectedFlowId)
        : [],
    });
  }

  function walk(rows, depth = 0, groupStack = []) {
    toArray(rows).forEach((row) => {
      const kind = toText(row?.kind).toLowerCase();
      if (kind === "row_group" || kind === "row_branch") {
        const rowType = toText(row?.row_type).toLowerCase() || (kind === "row_branch" ? "branch" : "group");
        const groupId = toText(row?.id || row?.key || `${rowType}_${Number(row?.order_index || 0)}_${depth}`);
        const collapsed = Object.prototype.hasOwnProperty.call(collapseById, groupId)
          ? !!collapseById[groupId]
          : defaultCollapsedForRow(row, { p0Mode });
        const summary = summarizeGroup(row, stepMetaByNodeId);
        out.push({
          kind: "group_header",
          row_type: rowType,
          group_id: groupId,
          order_index: Number(row?.order_index || 0),
          depth,
          group_stack: [...groupStack],
          title: toText(row?.title || row?.label || "Group"),
          label: toText(row?.label),
          is_primary: !!row?.is_primary,
          collapsed,
          ...summary,
          expected_iterations: Number(row?.expected_iterations || 1),
          back_to_node_id: toText(row?.back_to_node_id || row?.target_node_id),
          reason: toText(row?.reason || ""),
        });
        if (!collapsed) {
          walk(row?.children, depth + 1, [...groupStack, rowType]);
        }
        out.push({
          kind: "group_footer",
          row_type: rowType,
          group_id: groupId,
          order_index: Number(row?.order_index || 0),
          depth,
          group_stack: [...groupStack],
          title: toText(row?.title || row?.label || "Group"),
          steps_count: summary.steps_count,
          time_sec: summary.time_sec,
        });
        return;
      }
      if (kind === "row_step") {
        pushStepRow(row, depth, groupStack);
      }
    });
  }

  walk(rawRows, 0, []);
  return out;
}
