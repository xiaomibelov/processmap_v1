import {
  toArray,
  toText,
  normalizeLoose,
  laneColor,
  laneLabel,
} from "../utils";

export function buildTimelineLaneOptions(timelineView, actorNames) {
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

  toArray(timelineView).forEach((step) => {
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
}

export function buildBoundaryLaneOptions(timelineView, actorNames) {
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

  toArray(timelineView).forEach((step) => {
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
}

export function filterBoundaryLaneOptions(boundaryLaneOptions, boundariesLaneFilter) {
  const q = normalizeLoose(boundariesLaneFilter);
  if (!q) return boundaryLaneOptions;
  return toArray(boundaryLaneOptions)
    .filter((x) => normalizeLoose(x.label).includes(q) || normalizeLoose(x.name).includes(q));
}

export function buildTimelineSubprocessOptions(timelineView) {
  const seen = new Set();
  const out = [];
  toArray(timelineView).forEach((step) => {
    const sp = toText(step?.subprocess);
    if (!sp) return;
    const k = normalizeLoose(sp);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(sp);
  });
  return out;
}

export function buildFilteredTimelineView({
  timelineView,
  timelineFilters,
  deferredTimelineQuery,
  xmlTextAnnotationsByStepId,
  aiQuestionMetaByStepId,
}) {
  const q = normalizeLoose(deferredTimelineQuery);
  const laneFilter = toText(timelineFilters.lane);
  const laneFilters = toArray(timelineFilters.lanes).map((item) => toText(item)).filter(Boolean);
  const typeFilter = String(timelineFilters.type || "all").toLowerCase();
  const spFilter = normalizeLoose(timelineFilters.subprocess);
  const bindFilter = String(timelineFilters.bind || "all").toLowerCase();
  const annotationFilter = String(timelineFilters.annotation || "all").toLowerCase();
  const aiFilter = String(timelineFilters.ai || "all").toLowerCase();

  return toArray(timelineView).filter((step) => {
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
}

export function buildTransitionView({
  backendEdges,
  backendNodes,
  transitions,
  graphNodeRank,
  timelineView,
}) {
  const byNode = {};
  toArray(backendNodes).forEach((n) => {
    const id = toText(n?.id);
    if (!id) return;
    byNode[id] = {
      title: toText(n?.title) || id,
      lane: toText(n?.actorRole),
    };
  });
  toArray(timelineView).forEach((s) => {
    const id = toText(s?.node_bind_id || s?.node_id);
    if (!id) return;
    const cur = byNode[id] || {};
    byNode[id] = {
      title: toText(s?.action) || cur.title || id,
      lane: toText(s?.lane_name) || cur.lane || "",
    };
  });

  const graphNoByNodeId = {};
  toArray(timelineView).forEach((s) => {
    const nodeId = toText(s?.node_bind_id || s?.node_id);
    if (!nodeId || graphNoByNodeId[nodeId]) return;
    graphNoByNodeId[nodeId] = toText(s?.seq_label || s?.seq);
  });

  const transitionByKey = {};
  toArray(transitions).forEach((tr, idx) => {
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
  toArray(backendEdges).forEach((e, idx) => {
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
}

export function isTimelineFilteringActive(timelineFilters) {
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
}
