import { useMemo } from "react";
import {
  normalizeAttentionMarkers,
  isAttentionMarkerUnread,
  countUnreadAttentionMarkers,
  countAttentionMarkers,
} from "./attentionMarkers.js";
import {
  asArray,
  asObject,
  toNodeId,
} from "../lib/processStageDomain.js";
import {
  qualityIssueCopy,
} from "../stage/utils/processStageHelpers.js";

export { deriveAttentionMarkers, deriveAttentionItems } from "./deriveAttentionOutputs.js";

function toText(v) { return String(v ?? "").trim(); }

/**
 * React hook — memoized attention marker derivation.
 * Extracted from ProcessStage.jsx (lines 856-920).
 */
export function useAttentionMarkerDerivation({
  user,
  bpmnMeta,
  attentionSessionLastOpenedAt,
  sid,
}) {
  const attentionViewerId = useMemo(
    () => toText(user?.id || user?.user_id || user?.email || "anon"),
    [user?.email, user?.id, user?.user_id],
  );
  const attentionStorageKey = useMemo(
    () => `pm:attention_last_opened:v1:${attentionViewerId}:${sid || "-"}`,
    [attentionViewerId, sid],
  );
  const attentionMarkers = useMemo(
    () => normalizeAttentionMarkers(asObject(bpmnMeta).attention_markers),
    [bpmnMeta],
  );
  const attentionShowOnWorkspace = useMemo(
    () => asObject(bpmnMeta).attention_show_on_workspace !== false,
    [bpmnMeta],
  );
  const attentionMarkersWithState = useMemo(
    () => attentionMarkers.map((marker) => {
      const unread = isAttentionMarkerUnread(marker, attentionViewerId, attentionSessionLastOpenedAt);
      return { ...marker, unread };
    }),
    [attentionMarkers, attentionSessionLastOpenedAt, attentionViewerId],
  );
  const attentionMarkerUnreadCount = useMemo(
    () => countUnreadAttentionMarkers(attentionMarkers, attentionViewerId, attentionSessionLastOpenedAt),
    [attentionMarkers, attentionSessionLastOpenedAt, attentionViewerId],
  );
  const attentionMarkerHomeCount = useMemo(
    () => countAttentionMarkers(attentionMarkers, { showOnWorkspace: attentionShowOnWorkspace }),
    [attentionMarkers, attentionShowOnWorkspace],
  );
  const customAttentionHints = useMemo(
    () => attentionMarkersWithState
      .filter((marker) => !marker.is_checked && marker.node_id)
      .map((marker) => ({
        id: marker.id,
        nodeId: marker.node_id,
        title: marker.message,
        reasons: [marker.message],
        markerClass: marker.unread ? "fpcAttentionMarkerUnread" : "fpcAttentionMarkerSeen",
        severity: marker.unread ? "high" : "medium",
        hideTag: true,
      })),
    [attentionMarkersWithState],
  );

  return {
    attentionViewerId,
    attentionStorageKey,
    attentionMarkers,
    attentionShowOnWorkspace,
    attentionMarkersWithState,
    attentionMarkerUnreadCount,
    attentionMarkerHomeCount,
    customAttentionHints,
  };
}

/**
 * React hook — memoized attention items aggregation.
 * Extracted from ProcessStage.jsx (lines 2025-2168).
 */
export function useAttentionItemsDerivation({
  coverageRowsAll,
  coverageById,
  coverageNodes,
  qualityHintsRaw,
  qualityNodeTitleById,
  attentionFilters,
}) {
  const coverageNodeMetaById = useMemo(() => {
    const map = {};
    asArray(coverageNodes).forEach((node) => {
      const id = toNodeId(node?.id);
      if (!id) return;
      map[id] = {
        id,
        title: String(node?.title || node?.name || id).trim() || id,
        lane: String(node?.actor_role || node?.laneName || node?.lane || "").trim(),
        type: String(node?.type || "").trim(),
      };
    });
    return map;
  }, [coverageNodes]);

  const qualityReasonsByNode = useMemo(() => {
    const map = {};
    asArray(qualityHintsRaw).forEach((issue) => {
      const nodeId = toNodeId(issue?.nodeId);
      if (!nodeId) return;
      const nodeTitle = String(
        qualityNodeTitleById[nodeId]
        || coverageById[nodeId]?.title
        || issue?.title
        || nodeId,
      ).trim();
      const ui = qualityIssueCopy(issue, nodeTitle);
      const reason = {
        id: `quality:${ui.ruleId}`,
        kind: "quality",
        text: `Ошибка качества: ${ui.short}`,
        detail: ui.fix,
      };
      if (!Array.isArray(map[nodeId])) map[nodeId] = [];
      if (!map[nodeId].some((it) => String(it?.id || "") === reason.id)) {
        map[nodeId].push(reason);
      }
    });
    return map;
  }, [qualityHintsRaw, qualityNodeTitleById, coverageById]);

  const attentionItemsRaw = useMemo(() => {
    const byNode = {};
    const ensureItem = (nodeId) => {
      const id = toNodeId(nodeId);
      if (!id) return null;
      if (!byNode[id]) {
        const row = coverageById[id];
        const meta = coverageNodeMetaById[id] || {};
        byNode[id] = {
          id,
          title: String(row?.title || meta?.title || qualityNodeTitleById[id] || id).trim() || id,
          lane: String(row?.lane || meta?.lane || "").trim(),
          type: String(row?.type || meta?.type || "").trim(),
          reasons: [],
          hasQuality: false,
          hasAiMissing: false,
          hasNotesMissing: false,
          hasDodMissing: false,
          priority: Number(row?.score || 0),
        };
      }
      return byNode[id];
    };

    asArray(coverageRowsAll).forEach((row) => {
      const item = ensureItem(row?.id);
      if (!item) return;
      const dodMissingCount = Number(!!row?.missingNotes) + Number(!!row?.missingAiQuestions) + Number(!!row?.missingDurationQuality);
      if (row?.missingAiQuestions) {
        item.hasAiMissing = true;
        item.reasons.push({ id: "ai_missing", kind: "ai", text: "Нет AI-вопросов" });
      }
      if (row?.missingNotes) {
        item.hasNotesMissing = true;
        item.reasons.push({ id: "notes_missing", kind: "notes", text: "Нет заметок" });
      }
      if (dodMissingCount > 0) {
        item.hasDodMissing = true;
        item.reasons.push({ id: "dod_missing", kind: "dod", text: `DoD: missing ${dodMissingCount}` });
      }
    });

    Object.entries(qualityReasonsByNode).forEach(([nodeId, reasons]) => {
      const item = ensureItem(nodeId);
      if (!item) return;
      item.hasQuality = true;
      item.priority = Math.max(item.priority, 10);
      asArray(reasons).forEach((reason) => {
        if (!item.reasons.some((it) => String(it?.id || "") === String(reason?.id || ""))) {
          item.reasons.push(reason);
        }
      });
    });

    return Object.values(byNode)
      .map((item) => ({
        ...item,
        reasons: asArray(item?.reasons).slice(0, 3),
      }))
      .filter((item) => item.reasons.length > 0)
      .sort((a, b) => {
        const qualityDelta = Number(!!b.hasQuality) - Number(!!a.hasQuality);
        if (qualityDelta !== 0) return qualityDelta;
        const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0);
        if (priorityDelta !== 0) return priorityDelta;
        return String(a.title || "").localeCompare(String(b.title || ""), "ru");
      });
  }, [coverageRowsAll, coverageById, coverageNodeMetaById, qualityNodeTitleById, qualityReasonsByNode]);

  const attentionFilterKinds = useMemo(
    () => Object.entries(attentionFilters || {})
      .filter(([, enabled]) => !!enabled)
      .map(([kind]) => String(kind || "").trim()),
    [attentionFilters],
  );

  const attentionItems = useMemo(() => {
    if (!attentionFilterKinds.length) return attentionItemsRaw;
    return attentionItemsRaw.filter((item) => attentionFilterKinds.some((kind) => {
      if (kind === "quality") return !!item?.hasQuality;
      if (kind === "ai") return !!item?.hasAiMissing;
      if (kind === "notes") return !!item?.hasNotesMissing;
      return false;
    }));
  }, [attentionItemsRaw, attentionFilterKinds]);

  return {
    coverageNodeMetaById,
    qualityReasonsByNode,
    attentionItemsRaw,
    attentionFilterKinds,
    attentionItems,
  };
}
