import { useMemo } from "react";
import {
  asArray,
  asObject,
  toNodeId,
} from "../../../lib/processStageDomain";
import {
  toText,
  dedupeDiagramHints,
  normalizePathSequenceKey,
  normalizePathTier,
} from "../../../stage/utils/processStageHelpers";
import { computeDodSnapshotFromDraft } from "../../../dod/computeDodSnapshot";
import { buildDodReadinessV1 } from "../../../dod/buildDodReadinessV1";
import { fnv1aHex } from "../../../../../lib/apiCore.js";

function shallowKey(obj) {
  if (!obj || typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) return `a${obj.length}`;
  const keys = Object.keys(obj);
  if (keys.length === 0) return "e";
  return `o${keys.length}:${fnv1aHex(keys.sort((a, b) => a.localeCompare(b, "en")).join("|")).slice(0, 8)}`;
}

function buildDraftVersionKey(draft) {
  if (!draft || typeof draft !== "object") return "";
  return [
    draft.bpmn_xml_version || draft.version || 0,
    draft.diagram_state_version || draft.diagramStateVersion || 0,
    draft.updated_at || draft.updatedAt || "",
  ].join(":");
}

export default function useDiagramDodQualityModel({
  hasSession,
  draft,
  lintResult,
  autoPassPrecheck,
  autoPassJobState,
  coverageMatrix,
  workspaceActiveOrgId,
  activeProjectWorkspaceId,
  activeProjectId,
  sid,
  coverageById,
  coverageRowsAll,
  coverageNodes,
  qualityHintsRaw,
  qualityOverlayFilters,
  qualityOverlayListKey,
  qualityOverlaySearch,
  isQualityMode,
  isCoverageMode,
  qualityHints,
  coverageHints,
  customAttentionHints,
  pathHighlightEnabled,
  pathHighlightTier,
  pathHighlightSequenceKey,
  nodePathMetaMap,
  flowTierMetaMap,
  reportPathStopHints,
  reportPathFlowConflictHints,
}) {
  const draftKey = useMemo(() => buildDraftVersionKey(draft), [draft]);
  const lintResultKey = useMemo(() => shallowKey(lintResult), [lintResult]);
  const autoPassPrecheckKey = useMemo(() => shallowKey(autoPassPrecheck), [autoPassPrecheck]);
  const autoPassJobStateKey = useMemo(() => shallowKey(autoPassJobState), [autoPassJobState]);
  const coverageMatrixKey = useMemo(() => shallowKey(coverageMatrix), [coverageMatrix]);
  const coverageByIdKey = useMemo(() => shallowKey(coverageById), [coverageById]);
  const coverageRowsAllKey = useMemo(() => shallowKey(coverageRowsAll), [coverageRowsAll]);
  const coverageNodesKey = useMemo(() => shallowKey(coverageNodes), [coverageNodes]);
  const qualityHintsRawKey = useMemo(() => shallowKey(qualityHintsRaw), [qualityHintsRaw]);
  const qualityHintsKey = useMemo(() => shallowKey(qualityHints), [qualityHints]);
  const coverageHintsKey = useMemo(() => shallowKey(coverageHints), [coverageHints]);
  const customAttentionHintsKey = useMemo(() => shallowKey(customAttentionHints), [customAttentionHints]);
  const reportPathStopHintsKey = useMemo(() => shallowKey(reportPathStopHints), [reportPathStopHints]);
  const reportPathFlowConflictHintsKey = useMemo(() => shallowKey(reportPathFlowConflictHints), [reportPathFlowConflictHints]);

  const diagramDodSnapshot = useMemo(() => {
    if (!hasSession) return null;
    try {
      return computeDodSnapshotFromDraft({
        draft,
        bpmnXml: draft?.bpmn_xml,
        qualityReport: lintResult,
      });
    } catch {
      return null;
    }
  }, [hasSession, draftKey, lintResultKey]);

  const dodReadinessV1 = useMemo(() => {
    if (!hasSession) return null;
    try {
      return buildDodReadinessV1({
        draft,
        dodSnapshot: diagramDodSnapshot,
        autoPassPrecheck,
        autoPassJobState,
        coverageMatrix,
        context: {
          orgId: workspaceActiveOrgId,
          workspaceId: activeProjectWorkspaceId,
          projectId: activeProjectId,
          sessionId: sid,
          folderId: draft?.folder_id || draft?.folderId || "",
        },
      });
    } catch {
      return null;
    }
  }, [
    hasSession,
    draftKey,
    diagramDodSnapshot,
    autoPassPrecheckKey,
    autoPassJobStateKey,
    coverageMatrixKey,
    workspaceActiveOrgId,
    activeProjectWorkspaceId,
    activeProjectId,
    sid,
  ]);

  const qualityOverlayCatalog = useMemo(() => {
    const quality = asObject(diagramDodSnapshot?.quality);
    const bpmnNodesById = {};
    asArray(diagramDodSnapshot?.bpmn_nodes).forEach((nodeRaw) => {
      const node = asObject(nodeRaw);
      const nodeId = toNodeId(node?.id);
      if (!nodeId) return;
      bpmnNodesById[nodeId] = {
        id: nodeId,
        title: toText(node?.name || node?.title) || nodeId,
        type: toText(node?.type),
      };
    });
    const resolveItem = (nodeIdRaw, extra = {}) => {
      const nodeId = toNodeId(nodeIdRaw);
      if (!nodeId) return null;
      const fromBpmn = asObject(bpmnNodesById[nodeId]);
      const fromCoverage = asObject(coverageById[nodeId]);
      return {
        nodeId,
        title: toText(extra?.title || fromCoverage?.title || fromBpmn?.title || nodeId) || nodeId,
        type: toText(extra?.type || fromCoverage?.type || fromBpmn?.type),
        detail: toText(extra?.detail),
      };
    };
    const orphanItems = asArray(quality?.orphan_bpmn_nodes)
      .map((nodeId) => resolveItem(nodeId, { detail: "Недостижим от startEvent." }))
      .filter(Boolean);
    const deadEndItems = asArray(quality?.dead_end_bpmn_nodes)
      .map((nodeId) => resolveItem(nodeId, { detail: "Обрывает процесс (нет исходящего flow)." }))
      .filter(Boolean);
    const gatewayItems = asArray(quality?.gateway_unjoined)
      .map((nodeId) => resolveItem(nodeId, { detail: "Gateway split без join." }))
      .filter(Boolean);

    const linkItemsMap = {};
    asArray(quality?.link_integrity).forEach((rowRaw) => {
      const row = asObject(rowRaw);
      const integrity = toText(row?.integrity).toLowerCase();
      if (!(integrity === "error" || integrity === "warn")) return;
      const detail = toText(row?.details) || `Link integrity: ${integrity}`;
      const allIds = [...asArray(row?.throw_ids), ...asArray(row?.catch_ids)];
      allIds.forEach((nodeIdRaw) => {
        const item = resolveItem(nodeIdRaw, { detail });
        if (!item) return;
        if (linkItemsMap[item.nodeId]) return;
        linkItemsMap[item.nodeId] = item;
      });
    });
    const linkItems = Object.values(linkItemsMap);

    const missingDurationItems = coverageRowsAll
      .filter((row) => !!row?.missingDurationQuality)
      .map((row) => resolveItem(row?.id, {
        title: toText(row?.title || row?.id),
        type: toText(row?.type),
        detail: "Нет work/wait или duration/quality.",
      }))
      .filter(Boolean);

    const missingNotesItems = coverageRowsAll
      .filter((row) => !!row?.missingNotes)
      .map((row) => resolveItem(row?.id, {
        title: toText(row?.title || row?.id),
        type: toText(row?.type),
        detail: "Нет заметок по узлу.",
      }))
      .filter(Boolean);

    const debug = asObject(draft?.interview?.report_build_debug);
    const stopReason = toText(debug?.stop_reason).toUpperCase();
    const stopNodeId = toNodeId(debug?.stop_at_bpmn_id);
    const routeTruncatedItems = (!stopNodeId || !stopReason || stopReason === "OK_COMPLETE")
      ? []
      : asArray([
        resolveItem(stopNodeId, {
          detail: `${stopReason} · path=${toText(debug?.path_id_used) || "—"} · steps=${Number(debug?.steps_count || 0)}`,
        }),
      ]).filter(Boolean);

    return {
      orphan: { key: "orphan", label: "Orphan / Unreachable", items: orphanItems },
      dead_end: { key: "dead_end", label: "Dead-end", items: deadEndItems },
      gateway: { key: "gateway", label: "Gateway split without join", items: gatewayItems },
      link_errors: { key: "link_errors", label: "Link event errors", items: linkItems },
      missing_duration: { key: "missing_duration", label: "Missing durations", items: missingDurationItems },
      missing_notes: { key: "missing_notes", label: "Missing notes", items: missingNotesItems },
      route_truncated: { key: "route_truncated", label: "Route truncated", items: routeTruncatedItems },
    };
  }, [diagramDodSnapshot, coverageByIdKey, coverageRowsAllKey, draftKey]);

  const pathHighlightHints = useMemo(() => {
    if (!pathHighlightEnabled) return [];
    const tier = normalizePathTier(pathHighlightTier);
    if (!tier) return [];
    const sequenceKey = normalizePathSequenceKey(pathHighlightSequenceKey);
    const hints = [];
    Object.values(nodePathMetaMap).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      const nodeId = toNodeId(entry?.nodeId || entryRaw?.nodeId);
      if (!nodeId) return;
      const paths = asArray(entry?.paths).map((item) => normalizePathTier(item));
      if (!paths.includes(tier)) return;
      const nodeSeq = normalizePathSequenceKey(entry?.sequenceKey || entry?.sequence_key);
      if (sequenceKey && nodeSeq && nodeSeq !== sequenceKey) return;
      hints.push({
        nodeId,
        title: `Path ${tier}${sequenceKey ? ` · ${sequenceKey}` : ""}`,
        markerClass: "fpcPathHighlightNode",
        severity: "low",
        hideTag: true,
      });
    });
    Object.values(flowTierMetaMap).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      const flowId = toText(entry?.flowId || entryRaw?.flowId);
      if (!flowId) return;
      if (normalizePathTier(entry?.tier) !== tier) return;
      const flowSeq = normalizePathSequenceKey(entry?.sequenceKey || entry?.sequence_key);
      if (sequenceKey && flowSeq && flowSeq !== sequenceKey) return;
      hints.push({
        elementIds: [flowId],
        title: `Path flow ${tier}`,
        markerClass: "fpcPathHighlightFlow",
        severity: "low",
        hideTag: true,
      });
    });
    return dedupeDiagramHints(hints);
  }, [pathHighlightEnabled, pathHighlightTier, pathHighlightSequenceKey, nodePathMetaMap, flowTierMetaMap]);

  const qualityOverlayHints = useMemo(() => {
    const markerByKey = {
      orphan: "fpcQualityProblem",
      dead_end: "fpcQualityProblem",
      gateway: "fpcQualityProblem",
      link_errors: "fpcQualityProblem",
      missing_duration: "fpcCoverageRisk",
      missing_notes: "fpcCoverageWarn",
      route_truncated: "fpcReportStopMarker",
    };
    const hints = [];
    Object.entries(asObject(qualityOverlayFilters)).forEach(([key, enabled]) => {
      if (!enabled) return;
      const category = asObject(qualityOverlayCatalog[key]);
      const markerClass = toText(markerByKey[key] || "fpcQualityProblem");
      asArray(category?.items).forEach((itemRaw) => {
        const item = asObject(itemRaw);
        const nodeId = toNodeId(item?.nodeId);
        if (!nodeId) return;
        hints.push({
          nodeId,
          title: toText(item?.title || nodeId),
          reasons: asArray([toText(item?.detail)]).filter(Boolean),
          markerClass,
          severity: key === "route_truncated" ? "high" : "medium",
          hideTag: key !== "route_truncated",
          aiHint: key === "route_truncated" ? "!" : "",
        });
      });
    });
    return dedupeDiagramHints(hints);
  }, [qualityOverlayFilters, qualityOverlayCatalog]);

  const diagramHints = useMemo(() => {
    const base = isQualityMode ? qualityHints : (isCoverageMode ? coverageHints : []);
    return dedupeDiagramHints([
      ...asArray(base),
      ...asArray(customAttentionHints),
      ...asArray(pathHighlightHints),
      ...asArray(qualityOverlayHints),
      ...asArray(reportPathStopHints),
      ...asArray(reportPathFlowConflictHints),
    ]);
  }, [
    isQualityMode,
    isCoverageMode,
    qualityHintsKey,
    coverageHintsKey,
    customAttentionHintsKey,
    pathHighlightHints,
    qualityOverlayHints,
    reportPathStopHintsKey,
    reportPathFlowConflictHintsKey,
  ]);

  const qualityOverlayRows = useMemo(
    () => ([
      "orphan",
      "dead_end",
      "gateway",
      "link_errors",
      "missing_duration",
      "missing_notes",
      "route_truncated",
    ]).map((key) => {
      const category = asObject(qualityOverlayCatalog[key]);
      return {
        key,
        label: toText(category?.label || key) || key,
        count: Number(asArray(category?.items).length || 0),
        items: asArray(category?.items),
      };
    }),
    [qualityOverlayCatalog],
  );

  const activeQualityOverlayCount = useMemo(
    () => Object.values(asObject(qualityOverlayFilters)).filter(Boolean).length,
    [qualityOverlayFilters],
  );

  const qualityOverlayListItems = useMemo(() => {
    const listKey = toText(qualityOverlayListKey);
    if (!listKey) return [];
    const row = qualityOverlayRows.find((item) => item.key === listKey);
    const all = asArray(row?.items);
    if (!all.length) return [];
    const query = toText(qualityOverlaySearch).toLowerCase();
    const filtered = query
      ? all.filter((itemRaw) => {
        const item = asObject(itemRaw);
        return [
          toText(item?.title),
          toText(item?.nodeId),
          toText(item?.type),
          toText(item?.detail),
        ].some((part) => part.toLowerCase().includes(query));
      })
      : all;
    return filtered.slice(0, 200);
  }, [qualityOverlayRows, qualityOverlayListKey, qualityOverlaySearch]);

  return {
    diagramDodSnapshot,
    dodReadinessV1,
    qualityOverlayCatalog,
    qualityOverlayHints,
    diagramHints,
    qualityOverlayRows,
    activeQualityOverlayCount,
    qualityOverlayListItems,
    pathHighlightHints,
  };
}
