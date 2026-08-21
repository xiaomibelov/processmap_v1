import { sanitizeDisplayText, toArray, toText } from "../../utils.js";
import { measureInterviewPerf } from "../../perf.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

function makeCounter(start = 1) {
  const state = { value: Math.max(1, Number(start || 1)) };
  return () => {
    const next = state.value;
    state.value += 1;
    return next;
  };
}

function rowFromStep(step, depth, nextOrder) {
  const decision = asObject(step?.decision);
  const hasDecision = !!toText(decision?.selected_flow_id);
  return {
    kind: "row_step",
    row_type: hasDecision ? "decision" : "step",
    order_index: nextOrder(),
    depth,
    node_id: toText(step?.node_id),
    node_type: toText(step?.node_type),
    title: sanitizeDisplayText(step?.title || step?.node_id, toText(step?.node_id) || "—"),
    lane_id: toText(step?.lane_id),
    lane_name: toText(step?.lane_name),
    decision: hasDecision
      ? {
        selected_flow_id: toText(decision?.selected_flow_id),
        selected_label: toText(decision?.selected_label),
        selected_tier: normalizeTier(decision?.selected_tier),
        selected_reason: toText(decision?.selected_reason),
      }
      : null,
  };
}

function rowFromLoop(step, depth, nextOrder) {
  return {
    kind: "row_group",
    row_type: "loop",
    order_index: nextOrder(),
    depth,
    title: toText(step?.target_title || step?.title || step?.target_node_id || "Loop"),
    entry_node_id: toText(step?.entry_node_id || step?.anchor_node_id),
    target_node_id: toText(step?.target_node_id),
    back_to_node_id: toText(step?.back_to_node_id || step?.target_node_id),
    reason: toText(step?.reason || "cycle_detected"),
    expected_iterations: Math.max(1, Number(step?.expected_iterations || 1)),
    children: [],
  };
}

function rowFromContinue(step, depth, nextOrder) {
  return {
    kind: "row_step",
    row_type: "continue",
    order_index: nextOrder(),
    depth,
    node_id: toText(step?.target_node_id),
    node_type: "",
    title: `Продолжение: ${toText(step?.target_title || step?.target_node_id || "—")}`,
  };
}

function buildRowsFromBranchNodes(nodesRaw, depth, nextOrder) {
  const out = [];
  toArray(nodesRaw).forEach((node) => {
    const kind = toText(node?.kind).toLowerCase();
    if (kind === "step") {
      out.push(rowFromStep(node, depth, nextOrder));
      return;
    }
    if (kind === "loop") {
      out.push(rowFromLoop(node, depth, nextOrder));
      return;
    }
    if (kind === "continue") {
      out.push(rowFromContinue(node, depth, nextOrder));
      return;
    }
    if (kind === "gateway" || kind === "parallel") {
      out.push(buildRowsFromGroup(node, depth, nextOrder));
      return;
    }
    if (kind === "terminal") {
      out.push({
        kind: "row_step",
        row_type: "terminal",
        order_index: nextOrder(),
        depth,
        node_id: toText(node?.node_id || node?.nodeId),
    node_type: toText(node?.node_type || node?.nodeType),
        title: sanitizeDisplayText(node?.title, "Завершение"),
      });
    }
  });
  return out;
}

function buildRowsFromGroup(groupRaw, depth, nextOrder) {
  const group = asObject(groupRaw);
  const groupKind = toText(group?.kind).toLowerCase() === "parallel" ? "parallel" : (toText(group?.kind).toLowerCase() === "loop" ? "loop" : "gateway");
  const children = [];

  if (groupKind === "loop") {
    return {
      kind: "row_group",
      row_type: "loop",
      order_index: nextOrder(),
      depth,
      title: toText(group?.title || "Loop"),
      anchor_node_id: toText(group?.anchor_node_id),
      target_node_id: toText(group?.target_node_id),
      entry_node_id: toText(group?.entry_node_id || group?.anchor_node_id),
      back_to_node_id: toText(group?.back_to_node_id || group?.target_node_id),
      reason: toText(group?.reason || "cycle_detected"),
      expected_iterations: Math.max(1, Number(group?.expected_iterations || 1)),
      children: [],
    };
  }

  toArray(group?.branches).forEach((branch, idx) => {
    const branchHeader = {
      kind: "row_branch",
      row_type: "branch",
      order_index: nextOrder(),
      depth: depth + 1,
      key: toText(branch?.key) || String.fromCharCode(65 + (idx % 26)),
      label: toText(branch?.label) || `Ветка ${idx + 1}`,
      tier: normalizeTier(branch?.tier),
      is_primary: !!branch?.is_primary,
      stop_reason: toText(branch?.stop_reason),
      children: buildRowsFromBranchNodes(branch?.children, depth + 2, nextOrder),
    };
    children.push(branchHeader);
  });

  return {
    kind: "row_group",
    row_type: groupKind,
    order_index: nextOrder(),
    depth,
    id: toText(group?.id),
    title: sanitizeDisplayText(group?.title, groupKind === "parallel" ? "Параллельный блок" : "Ветвление"),
    anchor_node_id: toText(group?.anchor_node_id),
    node_type: toText(group?.node_type),
    children,
  };
}

export function buildScenarioRows(scenarioRaw) {
  return measureInterviewPerf("buildScenarioRows", () => {
    const scenario = asObject(scenarioRaw);
    const sequence = toArray(scenario?.sequence);
    const groupsByAnchorNodeId = {};
    toArray(scenario?.groups).forEach((group) => {
      const anchor = toText(group?.anchor_node_id);
      if (!anchor) return;
      if (!groupsByAnchorNodeId[anchor]) groupsByAnchorNodeId[anchor] = [];
      groupsByAnchorNodeId[anchor].push(group);
    });
    const nextOrder = makeCounter(1);
    const rows = [];
    sequence.forEach((step) => {
      rows.push(rowFromStep(step, 0, nextOrder));
      const groups = toArray(groupsByAnchorNodeId[toText(step?.node_id)]);
      groups.forEach((group) => {
        rows.push(buildRowsFromGroup(group, 0, nextOrder));
      });
    });

    // invariant: all rendered rows must have order_index
    return rows.filter((row) => Number.isFinite(Number(row?.order_index)) && Number(row?.order_index) > 0);
  }, () => {
    const scenario = asObject(scenarioRaw);
    return {
      scenarioId: toText(scenario?.id),
      sequenceCount: toArray(scenario?.sequence).length,
      groupCount: toArray(scenario?.groups).length,
    };
  });
}
