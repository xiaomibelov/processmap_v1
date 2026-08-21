import { useMemo } from "react";
import {
  asArray,
  asObject,
  toNodeId,
} from "../../../lib/processStageDomain";
import {
  toText,
} from "../../../stage/utils/processStageHelpers";
import {
  buildRobotMetaStatusByElementId,
  normalizeRobotMetaMap,
} from "../../../robotmeta/robotMeta";
import { normalizeHybridLayerMap } from "../../../hybrid/hybridLayerUi";
import {
  normalizeFlowTierMetaMap,
  normalizeNodePathMetaMap,
} from "../../../stage/utils/processStageHelpers";
import {
  buildBpmnMetaVersionKey,
  buildHybridLayerVersionKey,
  buildNodesVersionKey,
} from "./diagramDerivedModelHash";

export default function useDiagramElementMetaModel({ bpmnMeta, nodes, hybridLayerByElementId }) {
  // Stable primitive keys for memoization
  const bpmnMetaKey = useMemo(() => buildBpmnMetaVersionKey(bpmnMeta), [bpmnMeta]);
  const nodesKey = useMemo(() => buildNodesVersionKey(nodes), [nodes]);
  const hybridLayerKey = useMemo(() => buildHybridLayerVersionKey(hybridLayerByElementId), [hybridLayerByElementId]);

  const nodePathMetaMap = useMemo(
    () => normalizeNodePathMetaMap(asObject(asObject(bpmnMeta).node_path_meta)),
    [bpmnMetaKey],
  );
  const flowTierMetaMap = useMemo(
    () => normalizeFlowTierMetaMap(asObject(asObject(bpmnMeta).flow_meta)),
    [bpmnMetaKey],
  );
  const robotMetaByElementId = useMemo(
    () => normalizeRobotMetaMap(asObject(asObject(bpmnMeta).robot_meta_by_element_id)),
    [bpmnMetaKey],
  );
  const robotMetaStatusByElementId = useMemo(
    () => buildRobotMetaStatusByElementId(robotMetaByElementId),
    [robotMetaByElementId],
  );
  const robotMetaCounts = useMemo(() => {
    const summary = { ready: 0, incomplete: 0 };
    Object.values(robotMetaStatusByElementId).forEach((statusRaw) => {
      const status = toText(statusRaw).toLowerCase();
      if (status === "ready") summary.ready += 1;
      if (status === "incomplete") summary.incomplete += 1;
    });
    return summary;
  }, [robotMetaStatusByElementId]);
  const robotMetaNodeCatalogById = useMemo(() => {
    const out = {};
    asArray(nodes).forEach((nodeRaw) => {
      const node = asObject(nodeRaw);
      const nodeId = toNodeId(node?.id);
      if (!nodeId) return;
      out[nodeId] = {
        id: nodeId,
        title: toText(node?.name || node?.title || nodeId) || nodeId,
        type: toText(node?.type),
      };
    });
    return out;
  }, [nodesKey]);
  const hybridLayerMapLive = useMemo(
    () => normalizeHybridLayerMap(hybridLayerByElementId),
    [hybridLayerKey],
  );
  const hybridLayerItems = useMemo(() => {
    const out = [];
    const seen = new Set();
    Object.keys(robotMetaByElementId).forEach((elementIdRaw) => {
      const elementId = toText(elementIdRaw);
      if (!elementId || seen.has(elementId)) return;
      const meta = asObject(robotMetaByElementId[elementId]);
      const mode = toText(meta?.exec?.mode).toLowerCase();
      if (mode !== "hybrid") return;
      seen.add(elementId);
      const node = asObject(robotMetaNodeCatalogById[elementId]);
      out.push({
        elementId,
        title: toText(node?.title || elementId) || elementId,
        status: toText(robotMetaStatusByElementId[elementId]).toLowerCase() || "none",
        executor: toText(meta?.exec?.executor),
        actionKey: toText(meta?.exec?.action_key),
      });
    });
    Object.keys(hybridLayerMapLive).forEach((elementIdRaw) => {
      const elementId = toText(elementIdRaw);
      if (!elementId || seen.has(elementId)) return;
      seen.add(elementId);
      const node = asObject(robotMetaNodeCatalogById[elementId]);
      out.push({
        elementId,
        title: toText(node?.title || elementId) || elementId,
        status: toText(robotMetaStatusByElementId[elementId]).toLowerCase() || "none",
        executor: "",
        actionKey: "",
      });
    });
    return out.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ru") || String(a.elementId || "").localeCompare(String(b.elementId || ""), "ru"));
  }, [
    robotMetaByElementId,
    robotMetaNodeCatalogById,
    robotMetaStatusByElementId,
    hybridLayerMapLive,
  ]);

  return {
    nodePathMetaMap,
    flowTierMetaMap,
    robotMetaByElementId,
    robotMetaStatusByElementId,
    robotMetaCounts,
    robotMetaNodeCatalogById,
    hybridLayerMapLive,
    hybridLayerItems,
    // Expose stable keys for downstream consumers
    __stableKeys: {
      bpmnMetaKey,
      nodesKey,
      hybridLayerKey,
    },
  };
}
