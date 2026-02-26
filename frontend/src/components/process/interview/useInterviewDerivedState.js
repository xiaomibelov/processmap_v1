import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import {
  TIMELINE_OPTIONAL_COLUMNS,
  toArray,
  toText,
  normalizeLoose,
  normalizeInterviewOrderMode,
  dedupNames,
  computeNodeOrder,
  collectBpmnTraversalOrderMeta,
  parseLaneMetaByNodeFromBpmnXml,
  parseSubprocessMetaByNodeFromBpmnXml,
  parseNodeKindMapFromBpmnXml,
  parseVirtualEventNodesFromBpmnXml,
  extractTextAnnotationsByTarget,
  parseTextAnnotationsByNodeFromBpmnXml,
  parseAnnotationTree,
  annotationTitleFromText,
  buildAnnotationSyncByStepId,
  normalizeAiQuestionsByElementMap,
  nodeKindIcon,
  laneColor,
  laneLabel,
  typeLabel,
  toNonNegativeInt,
  parseStepWorkDurationSec,
  parseStepWaitDurationSec,
  formatHHMMFromSeconds,
  percent,
  round1,
} from "./utils";
import { buildTimelineView } from "./timelineViewModel";
import { buildInterviewGraphModel } from "./graph/buildGraphModel";
import { validateInterviewGraphModel } from "./graph/validateGraphModel";
import { buildInterviewModel } from "./model/buildInterviewModel";
import { buildInterviewTimelineItems } from "./viewmodel/buildTimelineItems";
import { buildInterviewRenderState } from "./viewmodel/buildInterviewRenderState";
import { buildInterviewVM, assertInterviewVMInvariants } from "./viewmodel/buildInterviewVM";
import { getInterviewFeatureFlags } from "./featureFlags";
import { computeDodSnapshot } from "../../../features/process/dod/computeDodSnapshot";
import { measureInterviewPerf } from "./perf";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function shouldDebugLoopTrace() {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage;
    return String(ls?.getItem("fpc_debug_trace") || "").trim() === "1"
      || String(ls?.getItem("DEBUG_LOOP") || "").trim() === "1";
  } catch {
    return false;
  }
}

function quickHash(value) {
  const src = String(value || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildTimelineHash(listRaw) {
  return toArray(listRaw)
    .map((step, idx) => {
      const stepId = toText(step?.id) || `#${idx}`;
      const seq = toText(step?.seq_label || step?.seq);
      const nodeId = toText(step?.node_bind_id || step?.node_id);
      const duration = toText(step?.step_time_sec || step?.duration_sec || "");
      return `${stepId}:${seq}:${nodeId}:${duration}`;
    })
    .join("|");
}

function bpmnFallbackMessage(reasonRaw) {
  const reason = toText(reasonRaw).toLowerCase();
  if (reason === "no_start_event") return "нет StartEvent";
  if (reason === "no_sequence_flow") return "нет sequenceFlow";
  if (reason === "xml_parse_error") return "ошибка разбора BPMN XML";
  if (reason === "dom_parser_unavailable") return "DOMParser недоступен";
  if (reason === "empty_xml") return "пустой BPMN XML";
  if (reason === "no_flow_nodes") return "в XML нет flow-узлов";
  return "не удалось построить граф";
}

export default function useInterviewDerivedState({
  sessionDraft,
  data,
  nodes,
  edges,
  roles,
  actorsDerived,
  bpmnXml,
  boundariesLaneFilter,
  timelineFilters,
  hiddenTimelineCols,
  processTitle,
  sid,
}) {
  const recalcCountRef = useRef(0);
  const recalcWindowRef = useRef({ ts: 0, count: 0 });

  recalcCountRef.current += 1;

  const boundariesComplete = useMemo(() => {
    const b = data.boundaries;
    return !!toText(b.trigger) && !!toText(b.start_shop) && !!toText(b.finish_state) && !!toText(b.finish_shop);
  }, [data.boundaries]);

  const laneMetaByNodeFromXml = useMemo(() => parseLaneMetaByNodeFromBpmnXml(bpmnXml), [bpmnXml]);
  const subprocessMetaByNodeFromXml = useMemo(() => parseSubprocessMetaByNodeFromBpmnXml(bpmnXml), [bpmnXml]);
  const laneByNodeFromXml = useMemo(() => {
    const out = {};
    Object.keys(laneMetaByNodeFromXml).forEach((nodeId) => {
      out[nodeId] = toText(laneMetaByNodeFromXml[nodeId]?.name);
    });
    return out;
  }, [laneMetaByNodeFromXml]);
  const nodeKindByIdFromXml = useMemo(() => parseNodeKindMapFromBpmnXml(bpmnXml), [bpmnXml]);
  const xmlTextAnnotationEntriesByNode = useMemo(() => extractTextAnnotationsByTarget(bpmnXml), [bpmnXml]);
  const xmlTextAnnotationsByNode = useMemo(() => parseTextAnnotationsByNodeFromBpmnXml(bpmnXml), [bpmnXml]);
  const virtualEventNodes = useMemo(
    () => parseVirtualEventNodesFromBpmnXml(bpmnXml, laneByNodeFromXml, nodeKindByIdFromXml),
    [bpmnXml, laneByNodeFromXml, nodeKindByIdFromXml],
  );

  const backendNodes = useMemo(() => {
    const real = toArray(nodes)
      .map((n) => ({
        id: toText(n?.id),
        title: toText(n?.title || n?.name),
        actorRole: toText(n?.actor_role || n?.role || laneByNodeFromXml[toText(n?.id)]),
        nodeType: toText(n?.type),
        bpmnKind: toText(nodeKindByIdFromXml[toText(n?.id)]),
        parameters: n?.parameters && typeof n.parameters === "object" ? n.parameters : {},
      }))
      .filter((n) => n.id);
    const byId = new Map();
    real.forEach((n) => byId.set(n.id, n));
    virtualEventNodes.forEach((n) => {
      if (!byId.has(n.id)) byId.set(n.id, n);
    });
    return Array.from(byId.values());
  }, [nodes, laneByNodeFromXml, nodeKindByIdFromXml, virtualEventNodes]);

  const backendEdges = useMemo(() => {
    return toArray(edges).map((e) => ({
      from_id: toText(e?.from_id || e?.from || e?.source_id || e?.sourceId),
      to_id: toText(e?.to_id || e?.to || e?.target_id || e?.targetId),
      when: toText(e?.when || e?.label || ""),
    }));
  }, [edges]);

  const actorNames = useMemo(() => {
    const names = toArray(actorsDerived)
      .map((x) => toText(x?.name || x?.laneName || x?.label))
      .filter(Boolean);
    if (names.length) return dedupNames(names);
    return dedupNames(
      toArray(roles)
        .map((x) => toText(x))
        .filter(Boolean),
    );
  }, [actorsDerived, roles]);

  const orderMode = normalizeInterviewOrderMode(data?.order_mode || data?.orderMode || "interview");
  const bpmnOrderMeta = useMemo(() => collectBpmnTraversalOrderMeta(bpmnXml), [bpmnXml]);
  const xmlNodeOrder = useMemo(() => toArray(bpmnOrderMeta?.nodeIds), [bpmnOrderMeta]);
  const creationNodeOrder = useMemo(() => {
    const seen = new Set();
    const out = [];
    const orderedSteps = toArray(data.steps)
      .map((step, idx) => ({
        step,
        idx,
        orderIdx: Number(step?.order_index || step?.order || idx + 1),
      }))
      .sort((a, b) => {
        if (a.orderIdx !== b.orderIdx) return a.orderIdx - b.orderIdx;
        return a.idx - b.idx;
      });
    orderedSteps.forEach(({ step }) => {
      const nodeId = toText(step?.bpmn_ref || step?.node_bind_id || step?.node_id || step?.nodeId);
      if (!nodeId || seen.has(nodeId)) return;
      seen.add(nodeId);
      out.push(nodeId);
    });
    backendNodes.forEach((node) => {
      const nodeId = toText(node?.id);
      if (!nodeId || seen.has(nodeId)) return;
      seen.add(nodeId);
      out.push(nodeId);
    });
    return out;
  }, [data.steps, backendNodes]);
  const bpmnOrderUnavailable = !!bpmnOrderMeta?.usedFallback;
  const bpmnOrderFallback = orderMode === "bpmn" && bpmnOrderUnavailable;
  const bpmnOrderHint = bpmnOrderUnavailable
    ? `Fallback order: creation order (${bpmnFallbackMessage(bpmnOrderMeta?.fallbackReason)}).`
    : "Порядок вычислен по графу диаграммы.";
  const graphNodeOrder = useMemo(() => {
    const out = [];
    const seen = new Set();
    function pushUnique(nodeIdRaw) {
      const nodeId = toText(nodeIdRaw);
      if (!nodeId || seen.has(nodeId)) return;
      seen.add(nodeId);
      out.push(nodeId);
    }

    if (orderMode === "bpmn" && !bpmnOrderFallback && xmlNodeOrder.length) {
      const known = new Set(backendNodes.map((n) => toText(n?.id)).filter(Boolean));
      const fromXml = xmlNodeOrder.filter((id) => known.has(id));
      fromXml.forEach((id) => pushUnique(id));
    } else if (creationNodeOrder.length) {
      creationNodeOrder.forEach((id) => pushUnique(id));
    } else {
      computeNodeOrder(backendNodes, backendEdges).forEach((id) => pushUnique(id));
    }
    backendNodes.forEach((node) => pushUnique(node?.id));
    return out;
  }, [backendNodes, backendEdges, xmlNodeOrder, creationNodeOrder, orderMode, bpmnOrderFallback]);

  const graphNodeRank = useMemo(() => {
    const out = {};
    graphNodeOrder.forEach((id, idx) => {
      out[id] = idx;
    });
    return out;
  }, [graphNodeOrder]);
  const graphOrderLocked = orderMode === "bpmn" && !bpmnOrderFallback;

  const subprocessCatalog = useMemo(() => {
    const fromSteps = toArray(data.steps).map((x) => x?.subprocess);
    const fromRoot = toArray(data.subprocesses);
    const fromBackend = backendNodes.map((x) => x?.parameters?.interview_subprocess);
    return dedupNames([...fromRoot, ...fromSteps, ...fromBackend]);
  }, [data.steps, data.subprocesses, backendNodes]);

  const timelineBaseView = useMemo(
    () =>
      buildTimelineView({
        steps: data.steps,
        backendNodes,
        graphNodeRank,
        laneMetaByNode: laneMetaByNodeFromXml,
        subprocessMetaByNode: subprocessMetaByNodeFromXml,
        preferGraphOrder: graphOrderLocked,
      }),
    [data.steps, backendNodes, graphNodeRank, laneMetaByNodeFromXml, subprocessMetaByNodeFromXml, graphOrderLocked],
  );

  const transitionLabelByKey = useMemo(() => {
    const out = {};
    toArray(data.transitions).forEach((tr) => {
      const fromId = toText(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId);
      const toId = toText(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId);
      if (!fromId || !toId) return;
      out[`${fromId}__${toId}`] = toText(tr?.when || tr?.label || "");
    });
    return out;
  }, [data.transitions]);

  const flowMetaById = useMemo(() => {
    const rawMeta = asObject(sessionDraft?.bpmn_meta);
    const rawFlowMeta = asObject(rawMeta?.flow_meta);
    const out = {};
    Object.keys(rawFlowMeta).forEach((rawFlowId) => {
      const flowId = toText(rawFlowId);
      if (!flowId) return;
      const entry = asObject(rawFlowMeta[rawFlowId]);
      const tier = toText(entry?.tier).toUpperCase();
      if (tier === "P0" || tier === "P1" || tier === "P2") {
        out[flowId] = { tier };
        return;
      }
      if (entry?.happy) out[flowId] = { tier: "P0" };
    });
    return out;
  }, [sessionDraft?.bpmn_meta]);

  const nodeMetaById = useMemo(() => {
    const out = {};
    backendNodes.forEach((node) => {
      const nodeId = toText(node?.id);
      if (!nodeId) return;
      out[nodeId] = {
        title: toText(node?.title) || nodeId,
        lane: toText(node?.actorRole),
        kind: toText(node?.bpmnKind || nodeKindByIdFromXml[nodeId]).toLowerCase(),
      };
    });
    timelineBaseView.forEach((step) => {
      const nodeId = toText(step?.node_bind_id || step?.node_id);
      if (!nodeId) return;
      const prev = out[nodeId] || {};
      out[nodeId] = {
        title: toText(step?.action) || prev.title || nodeId,
        lane: toText(step?.lane_name) || prev.lane || "",
        kind: toText(step?.node_bind_kind || prev.kind || nodeKindByIdFromXml[nodeId]).toLowerCase(),
      };
    });
    return out;
  }, [backendNodes, timelineBaseView, nodeKindByIdFromXml]);

  const interviewGraph = useMemo(
    () =>
      measureInterviewPerf("buildGraphModel", () => buildInterviewGraphModel({
        bpmnXml,
        backendNodes,
        backendEdges,
        transitionLabelByKey,
        flowMetaById,
        nodeKindById: nodeKindByIdFromXml,
        laneMetaByNode: laneMetaByNodeFromXml,
        subprocessMetaByNode: subprocessMetaByNodeFromXml,
        graphNodeRank,
      }), () => ({
        nodes: backendNodes.length,
        edges: backendEdges.length,
        xmlLength: String(bpmnXml || "").length,
      })),
    [
      backendNodes,
      backendEdges,
      bpmnXml,
      transitionLabelByKey,
      flowMetaById,
      nodeKindByIdFromXml,
      laneMetaByNodeFromXml,
      subprocessMetaByNodeFromXml,
      graphNodeRank,
    ],
  );

  const interviewModel = useMemo(
    () =>
      measureInterviewPerf("buildInterviewModel", () => buildInterviewModel({
        timelineBaseView,
        graph: interviewGraph,
        nodeMetaById,
        graphOrderLocked,
        graphNodeRank,
        annotationTextsByNode: xmlTextAnnotationsByNode,
        includeBetweenBranches: true,
        enableTimeModel: true,
      }), () => ({
        timelineSteps: timelineBaseView.length,
        graphNodes: Object.keys(asObject(interviewGraph?.nodesById)).length,
      })),
    [timelineBaseView, interviewGraph, nodeMetaById, graphOrderLocked, graphNodeRank, xmlTextAnnotationsByNode],
  );
  const interviewFeatureFlags = getInterviewFeatureFlags();

  const interviewRenderState = useMemo(
    () =>
      measureInterviewPerf("buildInterviewRenderState", () => buildInterviewRenderState({
        featureFlags: interviewFeatureFlags,
        graph: interviewGraph,
        model: interviewModel,
        graphNodeRank,
        nodeMetaById,
      }), () => ({
        mode: toText(interviewFeatureFlags?.interviewMode),
        mainlineCount: toArray(interviewModel?.mainlineNodeIds).length,
      })),
    [interviewFeatureFlags, interviewGraph, interviewModel, graphNodeRank, nodeMetaById],
  );
  const graphValidation = useMemo(
    () =>
      measureInterviewPerf("validateGraphModel", () => validateInterviewGraphModel({
        graph: interviewGraph,
        graphNodeRank,
      }), () => ({
        nodes: Object.keys(asObject(interviewGraph?.nodesById)).length,
        flows: Object.keys(asObject(interviewGraph?.flowsById)).length,
      })),
    [interviewGraph, graphNodeRank],
  );

  const dodSnapshot = useMemo(
    () =>
      measureInterviewPerf("computeDoD", () => computeDodSnapshot({
        draft: sessionDraft,
        bpmnXml,
        graphModel: interviewGraph,
        interviewModel,
        qualityReport: {
          items: toArray(graphValidation?.issues),
          warningsTotal: Number(asObject(graphValidation?.summary)?.warn_count || 0),
          errorsTotal: Number(asObject(graphValidation?.summary)?.error_count || 0),
        },
        uiState: {
          sessionId: sid,
          sessionTitle: processTitle,
          processTitle,
          version: "DoDSnapshot.v1",
          mode: orderMode,
        },
      }), () => ({
        steps: toArray(data?.steps).length,
        graphNodes: Object.keys(asObject(interviewGraph?.nodesById)).length,
        qualityIssues: toArray(graphValidation?.issues).length,
      })),
    [sessionDraft, bpmnXml, interviewGraph, interviewModel, graphValidation, sid, processTitle, orderMode],
  );

  const timelineView = interviewRenderState.timelineView;
  const timelineViewHash = useMemo(() => quickHash(buildTimelineHash(timelineView)), [timelineView]);
  const graphNodeCount = useMemo(() => Object.keys(asObject(interviewGraph?.nodesById)).length, [interviewGraph]);
  const graphFlowCount = useMemo(() => Object.keys(asObject(interviewGraph?.flowsById)).length, [interviewGraph]);
  const snapshotStepCount = useMemo(() => toArray(dodSnapshot?.steps).length, [dodSnapshot]);
  const interviewVMHash = useMemo(() => {
    return quickHash(
      `${sid}|${timelineViewHash}|g:${graphNodeCount}/${graphFlowCount}|s:${snapshotStepCount}`,
    );
  }, [sid, timelineViewHash, graphNodeCount, graphFlowCount, snapshotStepCount]);
  const interviewVMInputRef = useRef({
    timelineView: [],
    dodSnapshot: null,
    graphModel: null,
    graphNodeRank: {},
    nodeMetaById: {},
  });
  interviewVMInputRef.current = {
    timelineView,
    dodSnapshot,
    graphModel: interviewGraph,
    graphNodeRank,
    nodeMetaById,
  };
  const interviewCanonicalModel = interviewModel.canonicalNodes;
  const timelineItems = useMemo(
    () =>
      measureInterviewPerf("prepareTimelineRows", () => buildInterviewTimelineItems(timelineView), () => ({
        timelineSteps: toArray(timelineView).length,
      })),
    [timelineView],
  );
  const interviewVM = useMemo(
    () =>
      measureInterviewPerf("computeInterviewVM", () => buildInterviewVM({
        timelineView: interviewVMInputRef.current.timelineView,
        dodSnapshot: interviewVMInputRef.current.dodSnapshot,
        graphModel: interviewVMInputRef.current.graphModel,
        graphNodeRank: interviewVMInputRef.current.graphNodeRank,
        nodeMetaById: interviewVMInputRef.current.nodeMetaById,
      }), () => ({
        hash: interviewVMHash,
        timelineSteps: toArray(interviewVMInputRef.current.timelineView).length,
      })),
    [sid, interviewVMHash],
  );
  const interviewVMWarnings = useMemo(
    () => assertInterviewVMInvariants(interviewVM, { devMode: !!import.meta.env.DEV }),
    [interviewVM],
  );
  const interviewDebug = useMemo(() => {
    if (!import.meta.env.DEV) {
      return {
        generatedAt: "",
        warnings: [],
        flags: {},
        requestedMode: "",
        effectiveMode: "",
        graphStats: {},
        graphValidation: { summary: {}, issues: [] },
        mainlinePath: [],
        gatewayBlocks: [],
        loopMap: [],
        raw: {},
      };
    }
    const graphRef = interviewGraph && typeof interviewGraph === "object" ? interviewGraph : {};
    const nodesById = asObject(graphRef?.nodesById);
    const flowsById = asObject(graphRef?.flowsById);
    const outgoingByNode = asObject(graphRef?.outgoingByNode);
    const reachableSet = new Set(toArray(graphRef?.reachableNodeIds).map((id) => toText(id)).filter(Boolean));
    const nodeIds = Object.keys(nodesById);

    const detached = nodeIds
      .filter((nodeId) => !reachableSet.has(nodeId))
      .map((nodeId) => {
        const node = asObject(nodesById[nodeId]);
        const incomingCount = toArray(graphRef?.incomingByNode?.[nodeId]).length;
        const outgoingCount = toArray(outgoingByNode?.[nodeId]).length;
        let reason = "not_reachable_from_start";
        if (incomingCount === 0 && outgoingCount === 0) reason = "isolated_no_incoming_no_outgoing";
        else if (incomingCount === 0) reason = "no_incoming";
        else if (outgoingCount === 0) reason = "no_outgoing";
        return {
          nodeId,
          name: toText(node?.name || nodeMetaById?.[nodeId]?.title || nodeId),
          type: toText(node?.type || nodeMetaById?.[nodeId]?.kind || ""),
          incomingCount,
          outgoingCount,
          reason,
        };
      })
      .sort((a, b) => {
        const ar = Number(graphNodeRank?.[a.nodeId]);
        const br = Number(graphNodeRank?.[b.nodeId]);
        const av = Number.isFinite(ar) ? ar : Number.MAX_SAFE_INTEGER;
        const bv = Number.isFinite(br) ? br : Number.MAX_SAFE_INTEGER;
        if (av !== bv) return av - bv;
        return String(a.nodeId).localeCompare(String(b.nodeId));
      });

    const mainlinePath = toArray(interviewModel?.mainlineNodeIds).map((nodeIdRaw, index) => {
      const nodeId = toText(nodeIdRaw);
      const node = asObject(nodesById[nodeId]);
      return {
        index: index + 1,
        graphPath: toText(interviewModel?.graphNoByNodeId?.[nodeId]) || String(index + 1),
        nodeId,
        name: toText(node?.name || nodeMetaById?.[nodeId]?.title || nodeId),
        type: toText(node?.type || nodeMetaById?.[nodeId]?.kind || ""),
      };
    });

    function findFirstNodeId(nodes) {
      const list = toArray(nodes);
      for (let i = 0; i < list.length; i += 1) {
        const node = list[i];
        const kind = toText(node?.kind).toLowerCase();
        if (kind === "step" || kind === "terminal") return toText(node?.nodeId);
        if (kind === "continue") return toText(node?.targetNodeId);
        if (kind === "loop") return toText(node?.targetNodeId);
        if (kind === "decision" || kind === "parallel") {
          const nestedBranches = toArray(node?.branches);
          for (let b = 0; b < nestedBranches.length; b += 1) {
            const nestedHit = findFirstNodeId(nestedBranches[b]?.children);
            if (nestedHit) return nestedHit;
          }
        }
      }
      return "";
    }

    const loopMap = [];
    function collectLoopMap(nodes, anchorNodeId, branchKey, lastStepId = "") {
      toArray(nodes).forEach((node) => {
        const kind = toText(node?.kind).toLowerCase();
        const currentStepId = kind === "step" || kind === "terminal" ? toText(node?.nodeId) : lastStepId;
        if (kind === "loop") {
          loopMap.push({
            anchorNodeId: toText(anchorNodeId),
            branchKey: toText(branchKey),
            loopNodeId: toText(lastStepId || anchorNodeId),
            loopTargetId: toText(node?.targetNodeId),
            loopTargetGraphNo: toText(node?.targetGraphNo),
            loopTargetTitle: toText(node?.targetTitle),
          });
          return;
        }
        if (kind === "decision" || kind === "parallel") {
          toArray(node?.branches).forEach((branch) => {
            collectLoopMap(branch?.children, anchorNodeId, branchKey, currentStepId);
          });
          return;
        }
        collectLoopMap(node?.children, anchorNodeId, branchKey, currentStepId);
      });
    }

    const gatewayBlocks = [];
    toArray(timelineView).forEach((step) => {
      const between = asObject(step?.between_branches_item);
      if (toText(between?.kind).toLowerCase() !== "between_branches") return;
      const anchorNodeId = toText(between?.anchorGatewayId || step?.node_bind_id || step?.node_id);
      const previewByKey = {};
      toArray(step?.gateway_branch_previews).forEach((branch) => {
        const key = toText(branch?.key);
        if (key) previewByKey[key] = branch;
      });
      const branches = toArray(between?.branches).map((branch, branchIndex) => {
        const key = toText(branch?.key) || String.fromCharCode(65 + (branchIndex % 26));
        const preview = asObject(previewByKey[key]);
        const firstNodeId = toText(preview?.firstNodeId) || findFirstNodeId(branch?.children);
        const stopReason = toText(branch?.stopReason || preview?.stopReason) || "unknown";
        collectLoopMap(branch?.children, anchorNodeId, key, firstNodeId);
        return {
          key,
          label: toText(branch?.label) || `Branch ${key}`,
          condition: toText(preview?.condition || ""),
          flowId: toText(preview?.flowId || preview?.edgeKey || ""),
          firstNodeId,
          stopReason,
        };
      });
      gatewayBlocks.push({
        anchorNodeId,
        anchorGraphNo: toText(step?.seq_label || step?.seq),
        anchorTitle: toText(step?.action || step?.node_bind_title || anchorNodeId),
        nextMainlineId: toText(between?.nextMainlineNodeId || ""),
        fromGraphNo: toText(between?.fromGraphNo || ""),
        toGraphNo: toText(between?.toGraphNo || ""),
        branches,
      });
    });

    const loopSeen = new Set();
    const uniqueLoopMap = loopMap.filter((row) => {
      const key = `${toText(row?.anchorNodeId)}::${toText(row?.branchKey)}::${toText(row?.loopNodeId)}::${toText(row?.loopTargetId)}`;
      if (loopSeen.has(key)) return false;
      loopSeen.add(key);
      return true;
    });

    const graphStats = {
      nodeCount: nodeIds.length,
      flowCount: Object.keys(flowsById).length,
      startNodeIds: toArray(graphRef?.startNodeIds).map((id) => toText(id)).filter(Boolean),
      fallbackStartNodeIds: toArray(graphRef?.fallbackStartNodeIds).map((id) => toText(id)).filter(Boolean),
      reachableSeedMode: toText(graphRef?.reachableSeedMode),
      flowSourceMode: toText(graphRef?.flowSourceMode),
      endNodeIds: toArray(graphRef?.endNodeIds).map((id) => toText(id)).filter(Boolean),
      reachableCount: reachableSet.size,
      detachedCount: detached.length,
      detachedTop20: detached.slice(0, 20),
      detachedAll: detached,
    };

    return {
      generatedAt: new Date().toISOString(),
      warnings: toArray(interviewRenderState?.warnings).map((item) => toText(item)).filter(Boolean),
      flags: asObject(interviewRenderState?.flags),
      requestedMode: toText(interviewRenderState?.requestedMode),
      effectiveMode: toText(interviewRenderState?.effectiveMode),
      graphStats,
      graphValidation: {
        summary: asObject(graphValidation?.summary),
        issues: toArray(graphValidation?.issues),
      },
      mainlinePath,
      gatewayBlocks,
      loopMap: uniqueLoopMap,
      raw: {
        graph: graphRef,
        interviewModel,
        viewModel: {
          timelineView,
          timelineItems,
        },
      },
    };
  }, [interviewGraph, interviewModel, timelineView, timelineItems, nodeMetaById, graphNodeRank, interviewRenderState, graphValidation]);

  const xmlTextAnnotationsByStepId = useMemo(() => {
    const byStep = {};
    timelineView.forEach((step) => {
      const stepId = toText(step?.id);
      if (!stepId) return;
      const nodeId = toText(step?.node_bind_id || step?.node_id);
      const list = toArray(xmlTextAnnotationEntriesByNode?.[nodeId]).map((item, idx) => {
        const text = toText(item?.text);
        const annotationId = toText(item?.annotationId) || `${nodeId || stepId}_annotation_${idx + 1}`;
        return {
          annotationId,
          associationId: toText(item?.associationId),
          createdOrder: Number(item?.createdOrder) || idx + 1,
          text,
          titleLine: annotationTitleFromText(text, idx + 1),
          tree: parseAnnotationTree(text),
        };
      });
      byStep[stepId] = list;
    });
    return byStep;
  }, [timelineView, xmlTextAnnotationEntriesByNode]);

  const laneLinksByNode = useMemo(() => {
    const laneMeta = {};
    let laneCursor = 1;
    function ensureLaneMeta(laneNameRaw, laneKeyRaw, laneIdxRaw, laneColorRaw) {
      const laneName = toText(laneNameRaw) || "unassigned";
      const laneKey = toText(laneKeyRaw) || normalizeLoose(laneName) || "unassigned";
      const laneIdxParsed = Number(laneIdxRaw);
      const laneIdx = Number.isFinite(laneIdxParsed) && laneIdxParsed > 0 ? laneIdxParsed : laneCursor;
      if (!laneMeta[laneKey]) {
        laneMeta[laneKey] = {
          laneKey,
          laneName,
          laneIdx,
          laneColor: toText(laneColorRaw) || laneColor(laneKey, laneIdx),
        };
        laneCursor = Math.max(laneCursor, laneIdx + 1);
      } else {
        if (!laneMeta[laneKey].laneName && laneName) laneMeta[laneKey].laneName = laneName;
        if (!laneMeta[laneKey].laneColor && toText(laneColorRaw)) laneMeta[laneKey].laneColor = toText(laneColorRaw);
      }
      return laneMeta[laneKey];
    }

    const nodeLaneById = {};
    const stepLaneById = {};
    const stepIdsByNode = {};
    timelineView.forEach((step) => {
      const stepId = toText(step?.id);
      const nodeId = toText(step?.node_bind_id || step?.node_id);
      const laneName = toText(step?.lane_name) || "unassigned";
      const laneKey = toText(step?.lane_key) || normalizeLoose(laneName) || "unassigned";
      const meta = ensureLaneMeta(laneName, laneKey, step?.lane_idx, step?.lane_color);
      const laneInfo = {
        laneKey: meta.laneKey,
        laneName: meta.laneName,
        laneIdx: Number(step?.lane_idx) || meta.laneIdx,
        laneColor: toText(step?.lane_color) || meta.laneColor,
      };
      if (stepId) {
        stepLaneById[stepId] = laneInfo;
      }
      if (!nodeId) return;
      nodeLaneById[nodeId] = laneInfo;
      if (stepId) {
        if (!stepIdsByNode[nodeId]) stepIdsByNode[nodeId] = {};
        stepIdsByNode[nodeId][stepId] = true;
      }
    });

    backendNodes.forEach((node) => {
      const nodeId = toText(node?.id);
      if (!nodeId || nodeLaneById[nodeId]) return;
      const laneName = toText(node?.actorRole) || "unassigned";
      const laneKey = normalizeLoose(laneName) || "unassigned";
      const meta = ensureLaneMeta(laneName, laneKey);
      nodeLaneById[nodeId] = { ...meta };
    });

    const incomingByNodeSet = {};
    const outgoingByNodeSet = {};
    const incomingByStepSet = {};
    const outgoingByStepSet = {};

    function addByNode(map, nodeId, laneInfo) {
      if (!nodeId) return;
      if (!map[nodeId]) map[nodeId] = {};
      map[nodeId][laneInfo.laneKey] = laneInfo;
    }

    function addByStep(map, stepId, laneInfo) {
      if (!stepId) return;
      if (!map[stepId]) map[stepId] = {};
      map[stepId][laneInfo.laneKey] = laneInfo;
    }

    function addByNodeAndSteps(nodeMap, stepMap, nodeId, laneInfo) {
      addByNode(nodeMap, nodeId, laneInfo);
      Object.keys(stepIdsByNode[nodeId] || {}).forEach((stepId) => addByStep(stepMap, stepId, laneInfo));
    }

    backendEdges.forEach((e) => {
      const fromId = toText(e?.from_id);
      const toId = toText(e?.to_id);
      if (!fromId || !toId || fromId === toId) return;
      const fromStep = nodeLaneById[fromId];
      const toStep = nodeLaneById[toId];
      if (!fromStep || !toStep) return;
      if (fromStep.laneKey === toStep.laneKey) return;
      addByNodeAndSteps(outgoingByNodeSet, outgoingByStepSet, fromId, toStep);
      addByNodeAndSteps(incomingByNodeSet, incomingByStepSet, toId, fromStep);
    });

    for (let i = 0; i < timelineView.length - 1; i += 1) {
      const fromStep = timelineView[i];
      const toStep = timelineView[i + 1];
      const fromStepId = toText(fromStep?.id);
      const toStepId = toText(toStep?.id);
      const fromId = toText(fromStep?.node_bind_id || fromStep?.node_id);
      const toId = toText(toStep?.node_bind_id || toStep?.node_id);
      const fromLane = fromId ? nodeLaneById[fromId] : stepLaneById[fromStepId];
      const toLane = toId ? nodeLaneById[toId] : stepLaneById[toStepId];
      if (!fromLane || !toLane) continue;
      if (fromLane.laneKey === toLane.laneKey) continue;
      if (fromId) addByNodeAndSteps(outgoingByNodeSet, outgoingByStepSet, fromId, toLane);
      if (toId) addByNodeAndSteps(incomingByNodeSet, incomingByStepSet, toId, fromLane);
      addByStep(outgoingByStepSet, fromStepId, toLane);
      addByStep(incomingByStepSet, toStepId, fromLane);
    }

    function sortedList(entry) {
      return Object.values(entry || {}).sort((a, b) => {
        const ai = Number(a?.laneIdx);
        const bi = Number(b?.laneIdx);
        if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
        return String(a?.laneName || "").localeCompare(String(b?.laneName || ""), "ru");
      });
    }

    const incomingByNode = {};
    const outgoingByNode = {};
    const incomingByStep = {};
    const outgoingByStep = {};
    Object.keys(nodeLaneById).forEach((nodeId) => {
      incomingByNode[nodeId] = sortedList(incomingByNodeSet[nodeId]);
      outgoingByNode[nodeId] = sortedList(outgoingByNodeSet[nodeId]);
    });
    Object.keys(stepLaneById).forEach((stepId) => {
      incomingByStep[stepId] = sortedList(incomingByStepSet[stepId]);
      outgoingByStep[stepId] = sortedList(outgoingByStepSet[stepId]);
    });

    return { incomingByNode, outgoingByNode, incomingByStep, outgoingByStep };
  }, [timelineView, backendEdges, backendNodes]);

  const summary = useMemo(() => {
    const totalSec = Number(asObject(dodSnapshot?.time).processTotalSec || 0);
    const waitSec = Number(asObject(dodSnapshot?.time).waitTotalSec || 0);
    const active = Math.round(totalSec / 60);
    const wait = Math.round(waitSec / 60);
    return { active, wait, lead: active + wait };
  }, [dodSnapshot]);

  const pathMetrics = useMemo(() => {
    const steps = toArray(timelineView);
    const work_time_total_sec = steps.reduce((acc, step) => acc + (parseStepWorkDurationSec(step) || 0), 0);
    const wait_time_total_sec = steps.reduce((acc, step) => acc + (parseStepWaitDurationSec(step) || 0), 0);
    const total_time_sec = work_time_total_sec + wait_time_total_sec;
    return {
      steps_count: steps.length,
      work_time_total_sec,
      wait_time_total_sec,
      total_time_sec,
      work_hhmm: formatHHMMFromSeconds(work_time_total_sec),
      wait_hhmm: formatHHMMFromSeconds(wait_time_total_sec),
      total_hhmm: formatHHMMFromSeconds(total_time_sec),
    };
  }, [timelineView]);

  const topWaits = useMemo(() => {
    return toArray(dodSnapshot?.steps)
      .map((step) => ({
        id: toText(step?.stepId),
        seq: toText(step?.graph?.graphNo || step?.index),
        action: toText(step?.title),
        wait: Math.round(Number(step?.waitSec || 0) / 60),
      }))
      .filter((x) => x.wait > 0)
      .sort((a, b) => b.wait - a.wait || String(a.seq).localeCompare(String(b.seq), "ru", { numeric: true }))
      .slice(0, 3);
  }, [dodSnapshot]);

  const extendedAnalytics = useMemo(() => {
    const snapshotSteps = toArray(dodSnapshot?.steps);
    const stepCount = Number(asObject(dodSnapshot?.counts)?.interview?.stepsTotal || snapshotSteps.length);
    const boundStepCount = Number(asObject(dodSnapshot?.counts)?.interview?.stepsBoundToBpmn || 0);
    const waitStepCount = snapshotSteps.filter((x) => Number(x?.waitSec || 0) > 0).length;
    const lead = summary.lead;

    const byType = {};
    snapshotSteps.forEach((step) => {
      const typeKey = toText(step?.bpmn?.nodeType || step?.type || "operation");
      if (!byType[typeKey]) {
        byType[typeKey] = { key: typeKey, label: typeLabel(typeKey), count: 0, active: 0, wait: 0, lead: 0, sharePct: 0 };
      }
      const durMin = Math.round(Number(step?.durationSec || 0) / 60);
      const waitMin = Math.round(Number(step?.waitSec || 0) / 60);
      byType[typeKey].count += 1;
      byType[typeKey].active += durMin;
      byType[typeKey].wait += waitMin;
      byType[typeKey].lead += durMin + waitMin;
    });
    const typeStats = Object.values(byType).map((x) => ({ ...x, sharePct: percent(x.count, stepCount) }))
      .sort((a, b) => b.count - a.count || b.lead - a.lead || String(a.label).localeCompare(String(b.label)));
    const laneStats = toArray(dodSnapshot?.lanes).map((lane) => {
      const leadMin = Math.round(Number(lane?.timeTotalSec || 0) / 60);
      return {
        key: toText(lane?.laneId),
        name: toText(lane?.laneName) || "unassigned",
        count: Number(lane?.stepsCount || 0),
        active: leadMin,
        wait: 0,
        lead: leadMin,
        sharePct: percent(Number(lane?.stepsCount || 0), stepCount),
      };
    });
    const subprocessStats = toArray(dodSnapshot?.subprocesses).map((sp) => {
      const leadMin = Math.round(Number(sp?.timeTotalSec || 0) / 60);
      return {
        key: toText(sp?.subprocessId),
        name: toText(sp?.title),
        count: Number(sp?.stepsCount || 0),
        active: leadMin,
        wait: 0,
        lead: leadMin,
        sharePct: percent(Number(sp?.stepsCount || 0), stepCount),
      };
    });

    const aiTotal = Number(asObject(dodSnapshot?.counts)?.interview?.aiQuestionsTotal || 0);
    const aiConfirmed = Number(asObject(dodSnapshot?.counts)?.interview?.aiQuestionsDoneTotal || 0);
    const aiClarify = 0;
    const aiUnknown = Math.max(0, aiTotal - aiConfirmed);
    const aiStepCoverageCount = snapshotSteps.filter((step) => Number(asObject(step?.ai).questionsCount || 0) > 0).length;

    const exceptionAddMinTotal = toArray(data.exceptions).reduce((acc, x) => acc + toNonNegativeInt(x?.add_min), 0);
    const boundaryKeys = ["trigger", "start_shop", "intermediate_roles", "finish_state", "finish_shop"];
    const boundariesFilled = boundaryKeys.reduce((acc, key) => (toText(data?.boundaries?.[key]) ? acc + 1 : acc), 0);

    const maxDurationStep = [...snapshotSteps]
      .map((step) => ({
        seq: toText(step?.graph?.graphNo || step?.index),
        duration: Math.round(Number(step?.durationSec || 0) / 60),
      }))
      .sort((a, b) => b.duration - a.duration || String(a.seq).localeCompare(String(b.seq), "ru", { numeric: true }))[0] || null;
    const maxWaitStep = [...snapshotSteps]
      .map((step) => ({
        seq: toText(step?.graph?.graphNo || step?.index),
        wait: Math.round(Number(step?.waitSec || 0) / 60),
      }))
      .sort((a, b) => b.wait - a.wait || String(a.seq).localeCompare(String(b.seq), "ru", { numeric: true }))[0] || null;

    return {
      stepCount,
      boundStepCount,
      bindCoveragePct: percent(boundStepCount, stepCount),
      waitStepCount,
      waitStepSharePct: percent(waitStepCount, stepCount),
      activeSharePct: percent(summary.active, lead),
      waitSharePct: percent(summary.wait, lead),
      avgLeadPerStepMin: stepCount ? round1(lead / stepCount) : 0,
      stepsPerHour: lead > 0 ? round1((stepCount * 60) / lead) : 0,
      typeStats,
      laneStats,
      subprocessStats,
      aiTotal,
      aiConfirmed,
      aiClarify,
      aiUnknown,
      aiStepCoverageCount,
      aiStepCoveragePct: percent(aiStepCoverageCount, stepCount),
      boundariesFilled,
      boundariesTotal: boundaryKeys.length,
      boundariesCoveragePct: percent(boundariesFilled, boundaryKeys.length),
      exceptionAddMinTotal,
      maxDurationStep,
      maxWaitStep,
    };
  }, [dodSnapshot, summary, data.exceptions, data.boundaries]);

  const intermediateRolesAuto = useMemo(() => {
    const chain = [];
    const seen = new Set();
    timelineView.forEach((step) => {
      const name = toText(step?.lane_name || step?.role || step?.area);
      if (!name) return;
      const key = normalizeLoose(name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      chain.push(name);
    });
    if (chain.length <= 2) return "";
    const mid = chain.slice(1, -1);
    return mid.join(", ");
  }, [timelineView]);

  const nodeBindOptionsByStepId = useMemo(() => {
    const stepLike = backendNodes.filter((n) => {
      const t = toText(n?.nodeType).toLowerCase();
      return t === "step" || t === "message" || t === "timer" || t === "event_virtual";
    });
    const byId = {};
    stepLike.forEach((n) => {
      byId[n.id] = n;
    });
    const usedIds = new Set(
      timelineView
        .map((step) => toText(step?.node_bind_id || step?.node_id))
        .filter((id) => id && byId[id]),
    );

    const mapByStep = {};
    timelineView.forEach((step) => {
      const stepId = toText(step?.id);
      if (!stepId) return;
      const curId = toText(step?.node_bind_id || step?.node_id);
      const actionKey = normalizeLoose(step?.action);
      const out = [];
      const seen = new Set();

      stepLike.forEach((n) => {
        const id = toText(n?.id);
        if (!id || seen.has(id)) return;
        const byTitle = actionKey && normalizeLoose(n?.title) === actionKey;
        if (!(id === curId || usedIds.has(id) || byTitle)) return;
        seen.add(id);
        const icon = nodeKindIcon(n?.bpmnKind);
        const title = toText(n?.title);
        const actor = toText(n?.actorRole);
        const kind = toText(n?.bpmnKind) || toText(n?.nodeType) || "task";
        const suffix = [title, actor].filter(Boolean).join(" · ");
        out.push({
          id,
          label: `${icon} ${suffix ? `${title} · ${actor}` : title || id}`,
          kind,
          missing: false,
        });
      });

      if (curId && !seen.has(curId)) {
        seen.add(curId);
        out.push({ id: curId, label: `□ ${curId} — вне текущей диаграммы`, kind: "missing", missing: true });
      }

      out.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
      mapByStep[stepId] = out;
    });

    return mapByStep;
  }, [backendNodes, timelineView]);

  const annotationSyncByStepId = useMemo(() => {
    return buildAnnotationSyncByStepId(timelineView, xmlTextAnnotationsByNode);
  }, [timelineView, xmlTextAnnotationsByNode]);

  const aiRows = useMemo(() => {
    const rows = [];
    timelineView.forEach((step) => {
      const list = toArray(data.ai_questions[step.id]);
      list.forEach((q) => {
        rows.push({
          stepId: step.id,
          seq: step.seq,
          type: step.type,
          stepTitle: toText(step.action),
          id: q.id,
          text: q.text,
          status: q.status,
        });
      });
    });
    return rows;
  }, [timelineView, data.ai_questions]);

  const aiQuestionsByElement = useMemo(
    () => normalizeAiQuestionsByElementMap(data?.ai_questions_by_element || data?.aiQuestionsByElementId),
    [data?.ai_questions_by_element, data?.aiQuestionsByElementId],
  );

  const aiQuestionMetaByStepId = useMemo(() => {
    const byStepId = {};

    timelineView.forEach((step) => {
      const stepId = toText(step?.id);
      if (!stepId) return;
      byStepId[stepId] = {
        stepId,
        count: 0,
        attachedCount: 0,
        hasAi: false,
      };
    });

    Object.keys(asObject(data?.ai_questions)).forEach((stepIdRaw) => {
      const stepId = toText(stepIdRaw);
      if (!stepId) return;
      const list = toArray(data?.ai_questions?.[stepId]).filter((q) => !!toText(q?.text));
      if (!byStepId[stepId]) {
        byStepId[stepId] = {
          stepId,
          count: 0,
          attachedCount: 0,
          hasAi: false,
        };
      }
      byStepId[stepId].count = Math.max(byStepId[stepId].count, list.length);
    });

    const attachedCountByStepId = {};
    const attachedCountByNodeId = {};
    Object.keys(aiQuestionsByElement).forEach((elementIdRaw) => {
      const elementId = toText(elementIdRaw);
      if (!elementId) return;
      const list = toArray(aiQuestionsByElement[elementId]).filter((item) => !!toText(item?.text));
      if (!list.length) return;
      attachedCountByNodeId[elementId] = (attachedCountByNodeId[elementId] || 0) + list.length;
      list.forEach((item) => {
        const stepId = toText(item?.stepId || item?.step_id);
        if (!stepId) return;
        attachedCountByStepId[stepId] = (attachedCountByStepId[stepId] || 0) + 1;
      });
    });

    timelineView.forEach((step) => {
      const stepId = toText(step?.id);
      if (!stepId) return;
      const nodeId = toText(step?.node_bind_id || step?.node_id);
      if (!byStepId[stepId]) {
        byStepId[stepId] = {
          stepId,
          count: 0,
          attachedCount: 0,
          hasAi: false,
        };
      }
      const byStepAttach = Number(attachedCountByStepId[stepId] || 0);
      const byNodeAttach = nodeId ? Number(attachedCountByNodeId[nodeId] || 0) : 0;
      const attachedCount = Math.max(byStepAttach, byNodeAttach);
      byStepId[stepId].attachedCount = Math.max(byStepId[stepId].attachedCount, attachedCount);
      byStepId[stepId].count = Math.max(byStepId[stepId].count, attachedCount);
    });

    Object.keys(byStepId).forEach((stepId) => {
      const current = byStepId[stepId];
      byStepId[stepId] = {
        ...current,
        hasAi: Number(current?.count || 0) > 0,
      };
    });
    return byStepId;
  }, [timelineView, data?.ai_questions, aiQuestionsByElement]);

  const aiQuestionsDiagramSyncByStepId = useMemo(() => {
    const flattened = [];
    Object.keys(aiQuestionsByElement || {}).forEach((elementId) => {
      toArray(aiQuestionsByElement[elementId]).forEach((item) => {
        flattened.push({
          elementId: toText(elementId),
          qid: toText(item?.qid || item?.id),
          text: toText(item?.text),
          stepId: toText(item?.stepId || item?.step_id),
        });
      });
    });
    const out = {};
    timelineView.forEach((step) => {
      const stepId = toText(step?.id);
      if (!stepId) return;
      const selected = toArray(data?.ai_questions?.[stepId])
        .filter((q) => !!q?.on_diagram)
        .map((q) => ({
          qid: toText(q?.qid || q?.id),
          text: toText(q?.text),
        }))
        .filter((q) => q.qid || q.text);
      const missing = selected.filter((q) => {
        const qNorm = normalizeLoose(q.text);
        if (!qNorm) return true;
        return !flattened.some((item) => {
          if (toText(item?.stepId) === stepId) {
            if (q.qid && toText(item?.qid) === q.qid) return true;
            if (normalizeLoose(item?.text) === qNorm) return true;
          }
          if (q.qid && toText(item?.qid) === q.qid) return true;
          return normalizeLoose(item?.text) === qNorm;
        });
      });
      const attachedElementIds = [];
      flattened.forEach((item) => {
        const sidMatch = toText(item?.stepId) === stepId;
        const textMatch = selected.some((q) => normalizeLoose(q.text) && normalizeLoose(q.text) === normalizeLoose(item?.text));
        const idMatch = selected.some((q) => q.qid && q.qid === toText(item?.qid));
        if (!(sidMatch || textMatch || idMatch)) return;
        if (!item.elementId) return;
        if (attachedElementIds.includes(item.elementId)) return;
        attachedElementIds.push(item.elementId);
      });

      out[stepId] = {
        stepId,
        selectedCount: selected.length,
        presentCount: Math.max(0, selected.length - missing.length),
        missing,
        allPresent: selected.length > 0 && missing.length === 0,
        attachedElementIds,
        attachedElementsCount: attachedElementIds.length,
      };
    });
    return out;
  }, [timelineView, data.ai_questions, aiQuestionsByElement]);

  const timelineLaneOptions = useMemo(() => {
    const byKey = {};
    const byNameKey = {};
    function registerLane(entry) {
      const laneName = toText(entry?.name);
      const laneKey = toText(entry?.key);
      const nameKey = normalizeLoose(laneName);
      let targetKey = "";
      if (laneKey && byKey[laneKey]) {
        targetKey = laneKey;
      } else if (nameKey && byNameKey[nameKey]) {
        targetKey = byNameKey[nameKey];
      } else {
        targetKey = laneKey || (nameKey ? `name::${nameKey}` : "");
      }
      if (!targetKey) return;

      const laneIdx = Number(entry?.idx) || 0;
      const laneColorValue = toText(entry?.color) || laneColor(targetKey, laneIdx || 0);
      const laneLabelValue = toText(entry?.label) || laneLabel(laneName, laneIdx || 0);

      if (!byKey[targetKey]) {
        byKey[targetKey] = {
          key: targetKey,
          name: laneName,
          idx: laneIdx,
          color: laneColorValue,
          label: laneLabelValue,
        };
      } else {
        const cur = byKey[targetKey];
        if (!cur.name && laneName) cur.name = laneName;
        if (!cur.idx && laneIdx) cur.idx = laneIdx;
        if (!cur.color && laneColorValue) cur.color = laneColorValue;
        if (!cur.label && laneLabelValue) cur.label = laneLabelValue;
      }

      if (laneKey) byNameKey[laneKey] = targetKey;
      if (nameKey) byNameKey[nameKey] = targetKey;
    }

    timelineView.forEach((step) => {
      registerLane({
        key: toText(step?.lane_key) || "",
        name: toText(step?.lane_name),
        idx: Number(step?.lane_idx) || 0,
        color: toText(step?.lane_color),
        label: laneLabel(step?.lane_name, step?.lane_idx),
      });
    });
    toArray(actorNames)
      .map((x) => toText(x))
      .filter(Boolean)
      .forEach((name, idx) => {
        registerLane({
          key: normalizeLoose(name) || `lane_${idx + 1}`,
          name,
          idx: idx + 1,
          color: laneColor(name, idx + 1),
          label: laneLabel(name, idx + 1),
        });
      });
    const ordered = Object.values(byKey).sort((a, b) => {
      if (a.idx !== b.idx) return a.idx - b.idx;
      return a.name.localeCompare(b.name, "ru");
    });
    const seen = new Set();
    return ordered.filter((lane) => {
      const key = normalizeLoose(lane?.label || lane?.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [timelineView, actorNames]);

  const boundaryLaneOptions = useMemo(() => {
    const map = new Map();
    function registerLane(entry) {
      const laneName = toText(entry.name);
      const normalizedName = normalizeLoose(laneName);
      const normalizedAlias = normalizeLoose(entry.normalized || "");
      if (!laneName && !normalizedAlias) return;
      const normalized = normalizedName || normalizedAlias || `lane_${map.size + 1}`;
      const laneIdx = Number.isFinite(Number(entry.idx)) && Number(entry.idx) > 0 ? Number(entry.idx) : map.size + 1;
      if (!map.has(normalized)) {
        map.set(normalized, {
          name: laneName,
          key: normalized,
          idx: laneIdx,
          color: entry.color || laneColor(normalized, laneIdx),
          label: entry.label || laneLabel(laneName, entry.idx),
        });
        return;
      }
      const existing = map.get(normalized);
      if (!existing) return;
      if (!existing.color && entry.color) existing.color = entry.color;
      if (entry.label) existing.label = entry.label;
      if (laneIdx && (!existing.idx || laneIdx < existing.idx)) existing.idx = laneIdx;
    }

    timelineView.forEach((step) => {
      const name = toText(step?.lane_name);
      if (!name) return;
      registerLane({
        name,
        normalized: toText(step?.lane_key) || "",
        idx: step?.lane_idx,
        color: toText(step?.lane_color) || laneColor(name, step?.lane_idx || 0),
        label: laneLabel(name, step?.lane_idx),
      });
    });

    toArray(actorNames)
      .map((x) => toText(x))
      .filter(Boolean)
      .forEach((name, idx) => {
        registerLane({
          name,
          normalized: normalizeLoose(name),
          idx: idx + 1,
          color: laneColor(name, idx + 1),
          label: laneLabel(name, idx + 1),
        });
      });

    const out = Array.from(map.values());
    out.sort((a, b) => {
      if (a.idx !== b.idx) return a.idx - b.idx;
      return a.name.localeCompare(b.name);
    });
    return out;
  }, [timelineView, actorNames]);

  const boundaryLaneOptionsFiltered = useMemo(() => {
    const q = normalizeLoose(boundariesLaneFilter);
    if (!q) return boundaryLaneOptions;
    return boundaryLaneOptions.filter((x) => normalizeLoose(x.label).includes(q) || normalizeLoose(x.name).includes(q));
  }, [boundaryLaneOptions, boundariesLaneFilter]);

  const timelineSubprocessOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    timelineView.forEach((step) => {
      const sp = toText(step?.subprocess);
      if (!sp) return;
      const k = normalizeLoose(sp);
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(sp);
    });
    return out;
  }, [timelineView]);

  const deferredTimelineQuery = useDeferredValue(toText(timelineFilters?.query));

  const filteredTimelineView = useMemo(() => {
    const q = normalizeLoose(deferredTimelineQuery);
    const laneFilter = toText(timelineFilters.lane);
    const laneFilters = toArray(timelineFilters.lanes).map((item) => toText(item)).filter(Boolean);
    const typeFilter = String(timelineFilters.type || "all").toLowerCase();
    const spFilter = normalizeLoose(timelineFilters.subprocess);
    const bindFilter = String(timelineFilters.bind || "all").toLowerCase();
    const annotationFilter = String(timelineFilters.annotation || "all").toLowerCase();
    const aiFilter = String(timelineFilters.ai || "all").toLowerCase();

    return timelineView.filter((step) => {
      const stepId = toText(step?.id);
      const xmlAnnotations = toArray(xmlTextAnnotationsByStepId?.[stepId]);
      const hasAnnotation = xmlAnnotations.length > 0 || !!toText(step?.comment);
      const aiMeta = aiQuestionMetaByStepId?.[stepId];
      const hasAi = Number(aiMeta?.count || 0) > 0;
      if (laneFilters.length) {
        const stepLaneKey = toText(step?.lane_key) || normalizeLoose(step?.lane_name);
        const stepLaneName = toText(step?.lane_name);
        const laneMatched = laneFilters.some((laneValue) => {
          const val = toText(laneValue);
          if (!val) return false;
          return (
            stepLaneKey === val
            || stepLaneName === val
            || normalizeLoose(stepLaneName) === normalizeLoose(val)
          );
        });
        if (!laneMatched) return false;
      } else if (laneFilter && laneFilter !== "all") {
        const stepLaneKey = toText(step?.lane_key) || normalizeLoose(step?.lane_name);
        const stepLaneName = toText(step?.lane_name);
        if (stepLaneKey !== laneFilter && stepLaneName !== laneFilter && normalizeLoose(stepLaneName) !== normalizeLoose(laneFilter)) return false;
      }
      if (typeFilter && typeFilter !== "all" && String(step?.type || "").toLowerCase() !== typeFilter) return false;
      if (spFilter && spFilter !== "all" && normalizeLoose(step?.subprocess) !== spFilter) return false;
      if (bindFilter === "bound" && !step?.node_bound) return false;
      if (bindFilter === "missing" && step?.node_bound) return false;
      if (annotationFilter === "with" && !hasAnnotation) return false;
      if (annotationFilter === "without" && hasAnnotation) return false;
      if (aiFilter === "with" && !hasAi) return false;
      if (aiFilter === "without" && hasAi) return false;
      if (q) {
        const hay = [
          step?.action,
          step?.comment,
          step?.node_bind_id,
          step?.node_bind_title,
          step?.subprocess,
          step?.role,
          step?.area,
          step?.output,
          xmlAnnotations.map((item) => toText(item?.text)).join(" "),
        ]
          .map((x) => normalizeLoose(x))
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [timelineView, timelineFilters, deferredTimelineQuery, xmlTextAnnotationsByStepId, aiQuestionMetaByStepId]);

  const transitionView = useMemo(() => {
    const byNode = {};
    backendNodes.forEach((n) => {
      const id = toText(n?.id);
      if (!id) return;
      byNode[id] = {
        title: toText(n?.title) || id,
        lane: toText(n?.actorRole),
      };
    });
    timelineView.forEach((s) => {
      const id = toText(s?.node_bind_id || s?.node_id);
      if (!id) return;
      const cur = byNode[id] || {};
      byNode[id] = {
        title: toText(s?.action) || cur.title || id,
        lane: toText(s?.lane_name) || cur.lane || "",
      };
    });

    const graphNoByNodeId = {};
    timelineView.forEach((s) => {
      const nodeId = toText(s?.node_bind_id || s?.node_id);
      if (!nodeId || graphNoByNodeId[nodeId]) return;
      graphNoByNodeId[nodeId] = toText(s?.seq_label || s?.seq);
    });

    const transitionByKey = {};
    toArray(data.transitions).forEach((tr, idx) => {
      const fromId = toText(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId);
      const toId = toText(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId);
      if (!fromId || !toId) return;
      transitionByKey[`${fromId}__${toId}`] = {
        id: toText(tr?.id) || `tr_${idx + 1}`,
        from_node_id: fromId,
        to_node_id: toId,
        when: toText(tr?.when || tr?.label || ""),
      };
    });

    const out = [];
    const seen = new Set();
    backendEdges.forEach((e, idx) => {
      const fromId = toText(e?.from_id);
      const toId = toText(e?.to_id);
      if (!fromId || !toId) return;
      const key = `${fromId}__${toId}`;
      if (seen.has(key)) return;
      seen.add(key);
      const own = transitionByKey[key];
      out.push({
        id: own?.id || `edge_${idx + 1}`,
        key,
        from_node_id: fromId,
        to_node_id: toId,
        from_graph_no: toText(graphNoByNodeId[fromId]),
        to_graph_no: toText(graphNoByNodeId[toId]),
        from_title: toText(byNode[fromId]?.title) || fromId,
        to_title: toText(byNode[toId]?.title) || toId,
        from_lane: toText(byNode[fromId]?.lane),
        to_lane: toText(byNode[toId]?.lane),
        when: own ? toText(own.when) : toText(e?.when),
      });
    });

    Object.values(transitionByKey).forEach((tr) => {
      const key = `${tr.from_node_id}__${tr.to_node_id}`;
      if (seen.has(key)) return;
      out.push({
        id: tr.id || key,
        key,
        from_node_id: tr.from_node_id,
        to_node_id: tr.to_node_id,
        from_graph_no: toText(graphNoByNodeId[tr.from_node_id]),
        to_graph_no: toText(graphNoByNodeId[tr.to_node_id]),
        from_title: toText(byNode[tr.from_node_id]?.title) || tr.from_node_id,
        to_title: toText(byNode[tr.to_node_id]?.title) || tr.to_node_id,
        from_lane: toText(byNode[tr.from_node_id]?.lane),
        to_lane: toText(byNode[tr.to_node_id]?.lane),
        when: toText(tr.when),
      });
    });

    const rankFor = (nodeId) => {
      const r = Number(graphNodeRank[nodeId]);
      return Number.isFinite(r) ? r : Number.MAX_SAFE_INTEGER;
    };

    out.sort((a, b) => {
      const ar = rankFor(a.from_node_id);
      const br = rankFor(b.from_node_id);
      if (ar !== br) return ar - br;
      const at = rankFor(a.to_node_id);
      const bt = rankFor(b.to_node_id);
      if (at !== bt) return at - bt;
      return String(a.key).localeCompare(String(b.key));
    });
    return out;
  }, [backendEdges, backendNodes, data.transitions, graphNodeRank, timelineView]);

  const visibleTimelineOptionalCols = useMemo(
    () => TIMELINE_OPTIONAL_COLUMNS.filter((col) => !hiddenTimelineCols[col.key]),
    [hiddenTimelineCols],
  );
  const timelineColSpan = 3 + visibleTimelineOptionalCols.length;

  const isTimelineFiltering = useMemo(() => {
    const f = timelineFilters;
    const tierFilters = toArray(f.tiers).map((tier) => {
      const t = toText(tier).toUpperCase();
      if (t === "NONE") return "None";
      return t;
    });
    const tierFilterActive = tierFilters.length > 0
      && !(tierFilters.includes("P0") && tierFilters.includes("P1") && tierFilters.includes("P2") && tierFilters.includes("None"));
    return !!(
      toText(f.query) ||
      toArray(f.lanes).some((lane) => toText(lane)) ||
      (toText(f.lane) && toText(f.lane) !== "all") ||
      (toText(f.type) && toText(f.type) !== "all") ||
      (toText(f.subprocess) && toText(f.subprocess) !== "all") ||
      (toText(f.bind) && toText(f.bind) !== "all") ||
      (toText(f.annotation) && toText(f.annotation) !== "all") ||
      (toText(f.ai) && toText(f.ai) !== "all") ||
      tierFilterActive
    );
  }, [timelineFilters]);

  useEffect(() => {
    if (!shouldDebugLoopTrace()) return;
    const now = Date.now();
    if (!recalcWindowRef.current.ts) {
      recalcWindowRef.current = { ts: now, count: recalcCountRef.current };
    }
    const elapsed = now - Number(recalcWindowRef.current.ts || now);
    if (elapsed >= 2000) {
      const diff = recalcCountRef.current - Number(recalcWindowRef.current.count || 0);
      // eslint-disable-next-line no-console
      console.debug(
        `[INTERVIEW_DERIVED] sid=${sid || "-"} recalcs_2s=${diff} steps=${timelineView.length} `
        + `filtered=${filteredTimelineView.length} transitions=${transitionView.length} order=${orderMode}`,
      );
      if (typeof window !== "undefined") {
        const perfStore = window.__FPC_INTERVIEW_PERF__ && typeof window.__FPC_INTERVIEW_PERF__ === "object"
          ? window.__FPC_INTERVIEW_PERF__
          : null;
        if (perfStore) {
          const top = Object.entries(perfStore)
            .map(([name, row]) => ({
              name,
              avgMs: Number(asObject(row)?.avgMs || 0),
              maxMs: Number(asObject(row)?.maxMs || 0),
              count: Number(asObject(row)?.count || 0),
            }))
            .sort((a, b) => b.avgMs - a.avgMs || b.maxMs - a.maxMs)
            .slice(0, 5);
          if (top.length) {
            // eslint-disable-next-line no-console
            console.debug(
              `[INTERVIEW_PERF_TOP] ${top.map((item) => `${item.name} avg=${item.avgMs.toFixed(1)}ms max=${item.maxMs.toFixed(1)}ms n=${item.count}`).join(" | ")}`,
            );
          }
        }
      }
      if (diff > 60) {
        // eslint-disable-next-line no-console
        console.warn(
          `[INTERVIEW_DERIVED_LOOP_WARN] sid=${sid || "-"} recalcs_2s=${diff} `
          + `filtersHash=${quickHash(JSON.stringify(timelineFilters || {}))} hiddenColsHash=${quickHash(JSON.stringify(hiddenTimelineCols || {}))}`,
        );
      }
      recalcWindowRef.current = { ts: now, count: recalcCountRef.current };
      return;
    }
    if (recalcCountRef.current % 25 === 0) {
      // eslint-disable-next-line no-console
      console.debug(
        `[INTERVIEW_DERIVED] sid=${sid || "-"} count=${recalcCountRef.current} steps=${timelineView.length} `
        + `filtersHash=${quickHash(JSON.stringify(timelineFilters || {}))}`,
      );
    }
  }, [
    sid,
    orderMode,
    timelineView.length,
    filteredTimelineView.length,
    transitionView.length,
    timelineFilters,
    hiddenTimelineCols,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const snapshotStepCount = Number(asObject(dodSnapshot?.counts)?.interview?.stepsTotal || 0);
    const timelineStepCount = Number(timelineView.length || 0);
    if (snapshotStepCount > 0 && timelineStepCount > 0 && Math.abs(snapshotStepCount - timelineStepCount) > 3) {
      // eslint-disable-next-line no-console
      console.warn(
        `[DOD_SNAPSHOT_WARN] sid=${sid || "-"} snapshot_steps=${snapshotStepCount} timeline_steps=${timelineStepCount} reason=possible_legacy_counts`,
      );
    }
  }, [dodSnapshot, timelineView.length, sid]);

  return {
    boundariesComplete,
    laneByNodeFromXml,
    nodeKindByIdFromXml,
    virtualEventNodes,
    backendNodes,
    backendEdges,
    xmlNodeOrder,
    bpmnOrderMeta,
    bpmnOrderUnavailable,
    bpmnOrderFallback,
    bpmnOrderHint,
    graphNodeOrder,
    graphNodeRank,
    orderMode,
    graphOrderLocked,
    dodSnapshot,
    subprocessCatalog,
    interviewGraph,
    interviewCanonicalModel,
    interviewVM,
    interviewVMWarnings,
    interviewDebug,
    timelineTimeSummary: interviewRenderState.mainlineTimeSummary,
    timelineView,
    timelineItems,
    laneLinksByNode,
    summary,
    pathMetrics,
    topWaits,
    extendedAnalytics,
    intermediateRolesAuto,
    nodeBindOptionsByStepId,
    aiRows,
    aiQuestionMetaByStepId,
    aiQuestionsDiagramSyncByStepId,
    annotationSyncByStepId,
    xmlTextAnnotationsByStepId,
    timelineLaneOptions,
    boundaryLaneOptions,
    boundaryLaneOptionsFiltered,
    timelineSubprocessOptions,
    filteredTimelineView,
    transitionView,
    visibleTimelineOptionalCols,
    timelineColSpan,
    isTimelineFiltering,
  };
}
