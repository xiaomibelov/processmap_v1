import { normalizeLoose, sanitizeDisplayText, toArray, toText } from "../utils.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function buildInterviewRenderState({
  featureFlags,
  graph,
  model,
  graphNodeRank,
  nodeMetaById,
}) {
  const flags = {
    v2Model: !!featureFlags?.v2Model,
    betweenBranches: !!featureFlags?.betweenBranches,
    timeModel: !!featureFlags?.timeModel,
    detachedFilter: !!featureFlags?.detachedFilter,
    renderMode: toText(featureFlags?.renderMode || "full").toLowerCase() || "full",
  };
  const graphRef = graph && typeof graph === "object" ? graph : {};
  const modelRef = model && typeof model === "object" ? model : {};
  const reachableSet = new Set(toArray(graphRef?.reachableNodeIds).map((id) => toText(id)).filter(Boolean));
  const nodeRank = graphNodeRank && typeof graphNodeRank === "object" ? graphNodeRank : {};
  const warnings = [];
  const rowByNodeId = {};

  toArray(modelRef?.sourceRows).forEach((row) => {
    const nodeId = toText(row?.node_bind_id || row?.node_id);
    if (!nodeId || rowByNodeId[nodeId]) return;
    rowByNodeId[nodeId] = row;
  });

  function rankFor(nodeIdRaw) {
    const rank = Number(nodeRank[toText(nodeIdRaw)]);
    return Number.isFinite(rank) ? rank : Number.MAX_SAFE_INTEGER;
  }

  function normalizeRows(rowsRaw) {
    return toArray(rowsRaw).map((row, idx) => ({
      ...row,
      seq: idx + 1,
      seq_label: String(idx + 1),
    }));
  }

  function fallbackRow(nodeIdRaw, idx = 0) {
    const nodeId = toText(nodeIdRaw);
    const node = asObject(graphRef?.nodesById?.[nodeId]);
    const laneName = toText(nodeMetaById?.[nodeId]?.lane || "");
    const nodeTitle = sanitizeDisplayText(nodeMetaById?.[nodeId]?.title || node?.name || nodeId, nodeId || `Шаг ${idx + 1}`);
    return {
      id: `auto_${nodeId || idx + 1}`,
      seq: idx + 1,
      seq_label: String(idx + 1),
      action: nodeTitle,
      node_bind_id: nodeId,
      node_bind_title: nodeTitle,
      node_bind_kind: toText(nodeMetaById?.[nodeId]?.kind || node?.type || ""),
      node_bound: !!nodeId,
      lane_name: laneName,
      lane_key: normalizeLoose(laneName) || "unassigned",
    };
  }

  function buildFlatReachableRows() {
    const outgoingByNode = asObject(graphRef?.outgoingByNode);
    const incomingByNode = asObject(graphRef?.incomingByNode);
    const visited = new Set();
    const order = [];
    const starts = toArray(graphRef?.startNodeIds).map((id) => toText(id)).filter(Boolean);
    if (!starts.length) {
      Object.keys(asObject(graphRef?.nodesById))
        .filter((nodeId) => toArray(incomingByNode[nodeId]).length === 0)
        .sort((a, b) => rankFor(a) - rankFor(b))
        .forEach((nodeId) => starts.push(nodeId));
    }

    function dfs(nodeIdRaw) {
      const nodeId = toText(nodeIdRaw);
      if (!nodeId || visited.has(nodeId)) return;
      visited.add(nodeId);
      if (flags.detachedFilter && !reachableSet.has(nodeId)) return;
      order.push(nodeId);
      const outgoing = [...toArray(outgoingByNode[nodeId])].sort((a, b) => rankFor(a?.targetId) - rankFor(b?.targetId));
      outgoing.forEach((flow) => dfs(flow?.targetId));
    }

    starts.forEach((nodeId) => dfs(nodeId));

    const tails = Object.keys(asObject(graphRef?.nodesById))
      .filter((nodeId) => !visited.has(nodeId))
      .sort((a, b) => rankFor(a) - rankFor(b));
    tails.forEach((nodeId) => {
      if (flags.detachedFilter && !reachableSet.has(nodeId)) return;
      order.push(nodeId);
    });

    return normalizeRows(order.map((nodeId, idx) => rowByNodeId[nodeId] || fallbackRow(nodeId, idx)));
  }

  function buildMainlineOnlyRows() {
    const nodeIds = toArray(modelRef?.mainlineNodeIds).map((id) => toText(id)).filter(Boolean);
    return normalizeRows(nodeIds.map((nodeId, idx) => rowByNodeId[nodeId] || fallbackRow(nodeId, idx)));
  }

  function appendDetachedRows(baseRows) {
    if (flags.detachedFilter) return baseRows;
    const present = new Set(toArray(baseRows).map((row) => toText(row?.node_bind_id || row?.node_id)).filter(Boolean));
    const detachedNodeIds = Object.keys(asObject(graphRef?.nodesById))
      .filter((nodeId) => !reachableSet.has(nodeId) && !present.has(nodeId))
      .sort((a, b) => rankFor(a) - rankFor(b));
    if (!detachedNodeIds.length) return baseRows;
    const detachedRows = detachedNodeIds.map((nodeId, idx) => fallbackRow(nodeId, baseRows.length + idx));
    return normalizeRows([...baseRows, ...detachedRows]);
  }

  function buildFullRows() {
    let rows = normalizeRows(toArray(modelRef?.timelineView));
    if (!flags.betweenBranches) {
      rows = rows.map((row) => ({
        ...row,
        between_branches_item: null,
      }));
    }
    if (!flags.timeModel) {
      rows = rows.map((row) => ({
        ...row,
        step_time_model: null,
        step_time_label: "—",
        step_time_sec: null,
        mainline_time_cumulative_sec: null,
        mainline_time_cumulative_label: "—",
        mainline_time_total_sec: null,
        mainline_time_total_label: "—",
        between_branches_item: row?.between_branches_item
          ? {
            ...row.between_branches_item,
            time_summary: null,
            branches: toArray(row?.between_branches_item?.branches).map((branch) => ({
              ...branch,
              time_summary: null,
            })),
          }
          : row?.between_branches_item,
      }));
    }
    return appendDetachedRows(rows);
  }

  const graphNodeCount = Object.keys(asObject(graphRef?.nodesById)).length;
  const mainlineCount = toArray(modelRef?.mainlineNodeIds).length;
  const requestedMode = flags.v2Model ? flags.renderMode : "flat";
  if (!flags.v2Model) warnings.push("interview.v2_model=off: fallback to flat reachable mode.");

  let effectiveMode = requestedMode;
  let timeline = [];
  try {
    if (effectiveMode === "flat") timeline = buildFlatReachableRows();
    else if (effectiveMode === "mainline") timeline = appendDetachedRows(buildMainlineOnlyRows());
    else timeline = buildFullRows();

    if (effectiveMode === "full" && graphNodeCount > 30 && mainlineCount < 3) {
      warnings.push(`Anomaly detected: mainline=${mainlineCount}, graph_nodes=${graphNodeCount}. Auto-fallback to mainline mode.`);
      effectiveMode = "mainline";
      timeline = appendDetachedRows(buildMainlineOnlyRows());
    }
  } catch (error) {
    warnings.push(`Render error in mode=${effectiveMode}: ${toText(error?.message || error) || "unknown"}. Auto-fallback to mainline mode.`);
    effectiveMode = "mainline";
    try {
      timeline = appendDetachedRows(buildMainlineOnlyRows());
    } catch {
      warnings.push("Mainline fallback failed. Auto-fallback to flat reachable mode.");
      effectiveMode = "flat";
      timeline = buildFlatReachableRows();
    }
  }

  return {
    requestedMode,
    effectiveMode,
    warnings,
    flags,
    timelineView: timeline,
    mainlineTimeSummary: flags.timeModel ? modelRef?.mainlineTimeSummary : null,
  };
}
