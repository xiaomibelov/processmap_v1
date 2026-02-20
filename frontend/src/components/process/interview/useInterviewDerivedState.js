import { useMemo } from "react";
import {
  TIMELINE_OPTIONAL_COLUMNS,
  toArray,
  toText,
  normalizeLoose,
  dedupNames,
  computeNodeOrder,
  collectNodeIdsInBpmnOrder,
  parseLaneMetaByNodeFromBpmnXml,
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
  percent,
  round1,
} from "./utils";
import { buildTimelineView } from "./timelineViewModel";
import { buildSessionDocMarkdown } from "../../../features/process/lib/docMarkdown";

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
  const boundariesComplete = useMemo(() => {
    const b = data.boundaries;
    return !!toText(b.trigger) && !!toText(b.start_shop) && !!toText(b.finish_state) && !!toText(b.finish_shop);
  }, [data.boundaries]);

  const laneMetaByNodeFromXml = useMemo(() => parseLaneMetaByNodeFromBpmnXml(bpmnXml), [bpmnXml]);
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

  const xmlNodeOrder = useMemo(() => collectNodeIdsInBpmnOrder(bpmnXml), [bpmnXml]);
  const graphNodeOrder = useMemo(() => {
    const fromGraph = computeNodeOrder(backendNodes, backendEdges);
    if (!fromGraph.length) return fromGraph;
    const known = new Set(fromGraph);
    const fromXml = xmlNodeOrder.filter((id) => known.has(id));
    if (!fromXml.length) return fromGraph;
    const seen = new Set(fromXml);
    fromGraph.forEach((id) => {
      if (!seen.has(id)) fromXml.push(id);
    });
    return fromXml;
  }, [backendNodes, backendEdges, xmlNodeOrder]);

  const graphNodeRank = useMemo(() => {
    const out = {};
    graphNodeOrder.forEach((id, idx) => {
      out[id] = idx;
    });
    return out;
  }, [graphNodeOrder]);
  const graphOrderLocked = graphNodeOrder.length > 0;

  const subprocessCatalog = useMemo(() => {
    const fromSteps = toArray(data.steps).map((x) => x?.subprocess);
    const fromRoot = toArray(data.subprocesses);
    const fromBackend = backendNodes.map((x) => x?.parameters?.interview_subprocess);
    return dedupNames([...fromRoot, ...fromSteps, ...fromBackend]);
  }, [data.steps, data.subprocesses, backendNodes]);

  const timelineView = useMemo(
    () =>
      buildTimelineView({
        steps: data.steps,
        backendNodes,
        graphNodeRank,
        laneMetaByNode: laneMetaByNodeFromXml,
      }),
    [data.steps, backendNodes, graphNodeRank, laneMetaByNodeFromXml],
  );

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
    const active = timelineView.reduce((acc, x) => acc + x.duration, 0);
    const wait = timelineView.reduce((acc, x) => acc + x.wait, 0);
    return { active, wait, lead: active + wait };
  }, [timelineView]);

  const topWaits = useMemo(() => {
    return [...timelineView]
      .filter((x) => x.wait > 0)
      .sort((a, b) => b.wait - a.wait || a.seq - b.seq)
      .slice(0, 3);
  }, [timelineView]);

  const extendedAnalytics = useMemo(() => {
    const stepCount = timelineView.length;
    const boundStepCount = timelineView.filter((x) => !!x.node_bound).length;
    const waitStepCount = timelineView.filter((x) => x.wait > 0).length;
    const lead = summary.lead;

    const byType = {};
    const byLane = {};
    const bySubprocess = {};

    timelineView.forEach((step) => {
      const typeKey = toText(step?.type) || "operation";
      if (!byType[typeKey]) {
        byType[typeKey] = { key: typeKey, label: typeLabel(typeKey), count: 0, active: 0, wait: 0, lead: 0, sharePct: 0 };
      }
      byType[typeKey].count += 1;
      byType[typeKey].active += step.duration;
      byType[typeKey].wait += step.wait;
      byType[typeKey].lead += step.duration + step.wait;

      const laneKey = toText(step?.lane_key) || normalizeLoose(step?.lane_name) || "unassigned";
      if (!byLane[laneKey]) {
        byLane[laneKey] = { key: laneKey, name: toText(step?.lane_name) || "unassigned", count: 0, active: 0, wait: 0, lead: 0, sharePct: 0 };
      }
      byLane[laneKey].count += 1;
      byLane[laneKey].active += step.duration;
      byLane[laneKey].wait += step.wait;
      byLane[laneKey].lead += step.duration + step.wait;

      const spName = toText(step?.subprocess);
      if (spName) {
        const spKey = normalizeLoose(spName);
        if (!bySubprocess[spKey]) {
          bySubprocess[spKey] = { key: spKey, name: spName, count: 0, active: 0, wait: 0, lead: 0, sharePct: 0 };
        }
        bySubprocess[spKey].count += 1;
        bySubprocess[spKey].active += step.duration;
        bySubprocess[spKey].wait += step.wait;
        bySubprocess[spKey].lead += step.duration + step.wait;
      }
    });

    const typeStats = Object.values(byType)
      .map((x) => ({ ...x, sharePct: percent(x.count, stepCount) }))
      .sort((a, b) => b.count - a.count || b.lead - a.lead || String(a.label).localeCompare(String(b.label)));
    const laneStats = Object.values(byLane)
      .map((x) => ({ ...x, sharePct: percent(x.count, stepCount) }))
      .sort((a, b) => b.count - a.count || b.lead - a.lead || String(a.name).localeCompare(String(b.name)));
    const subprocessStats = Object.values(bySubprocess)
      .map((x) => ({ ...x, sharePct: percent(x.count, stepCount) }))
      .sort((a, b) => b.count - a.count || b.lead - a.lead || String(a.name).localeCompare(String(b.name)));

    let aiTotal = 0;
    let aiConfirmed = 0;
    let aiClarify = 0;
    let aiUnknown = 0;
    const aiStepCoverageSet = new Set();
    timelineView.forEach((step) => {
      const list = toArray(data.ai_questions?.[step.id]).filter((q) => toText(q?.text));
      if (!list.length) return;
      aiStepCoverageSet.add(step.id);
      list.forEach((q) => {
        aiTotal += 1;
        const status = toText(q?.status).toLowerCase();
        if (status === "подтверждено") aiConfirmed += 1;
        else if (status === "уточнить") aiClarify += 1;
        else aiUnknown += 1;
      });
    });

    const exceptionAddMinTotal = toArray(data.exceptions).reduce((acc, x) => acc + toNonNegativeInt(x?.add_min), 0);
    const boundaryKeys = ["trigger", "start_shop", "intermediate_roles", "finish_state", "finish_shop"];
    const boundariesFilled = boundaryKeys.reduce((acc, key) => (toText(data?.boundaries?.[key]) ? acc + 1 : acc), 0);

    const maxDurationStep = [...timelineView].sort((a, b) => b.duration - a.duration || a.seq - b.seq)[0] || null;
    const maxWaitStep = [...timelineView].sort((a, b) => b.wait - a.wait || a.seq - b.seq)[0] || null;

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
      aiStepCoverageCount: aiStepCoverageSet.size,
      aiStepCoveragePct: percent(aiStepCoverageSet.size, stepCount),
      boundariesFilled,
      boundariesTotal: boundaryKeys.length,
      boundariesCoveragePct: percent(boundariesFilled, boundaryKeys.length),
      exceptionAddMinTotal,
      maxDurationStep,
      maxWaitStep,
    };
  }, [timelineView, summary, data.ai_questions, data.exceptions, data.boundaries]);

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
    timelineView.forEach((step) => {
      const name = toText(step?.lane_name);
      if (!name) return;
      const key = toText(step?.lane_key) || normalizeLoose(name);
      if (!key) return;
      const idx = Number(step?.lane_idx) || 0;
      const color = toText(step?.lane_color) || laneColor(key, idx);
      if (!byKey[key]) {
        byKey[key] = {
          key,
          name,
          idx,
          color,
          label: laneLabel(name, idx),
        };
        return;
      }
      if (!byKey[key].idx && idx) byKey[key].idx = idx;
      if (!byKey[key].color && color) byKey[key].color = color;
    });
    toArray(actorNames)
      .map((x) => toText(x))
      .filter(Boolean)
      .forEach((name, idx) => {
        const key = normalizeLoose(name) || `lane_${idx + 1}`;
        if (byKey[key]) return;
        byKey[key] = {
          key,
          name,
          idx: idx + 1,
          color: laneColor(key, idx + 1),
          label: laneLabel(name, idx + 1),
        };
      });
    return Object.values(byKey).sort((a, b) => {
      if (a.idx !== b.idx) return a.idx - b.idx;
      return a.name.localeCompare(b.name, "ru");
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

  const filteredTimelineView = useMemo(() => {
    const q = normalizeLoose(timelineFilters.query);
    const laneFilter = toText(timelineFilters.lane);
    const typeFilter = String(timelineFilters.type || "all").toLowerCase();
    const spFilter = normalizeLoose(timelineFilters.subprocess);
    const bindFilter = String(timelineFilters.bind || "all").toLowerCase();
    const annotationFilter = String(timelineFilters.annotation || "all").toLowerCase();

    return timelineView.filter((step) => {
      const stepId = toText(step?.id);
      const xmlAnnotations = toArray(xmlTextAnnotationsByStepId?.[stepId]);
      const hasAnnotation = xmlAnnotations.length > 0 || !!toText(step?.comment);
      if (laneFilter && laneFilter !== "all") {
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
  }, [timelineView, timelineFilters, xmlTextAnnotationsByStepId]);

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
    return !!(
      toText(f.query) ||
      (toText(f.lane) && toText(f.lane) !== "all") ||
      (toText(f.type) && toText(f.type) !== "all") ||
      (toText(f.subprocess) && toText(f.subprocess) !== "all") ||
      (toText(f.bind) && toText(f.bind) !== "all") ||
      (toText(f.annotation) && toText(f.annotation) !== "all")
    );
  }, [timelineFilters]);

  const markdownReport = useMemo(
    () => {
      const baseDraft = sessionDraft && typeof sessionDraft === "object" ? sessionDraft : {};
      const composedDraft = {
        ...baseDraft,
        title: processTitle,
        session_id: sid,
        interview: data,
        nodes: toArray(nodes),
        edges: toArray(edges),
        roles: toArray(roles),
        actors_derived: toArray(actorsDerived),
        bpmn_xml: String(bpmnXml || ""),
      };
      return buildSessionDocMarkdown({
        sessionId: sid,
        draft: composedDraft,
      });
    },
    [sessionDraft, data, nodes, edges, roles, actorsDerived, bpmnXml, processTitle, sid],
  );

  return {
    boundariesComplete,
    laneByNodeFromXml,
    nodeKindByIdFromXml,
    virtualEventNodes,
    backendNodes,
    backendEdges,
    xmlNodeOrder,
    graphNodeOrder,
    graphNodeRank,
    graphOrderLocked,
    subprocessCatalog,
    timelineView,
    laneLinksByNode,
    summary,
    topWaits,
    extendedAnalytics,
    intermediateRolesAuto,
    nodeBindOptionsByStepId,
    aiRows,
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
    markdownReport,
  };
}
