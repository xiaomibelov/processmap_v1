import { overlayPropertyColorByKey, normalizeOverlayPropertyKey } from "./overlayColorModel.js";
import { buildOverlayGeometry, readOverlayCanvasZoom } from "./overlayLayoutModel.js";

function runMeasure(ctx, name, run, payload) {
  const measureInterviewPerf = ctx?.callbacks?.measureInterviewPerf;
  if (typeof measureInterviewPerf === "function") {
    return measureInterviewPerf(name, run, payload);
  }
  return run();
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildUserNotesDecorPayload(ctx) {
  const getElementNotesMap = ctx?.getters?.getElementNotesMap;
  const asArray = ctx?.utils?.asArray;
  if (typeof getElementNotesMap !== "function" || typeof asArray !== "function") return [];
  const out = [];
  const map = getElementNotesMap();
  Object.entries(map).forEach(([elementId, entry]) => {
    const eid = String(elementId || "").trim();
    const count = asArray(entry?.items).length;
    if (!eid || count <= 0) return;
    out.push({ elementId: eid, count });
  });
  return out;
}

function buildStepTimeDecorPayload(ctx) {
  const asArray = ctx?.utils?.asArray;
  const asObject = ctx?.utils?.asObject;
  const toText = ctx?.utils?.toText;
  const readStepTimeMinutes = ctx?.utils?.readStepTimeMinutes;
  const readStepTimeSeconds = ctx?.utils?.readStepTimeSeconds;
  const draftRef = ctx?.readOnly?.draftRef;
  if (
    typeof asArray !== "function"
    || typeof asObject !== "function"
    || typeof toText !== "function"
    || typeof readStepTimeMinutes !== "function"
    || typeof readStepTimeSeconds !== "function"
  ) {
    return [];
  }
  return asArray(draftRef?.current?.nodes)
    .map((rawNode) => {
      const node = asObject(rawNode);
      const nodeId = toText(node?.id);
      if (!nodeId) return null;
      const minutes = readStepTimeMinutes(node);
      if (minutes === null) return null;
      const seconds = readStepTimeSeconds(node);
      return { nodeId, minutes, seconds: seconds === null ? Math.round(minutes * 60) : seconds };
    })
    .filter(Boolean);
}

function buildRobotMetaDecorPayload(ctx) {
  const toText = ctx?.utils?.toText;
  const asObject = ctx?.utils?.asObject;
  const getRobotMetaStatus = ctx?.utils?.getRobotMetaStatus;
  const robotMetaMissingFields = ctx?.utils?.robotMetaMissingFields;
  const getRobotMetaMap = ctx?.getters?.getRobotMetaMap;
  const robotMetaStatusByElementIdRef = ctx?.readOnly?.robotMetaStatusByElementIdRef;
  const robotMetaOverlayFiltersRef = ctx?.readOnly?.robotMetaOverlayFiltersRef;
  if (
    typeof toText !== "function"
    || typeof asObject !== "function"
    || typeof getRobotMetaStatus !== "function"
    || typeof robotMetaMissingFields !== "function"
    || typeof getRobotMetaMap !== "function"
  ) {
    return [];
  }
  const map = getRobotMetaMap();
  const statusById = asObject(robotMetaStatusByElementIdRef?.current);
  const filters = asObject(robotMetaOverlayFiltersRef?.current);
  const showReady = !!filters.ready;
  const showIncomplete = !!filters.incomplete;
  return Object.keys(map)
    .map((elementId) => {
      const meta = map[elementId];
      const statusRaw = toText(statusById[elementId]).toLowerCase();
      const status = statusRaw || getRobotMetaStatus(meta);
      if (status === "ready" && !showReady) return null;
      if (status === "incomplete" && !showIncomplete) return null;
      if (status !== "ready" && status !== "incomplete") return null;
      const missingFields = robotMetaMissingFields(meta);
      const executor = toText(meta?.exec?.executor);
      const actionKey = toText(meta?.exec?.action_key);
      const qcCritical = !!meta?.qc?.critical;
      const tooltip = status === "ready"
        ? `Robot ready · executor=${executor || "—"} · action=${actionKey || "—"}${qcCritical ? " · QC critical step" : ""}`
        : `Robot meta incomplete: ${missingFields.length ? missingFields.map((name) => `missing ${name}`).join(" / ") : "missing action_key / missing executor"}${qcCritical ? " · QC critical step" : ""}`;
      return {
        elementId,
        status,
        markerClass: status === "incomplete" ? "fpcRobotMetaIncomplete" : "fpcRobotMetaReady",
        badgeClass: status === "incomplete" ? "warn" : "ok",
        badgeText: status === "incomplete" ? "!" : "R",
        signature: `${status}|${executor}|${actionKey}|${missingFields.join(",")}|${qcCritical ? 1 : 0}|${tooltip}`,
        tooltip,
      };
    })
    .filter(Boolean);
}

export function clearInterviewDecor(ctx) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const asArray = ctx?.utils?.asArray;
  const clearAiQuestionPanel = ctx?.callbacks?.clearAiQuestionPanel;
  if (!inst || !kind || !refs || typeof asArray !== "function") return;
  try {
    const canvas = inst.get("canvas");
    const overlays = inst.get("overlays");
    asArray(refs.interviewMarkerStateRef.current[kind]).forEach((m) => {
      canvas.removeMarker(m.elementId, m.className);
    });
    asArray(refs.interviewOverlayStateRef.current[kind]).forEach((id) => {
      overlays.remove(id);
    });
    refs.interviewMarkerStateRef.current[kind] = [];
    refs.interviewOverlayStateRef.current[kind] = [];
    if (typeof clearAiQuestionPanel === "function") {
      clearAiQuestionPanel(inst, kind, { keepTarget: true });
    }
  } catch {
  }
}

export function clearHappyFlowDecor(ctx) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const asArray = ctx?.utils?.asArray;
  if (!inst || !kind || !refs || typeof asArray !== "function") return;
  try {
    const canvas = inst.get("canvas");
    const registry = inst.get("elementRegistry");
    asArray(refs.happyFlowMarkerStateRef.current[kind]).forEach((m) => {
      canvas.removeMarker(m.elementId, m.className);
    });
    asArray(refs.happyFlowStyledStateRef.current[kind]).forEach((elementId) => {
      const gfx = registry?.getGraphics?.(elementId);
      if (!gfx || !gfx.style) return;
      gfx.style.removeProperty("--fpc-flow-tier-accent");
      gfx.style.removeProperty("--fpc-happy-flow-accent");
      gfx.style.removeProperty("--fpc-node-path-accent");
      gfx.removeAttribute("data-fpc-happy-flow");
      gfx.removeAttribute("data-fpc-flow-tier");
      gfx.removeAttribute("data-fpc-node-path");
      gfx.removeAttribute("data-fpc-sequence-key");
    });
    refs.happyFlowMarkerStateRef.current[kind] = [];
    refs.happyFlowStyledStateRef.current[kind] = [];
  } catch {
  }
}

export function applyHappyFlowDecor(ctx) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const getters = ctx?.getters;
  const asObject = ctx?.utils?.asObject;
  const asArray = ctx?.utils?.asArray;
  const toText = ctx?.utils?.toText;
  if (!inst || !kind || !refs || !getters) return;
  if (typeof asObject !== "function" || typeof asArray !== "function" || typeof toText !== "function") return;

  clearHappyFlowDecor(ctx);
  try {
    const flowMeta = getters.getFlowTierMetaMap();
    const canvas = inst.get("canvas");
    const registry = inst.get("elementRegistry");
    if (flowMeta && Object.keys(flowMeta).length) {
      const elements = registry.filter((el) => getters.isConnectionElement(el));
      elements.forEach((el) => {
        const flowId = toText(el?.businessObject?.id || el?.id);
        const tier = toText(flowMeta[flowId]?.tier).toUpperCase();
        if (!flowId || !(tier === "P0" || tier === "P1" || tier === "P2")) return;
        const tierClass = tier === "P1"
          ? "fpcFlowTierP1"
          : (tier === "P2" ? "fpcFlowTierP2" : "fpcFlowTierP0");
        canvas.addMarker(el.id, tierClass);
        refs.happyFlowMarkerStateRef.current[kind].push({ elementId: el.id, className: tierClass });
        if (tier === "P0") {
          canvas.addMarker(el.id, "fpcHappyFlow");
          refs.happyFlowMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcHappyFlow" });
        }
        const gfx = registry?.getGraphics?.(el.id);
        if (gfx?.style) {
          const accentVar = tier === "P1"
            ? "var(--bpmn-flow-tier-p1, #b38a46)"
            : (tier === "P2" ? "var(--bpmn-flow-tier-p2, #b45353)" : "var(--bpmn-flow-tier-p0, #3d8f62)");
          gfx.style.setProperty("--fpc-flow-tier-accent", accentVar);
          gfx.style.setProperty("--fpc-happy-flow-accent", accentVar);
          gfx.setAttribute("data-fpc-happy-flow", "1");
          gfx.setAttribute("data-fpc-flow-tier", tier);
          refs.happyFlowStyledStateRef.current[kind].push(el.id);
        }
      });
    }

    const nodePathMeta = getters.getNodePathMetaMap();
    if (nodePathMeta && Object.keys(nodePathMeta).length) {
      const shapes = registry.filter((el) => getters.isShapeElement(el) && getters.isSelectableElement(el));
      shapes.forEach((el) => {
        const nodeId = toText(el?.businessObject?.id || el?.id);
        const entry = asObject(nodePathMeta[nodeId]);
        const paths = asArray(entry?.paths).map((tag) => toText(tag).toUpperCase()).filter(Boolean);
        if (!nodeId || !paths.length) return;
        if (paths.includes("P0")) {
          canvas.addMarker(el.id, "fpcNodePathP0");
          refs.happyFlowMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcNodePathP0" });
        }
        if (paths.includes("P1")) {
          canvas.addMarker(el.id, "fpcNodePathP1");
          refs.happyFlowMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcNodePathP1" });
        }
        if (paths.includes("P2")) {
          canvas.addMarker(el.id, "fpcNodePathP2");
          refs.happyFlowMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcNodePathP2" });
        }

        const gfx = registry?.getGraphics?.(el.id);
        if (gfx?.style) {
          const accentVar = paths.includes("P0")
            ? "var(--bpmn-flow-tier-p0, #3d8f62)"
            : (paths.includes("P1")
              ? "var(--bpmn-flow-tier-p1, #b38a46)"
              : "var(--bpmn-flow-tier-p2, #b45353)");
          gfx.style.setProperty("--fpc-node-path-accent", accentVar);
          gfx.setAttribute("data-fpc-node-path", paths.join(","));
          const sequenceKey = toText(entry?.sequence_key || entry?.sequenceKey);
          if (sequenceKey) gfx.setAttribute("data-fpc-sequence-key", sequenceKey);
          refs.happyFlowStyledStateRef.current[kind].push(el.id);
        }
      });
    }
  } catch {
  }
}

export function buildInterviewDecorPayload(ctx) {
  const asObject = ctx?.utils?.asObject;
  const asArray = ctx?.utils?.asArray;
  const toText = ctx?.utils?.toText;
  const normalizeLoose = ctx?.utils?.normalizeLoose;
  const normalizeAiQuestionsByElementMap = ctx?.utils?.normalizeAiQuestionsByElementMap;
  const aiQuestionStats = ctx?.utils?.aiQuestionStats;
  const getElementNotesMap = ctx?.getters?.getElementNotesMap;
  const draftRef = ctx?.readOnly?.draftRef;
  if (
    typeof asObject !== "function"
    || typeof asArray !== "function"
    || typeof toText !== "function"
    || typeof normalizeLoose !== "function"
    || typeof normalizeAiQuestionsByElementMap !== "function"
    || typeof aiQuestionStats !== "function"
    || typeof getElementNotesMap !== "function"
  ) {
    return {
      items: [],
      groups: [],
      noteItems: [],
      aiQuestionItems: [],
      dodItems: [],
    };
  }
  const draftNow = asObject(draftRef?.current);
  const iv = asObject(draftNow?.interview);
  const steps = asArray(iv.steps);
  const nodesList = asArray(draftNow?.nodes);
  const notesByElement = getElementNotesMap();
  const aiQuestionsByElement = normalizeAiQuestionsByElementMap(iv.ai_questions_by_element || iv.aiQuestionsByElementId);
  if (!steps.length && !Object.keys(aiQuestionsByElement).length && !Object.keys(notesByElement).length) {
    return {
      items: [],
      groups: [],
      noteItems: [],
      aiQuestionItems: [],
      dodItems: [],
    };
  }

  const hasDurationQuality = (nodeRaw) => {
    const node = asObject(nodeRaw);
    const params = asObject(node?.parameters);
    const duration = Number(
      node?.step_time_min
      ?? node?.duration_min
      ?? params?.step_time_min
      ?? params?.duration_min
      ?? params?.duration
      ?? 0,
    );
    const hasDuration = Number.isFinite(duration) && duration > 0;
    const hasQuality = (
      asArray(node?.qc).length > 0
      || asArray(params?.qc).length > 0
      || !!toText(params?.quality)
      || !!toText(params?.quality_gate)
    );
    return hasDuration && hasQuality;
  };

  const byId = {};
  const byTitle = {};
  nodesList.forEach((n) => {
    const nid = toText(n?.id);
    if (!nid) return;
    byId[nid] = n;
    const tk = normalizeLoose(n?.title || n?.name || "");
    if (!tk) return;
    if (!byTitle[tk]) byTitle[tk] = [];
    byTitle[tk].push(n);
  });

  const byNode = {};
  const aiByNode = {};
  const groupsByKey = {};
  steps.forEach((s) => {
    const subprocess = toText(s?.subprocess || s?.subprocess_name);

    const explicit = toText(s?.node_id || s?.nodeId || s?.node_bind_id || s?.nodeBindId || s?.id);
    let node = null;
    if (explicit && byId[explicit]) node = byId[explicit];
    else if (explicit) {
      node = {
        id: explicit,
        title: toText(s?.action || s?.title || explicit),
      };
    }
    else {
      const key = normalizeLoose(s?.action || s?.title);
      const hits = asArray(byTitle[key]);
      if (hits.length === 1) node = hits[0];
    }
    if (!node) return;

    const nodeId = toText(node?.id);
    if (!nodeId) return;
    const nodeTitle = toText(node?.title || node?.name || nodeId);

    const item = byNode[nodeId] || {
      nodeId,
      title: nodeTitle,
      subprocess: "",
      hasStepComment: false,
      hasRole: false,
      hasDurationQuality: false,
    };
    item.hasStepComment = item.hasStepComment || !!toText(s?.comment || s?.notes || s?.note);
    item.hasRole = item.hasRole || !!toText(
      s?.role
      || s?.actor
      || s?.lane
      || node?.actor_role
      || node?.laneName,
    );
    item.hasDurationQuality = item.hasDurationQuality || hasDurationQuality(node);
    byNode[nodeId] = item;

    if (subprocess) {
      item.subprocess = subprocess;
    }

    if (subprocess) {
      const sk = normalizeLoose(subprocess);
      if (!groupsByKey[sk]) {
        groupsByKey[sk] = {
          key: sk,
          name: subprocess,
          nodeIds: new Set(),
        };
      }
      groupsByKey[sk].nodeIds.add(nodeId);
    }
  });

  Object.keys(aiQuestionsByElement).forEach((rawElementId) => {
    const nodeId = toText(rawElementId);
    if (!nodeId) return;
    const items = ctx.utils.normalizeAiQuestionItems(aiQuestionsByElement[rawElementId]);
    if (!items.length) return;
    const node = asObject(byId[nodeId]);
    const nodeTitle = toText(node?.title || node?.name || nodeId);
    const stats = aiQuestionStats(items);
    aiByNode[nodeId] = {
      nodeId,
      title: nodeTitle,
      count: stats.total,
      withoutComment: stats.withoutComment,
      done: stats.done,
      open: stats.open,
    };
  });

  const noteItemsByNode = {};
  const dodItemsByNode = {};
  const allNodeIds = new Set([
    ...Object.keys(byNode),
    ...Object.keys(aiByNode),
    ...Object.keys(notesByElement),
  ]);

  allNodeIds.forEach((nodeIdRaw) => {
    const nodeId = toText(nodeIdRaw);
    if (!nodeId) return;
    const node = asObject(byId[nodeId]);
    const nodeTitle = toText(
      byNode[nodeId]?.title
      || aiByNode[nodeId]?.title
      || node?.title
      || node?.name
      || nodeId,
    );
    const noteEntry = asObject(notesByElement[nodeId]);
    const noteCount = asArray(noteEntry?.items).length;
    const stepCommentCount = byNode[nodeId]?.hasStepComment ? 1 : 0;
    const notesTotal = noteCount + stepCommentCount;
    if (notesTotal > 0) {
      noteItemsByNode[nodeId] = {
        nodeId,
        title: nodeTitle,
        count: notesTotal,
      };
    }

    const aiMeta = asObject(aiByNode[nodeId]);
    const aiTotal = Number(aiMeta?.count || 0);
    const aiDone = Number(aiMeta?.done || 0);
    const hasRole = !!(byNode[nodeId]?.hasRole || toText(node?.actor_role || node?.laneName || node?.lane));
    const hasDocs = notesTotal > 0;
    const aiReady = aiTotal > 0 && aiDone >= aiTotal;
    const dqReady = !!(byNode[nodeId]?.hasDurationQuality || hasDurationQuality(node));
    const total = 4;
    const done = Number(hasRole) + Number(hasDocs) + Number(aiReady) + Number(dqReady);
    const percent = Math.round((done / total) * 100);
    dodItemsByNode[nodeId] = {
      nodeId,
      title: nodeTitle,
      done,
      total,
      percent,
    };
  });

  const groups = Object.values(groupsByKey)
    .map((g) => ({
      key: g.key,
      name: g.name,
      nodeIds: Array.from(g.nodeIds || []),
    }))
    .filter((g) => g.nodeIds.length > 0);

  return {
    items: Object.values(byNode),
    groups,
    noteItems: Object.values(noteItemsByNode),
    aiQuestionItems: Object.values(aiByNode),
    dodItems: Object.values(dodItemsByNode),
  };
}

export function applyInterviewDecor(ctx, options = {}) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const getters = ctx?.getters;
  const callbacks = ctx?.callbacks;
  const asArray = ctx?.utils?.asArray;
  const asObject = ctx?.utils?.asObject;
  const toText = ctx?.utils?.toText;
  const colorFromKey = ctx?.utils?.colorFromKey;
  if (
    !inst || !kind || !refs || !getters || !callbacks
    || typeof asArray !== "function" || typeof asObject !== "function" || typeof toText !== "function"
    || typeof colorFromKey !== "function"
  ) return;
  const signature = toText(options?.signature);
  if (signature && toText(refs.interviewDecorSignatureRef.current?.[kind]) === signature) return;
  const interviewMode = getters.isInterviewDecorModeOn();
  const payload = buildInterviewDecorPayload(ctx);
  const items = asArray(payload?.items);
  const groups = asArray(payload?.groups);
  const noteItems = asArray(payload?.noteItems);
  const aiQuestionItems = asArray(payload?.aiQuestionItems);
  const dodItems = asArray(payload?.dodItems);
  const hasInterviewPayload = items.length || groups.length || noteItems.length || aiQuestionItems.length || dodItems.length;

  runMeasure(
    ctx,
    "diagram.updateInterviewOverlays",
    () => {
      clearInterviewDecor(ctx);
      if (interviewMode && !hasInterviewPayload) {
        refs.aiQuestionPanelTargetRef.current[kind] = "";
        callbacks.clearAiQuestionPanel(inst, kind);
        refs.interviewDecorSignatureRef.current[kind] = signature;
        return;
      }
      if (!interviewMode && !aiQuestionItems.length) {
        refs.aiQuestionPanelTargetRef.current[kind] = "";
        callbacks.clearAiQuestionPanel(inst, kind);
        refs.interviewDecorSignatureRef.current[kind] = signature;
        return;
      }

      try {
        const canvas = inst.get("canvas");
        const overlays = inst.get("overlays");
        const registry = inst.get("elementRegistry");

        if (interviewMode) {
          items.forEach((it) => {
            const el = getters.findShapeByNodeId(registry, it.nodeId) || getters.findShapeForHint(registry, { nodeId: it.nodeId, title: it.title });
            if (!el) return;

            canvas.addMarker(el.id, "fpcInterviewNode");
            refs.interviewMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcInterviewNode" });
          });
        }

        const noteByNode = {};
        if (interviewMode) {
          noteItems.forEach((item) => {
            const nodeId = toText(item?.nodeId);
            if (!nodeId) return;
            noteByNode[nodeId] = item;
          });
        }
        const aiByNode = {};
        aiQuestionItems.forEach((item) => {
          const nodeId = toText(item?.nodeId);
          if (!nodeId) return;
          aiByNode[nodeId] = item;
        });
        const dodByNode = {};
        if (interviewMode) {
          dodItems.forEach((item) => {
            const nodeId = toText(item?.nodeId);
            if (!nodeId) return;
            dodByNode[nodeId] = item;
          });
        }

        const badgeNodeIds = new Set([
          ...(interviewMode ? Object.keys(noteByNode) : []),
          ...Object.keys(aiByNode),
          ...(interviewMode ? Object.keys(dodByNode) : []),
        ]);

        const bindBadgeClick = (btn, onClick) => {
          btn.addEventListener("mousedown", (ev) => ev.stopPropagation());
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            onClick?.();
          });
        };

        badgeNodeIds.forEach((nodeId) => {
          const noteMeta = asObject(noteByNode[nodeId]);
          const aiMeta = asObject(aiByNode[nodeId]);
          const dodMeta = asObject(dodByNode[nodeId]);
          const title = toText(noteMeta?.title || aiMeta?.title || dodMeta?.title || nodeId);
          const el = getters.findShapeByNodeId(registry, nodeId) || getters.findShapeForHint(registry, { nodeId, title });
          if (!el) return;

          const noteCount = Number(noteMeta?.count || 0);
          if (interviewMode && noteCount > 0) {
            canvas.addMarker(el.id, "fpcHasNote");
            refs.interviewMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcHasNote" });
          }
          const aiCount = Number(aiMeta?.count || 0);
          if (aiCount > 0) {
            canvas.addMarker(el.id, "fpcHasAiQuestion");
            refs.interviewMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcHasAiQuestion" });
          }

          const rightStack = document.createElement("div");
          rightStack.className = "fpcNodeBadgeStack";
          rightStack.dataset.nodeId = nodeId;
          rightStack.style.transform = "translateX(-100%)";

          const leftStack = document.createElement("div");
          leftStack.className = "fpcNodeBadgeStack";
          leftStack.dataset.nodeId = nodeId;
          leftStack.style.alignItems = "flex-start";

          if (aiCount > 0) {
            const aiBadge = document.createElement("button");
            aiBadge.type = "button";
            aiBadge.className = `fpcNodeBadge fpcNodeBadge--ai ${Number(aiMeta?.withoutComment || 0) > 0 ? "warn" : "ok"}`;
            aiBadge.dataset.badgeKind = "ai";
            aiBadge.textContent = `AI:${aiCount}`;
            aiBadge.title = `AI-вопросов: ${aiCount} · done: ${Number(aiMeta?.done || 0)}`;
            bindBadgeClick(aiBadge, () => {
              callbacks.setSelectedDecor(inst, kind, el.id);
              callbacks.emitElementSelection(el, `${kind}.ai_badge_click`);
              callbacks.openAiQuestionPanel(inst, kind, el.id, { source: "interview_ai_badge", toggle: true });
            });
            rightStack.appendChild(aiBadge);
          }

          if (interviewMode && noteCount > 0) {
            const noteBadge = document.createElement("button");
            noteBadge.type = "button";
            noteBadge.className = "fpcNodeBadge fpcNodeBadge--notes";
            noteBadge.dataset.badgeKind = "notes";
            noteBadge.textContent = `N:${noteCount}`;
            noteBadge.title = `Заметок: ${noteCount}`;
            bindBadgeClick(noteBadge, () => {
              callbacks.setSelectedDecor(inst, kind, el.id);
              callbacks.emitElementSelection(el, `${kind}.notes_badge_click`);
            });
            leftStack.appendChild(noteBadge);
          }

          const dodTotal = interviewMode ? Number(dodMeta?.total || 0) : 0;
          if (interviewMode && dodTotal > 0) {
            const dodDone = Number(dodMeta?.done || 0);
            const dodPercent = Number(dodMeta?.percent || 0);
            const dodBadge = document.createElement("button");
            dodBadge.type = "button";
            dodBadge.className = `fpcNodeBadge fpcNodeBadge--dod ${dodDone >= dodTotal ? "ok" : ""}`;
            dodBadge.dataset.badgeKind = "dod";
            dodBadge.textContent = `DoD:${dodDone}/${dodTotal}`;
            dodBadge.title = `DoD readiness: ${dodPercent}% (${dodDone}/${dodTotal})`;
            bindBadgeClick(dodBadge, () => {
              callbacks.setSelectedDecor(inst, kind, el.id);
              callbacks.emitElementSelection(el, `${kind}.dod_badge_click`);
            });
            rightStack.appendChild(dodBadge);
          }

          const shapeWidth = Number(el?.width || 0);
          const rightAnchorLeft = Number.isFinite(shapeWidth) && shapeWidth > 0 ? shapeWidth - 2 : 96;
          if (rightStack.childNodes.length) {
            const rightOverlayId = overlays.add(el.id, {
              position: { top: -18, left: rightAnchorLeft },
              html: rightStack,
            });
            refs.interviewOverlayStateRef.current[kind].push(rightOverlayId);
          }
          if (leftStack.childNodes.length) {
            const leftOverlayId = overlays.add(el.id, {
              position: { top: -18, left: 2 },
              html: leftStack,
            });
            refs.interviewOverlayStateRef.current[kind].push(leftOverlayId);
          }
        });

        if (interviewMode) {
          groups.forEach((g) => {
            const groupName = toText(g?.name);
            const rawIds = asArray(g?.nodeIds).map((x) => toText(x)).filter(Boolean);
            if (!groupName || !rawIds.length) return;

            const shapes = [];
            const usedShapeIds = new Set();
            rawIds.forEach((nid) => {
              const el = getters.findShapeByNodeId(registry, nid) || getters.findShapeForHint(registry, { nodeId: nid, title: nid });
              if (!getters.isShapeElement(el) || usedShapeIds.has(el.id)) return;
              usedShapeIds.add(el.id);
              shapes.push(el);
            });
            if (!shapes.length) return;

            let minX = Number.POSITIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY;
            let maxX = 0;
            let maxY = 0;

            shapes.forEach((el) => {
              const x = Number(el.x || 0);
              const y = Number(el.y || 0);
              const w = Number(el.width || 0);
              const h = Number(el.height || 0);
              if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return;
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x + w);
              maxY = Math.max(maxY, y + h);
            });

            if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) return;

            const padX = 22;
            const padY = 16;
            const boxX = minX - padX;
            const boxY = minY - padY;
            const boxW = Math.max(maxX - minX + padX * 2, 120);
            const boxH = Math.max(maxY - minY + padY * 2, 70);

            let anchor = shapes[0];
            shapes.forEach((el) => {
              if (Number(el.x || 0) < Number(anchor.x || 0)) anchor = el;
            });

            const box = document.createElement("div");
            box.className = "fpcInterviewSubprocessBox";
            box.style.width = `${boxW.toFixed(1)}px`;
            box.style.height = `${boxH.toFixed(1)}px`;
            box.style.setProperty("--sp-color", colorFromKey(groupName));

            const lbl = document.createElement("div");
            lbl.className = "fpcInterviewSubprocessLabel";
            lbl.textContent = `Подпроцесс: ${groupName}`;
            box.appendChild(lbl);

            const oid = overlays.add(anchor.id, {
              position: {
                left: Number((boxX - Number(anchor.x || 0)).toFixed(1)),
                top: Number((boxY - Number(anchor.y || 0)).toFixed(1)),
              },
              html: box,
            });
            refs.interviewOverlayStateRef.current[kind].push(oid);
          });
        }

        const currentTarget = toText(refs.aiQuestionPanelTargetRef.current[kind]);
        if (currentTarget) {
          callbacks.openAiQuestionPanel(inst, kind, currentTarget, {
            source: "interview_decor_refresh",
          });
        } else {
          callbacks.clearAiQuestionPanel(inst, kind, { keepTarget: true });
        }
      } catch {
      }
      refs.interviewDecorSignatureRef.current[kind] = signature;
    },
    () => ({
      kind,
      interviewMode: interviewMode ? 1 : 0,
      items: items.length,
      groups: groups.length,
      notes: noteItems.length,
      ai: aiQuestionItems.length,
      dod: dodItems.length,
    }),
  );
}

export function clearUserNotesDecor(ctx) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const asArray = ctx?.utils?.asArray;
  if (!inst || !kind || !refs || typeof asArray !== "function") return;
  try {
    const canvas = inst.get("canvas");
    const overlays = inst.get("overlays");
    asArray(refs.userNotesMarkerStateRef.current[kind]).forEach((m) => {
      canvas.removeMarker(m.elementId, m.className);
    });
    asArray(refs.userNotesOverlayStateRef.current[kind]).forEach((id) => {
      overlays.remove(id);
    });
    refs.userNotesMarkerStateRef.current[kind] = [];
    refs.userNotesOverlayStateRef.current[kind] = [];
  } catch {
  }
}

export function applyUserNotesDecor(ctx) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const callbacks = ctx?.callbacks;
  const getters = ctx?.getters;
  const toText = ctx?.utils?.toText;
  if (!inst || !kind || !refs || !callbacks || !getters || typeof toText !== "function") return;
  clearUserNotesDecor(ctx);
  if (getters.isInterviewDecorModeOn()) return;
  const payload = buildUserNotesDecorPayload(ctx);
  if (!payload.length) return;
  try {
    const canvas = inst.get("canvas");
    const overlays = inst.get("overlays");
    const registry = inst.get("elementRegistry");

    const bindBadgeClick = (btn, onClick) => {
      btn.addEventListener("mousedown", (ev) => ev.stopPropagation());
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onClick?.();
      });
    };

    payload.forEach((item) => {
      const nodeId = toText(item?.elementId);
      const count = Number(item?.count || 0);
      if (!nodeId || count <= 0) return;
      const el = getters.findShapeByNodeId(registry, nodeId) || getters.findShapeForHint(registry, { nodeId, title: nodeId });
      if (!el) return;

      canvas.addMarker(el.id, "fpcHasUserNote");
      refs.userNotesMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcHasUserNote" });

      const stack = document.createElement("div");
      stack.className = "fpcNodeBadgeStack";
      stack.dataset.nodeId = nodeId;
      stack.style.alignItems = "flex-start";

      const badge = document.createElement("button");
      badge.type = "button";
      badge.className = "fpcNodeBadge fpcNodeBadge--notes";
      badge.dataset.badgeKind = "notes";
      badge.textContent = `N:${count}`;
      badge.title = `Заметок: ${count}`;
      bindBadgeClick(badge, () => {
        callbacks.setSelectedDecor(inst, kind, el.id);
        callbacks.emitElementSelection(el, `${kind}.notes_badge_click`);
      });
      stack.appendChild(badge);

      const overlayId = overlays.add(el.id, {
        position: { top: -18, left: 2 },
        html: stack,
      });
      refs.userNotesOverlayStateRef.current[kind].push(overlayId);
    });
  } catch {
  }
}

export function clearStepTimeDecor(ctx) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const asArray = ctx?.utils?.asArray;
  if (!inst || !kind || !refs || typeof asArray !== "function") return;
  try {
    const overlays = inst.get("overlays");
    asArray(refs.stepTimeOverlayStateRef.current[kind]).forEach((id) => {
      overlays.remove(id);
    });
    refs.stepTimeOverlayStateRef.current[kind] = [];
  } catch {
  }
}

export function applyStepTimeDecor(ctx) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const getters = ctx?.getters;
  const callbacks = ctx?.callbacks;
  const toText = ctx?.utils?.toText;
  const normalizeStepTimeUnit = ctx?.utils?.normalizeStepTimeUnit;
  const stepTimeUnitRef = ctx?.readOnly?.stepTimeUnitRef;
  if (
    !inst || !kind || !refs || !getters || !callbacks || !stepTimeUnitRef
    || typeof toText !== "function" || typeof normalizeStepTimeUnit !== "function"
  ) return;
  const payload = buildStepTimeDecorPayload(ctx);
  const unit = normalizeStepTimeUnit(stepTimeUnitRef.current);
  const stepTimeSig = toText(unit) + "|" + payload.map((i) => `${toText(i?.nodeId)}:${Number(i?.minutes)}:${Number(i?.seconds)}`).join(",");
  const prevStepTimeSig = toText(refs.stepTimeDecorSignatureRef?.current?.[kind] || "");
  if (prevStepTimeSig && prevStepTimeSig === stepTimeSig) return;
  runMeasure(
    ctx,
    "diagram.updateStepTimeOverlays",
    () => {
      clearStepTimeDecor(ctx);
      if (!payload.length) return;
      try {
        const overlays = inst.get("overlays");
        const registry = inst.get("elementRegistry");

        const bindBadgeClick = (btn, onClick) => {
          btn.addEventListener("mousedown", (ev) => ev.stopPropagation());
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            onClick?.();
          });
        };

        payload.forEach((item) => {
          const nodeId = toText(item?.nodeId);
          const minutes = Number(item?.minutes);
          const seconds = Number(item?.seconds);
          if (!nodeId || !Number.isFinite(minutes) || minutes < 0) return;
          const el = getters.findShapeByNodeId(registry, nodeId) || getters.findShapeForHint(registry, { nodeId, title: nodeId });
          if (!el) return;
          const value = unit === "sec"
            ? (Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : Math.round(minutes * 60))
            : Math.round(minutes);
          const unitLabel = unit === "sec" ? "сек" : "мин";

          const badge = document.createElement("button");
          badge.type = "button";
          badge.className = "fpcNodeBadge fpcNodeBadge--time";
          badge.dataset.badgeKind = "time";
          badge.textContent = `${value} ${unitLabel}`;
          badge.title = `Время шага: ${value} ${unitLabel}`;
          badge.style.transform = "translateX(-100%)";
          bindBadgeClick(badge, () => {
            callbacks.setSelectedDecor(inst, kind, el.id);
            callbacks.emitElementSelection(el, `${kind}.step_time_badge_click`);
          });

          const shapeWidth = Number(el?.width || 0);
          const shapeHeight = Number(el?.height || 0);
          const anchorLeft = Number.isFinite(shapeWidth) && shapeWidth > 0 ? shapeWidth - 2 : 96;
          const anchorTop = Number.isFinite(shapeHeight) && shapeHeight > 0 ? shapeHeight + 1 : 81;

          const overlayId = overlays.add(el.id, {
            position: { left: anchorLeft, top: anchorTop },
            html: badge,
          });
          refs.stepTimeOverlayStateRef.current[kind].push(overlayId);
        });
      } catch {
      }
    },
    () => ({ kind, items: payload.length }),
  );
  if (refs.stepTimeDecorSignatureRef?.current) {
    refs.stepTimeDecorSignatureRef.current[kind] = stepTimeSig;
  }
}

export function clearRobotMetaDecor(ctx) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const asObject = ctx?.utils?.asObject;
  const toText = ctx?.utils?.toText;
  if (!inst || !kind || !refs || typeof asObject !== "function" || typeof toText !== "function") return;
  const state = asObject(refs.robotMetaDecorStateRef.current[kind]);
  try {
    const canvas = inst.get("canvas");
    const overlays = inst.get("overlays");
    Object.values(state).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      const elementId = toText(entry?.elementId);
      const markerClass = toText(entry?.markerClass);
      const overlayId = entry?.overlayId;
      if (elementId && markerClass) {
        canvas.removeMarker(elementId, markerClass);
      }
      if (overlayId !== null && overlayId !== undefined) {
        overlays.remove(overlayId);
      }
    });
  } catch {
  }
  refs.robotMetaDecorStateRef.current[kind] = {};
}

export function applyRobotMetaDecor(ctx) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const getters = ctx?.getters;
  const toText = ctx?.utils?.toText;
  const asObject = ctx?.utils?.asObject;
  const robotMetaOverlayEnabledRef = ctx?.readOnly?.robotMetaOverlayEnabledRef;
  if (
    !inst || !kind || !refs || !getters || !robotMetaOverlayEnabledRef
    || typeof toText !== "function" || typeof asObject !== "function"
  ) return;
  if (!robotMetaOverlayEnabledRef.current) {
    clearRobotMetaDecor(ctx);
    return;
  }
  const payload = buildRobotMetaDecorPayload(ctx);
  if (!payload.length) {
    clearRobotMetaDecor(ctx);
    return;
  }

  try {
    const canvas = inst.get("canvas");
    const overlays = inst.get("overlays");
    const registry = inst.get("elementRegistry");
    const currentState = { ...asObject(refs.robotMetaDecorStateRef.current[kind]) };
    const nextState = {};

    payload.forEach((item) => {
      const nodeId = toText(item?.elementId);
      const el = getters.findShapeByNodeId(registry, nodeId) || getters.findShapeForHint(registry, { nodeId, title: nodeId });
      if (!el) return;
      const elementId = toText(el?.id);
      if (!elementId) return;
      const markerClass = toText(item?.markerClass);
      const signature = `${markerClass}|${toText(item?.badgeClass)}|${toText(item?.badgeText)}|${toText(item?.signature)}`;
      const prev = asObject(currentState[elementId]);
      const prevSignature = toText(prev?.signature);

      if (prevSignature && prevSignature === signature) {
        nextState[elementId] = prev;
        delete currentState[elementId];
        return;
      }

      const prevMarkerClass = toText(prev?.markerClass);
      if (prevMarkerClass) {
        canvas.removeMarker(elementId, prevMarkerClass);
      }
      if (prev?.overlayId !== null && prev?.overlayId !== undefined) {
        overlays.remove(prev.overlayId);
      }

      const badge = document.createElement("div");
      badge.className = `fpcNodeBadge fpcNodeBadge--robot ${toText(item?.badgeClass)}`;
      badge.textContent = toText(item?.badgeText);
      badge.title = toText(item?.tooltip);

      canvas.addMarker(elementId, markerClass);
      const overlayId = overlays.add(elementId, {
        position: { top: -18, left: 2 },
        html: badge,
      });
      nextState[elementId] = {
        elementId,
        markerClass,
        overlayId,
        signature,
      };
      delete currentState[elementId];
    });

    Object.values(currentState).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      const elementId = toText(entry?.elementId);
      const markerClass = toText(entry?.markerClass);
      if (elementId && markerClass) {
        canvas.removeMarker(elementId, markerClass);
      }
      if (entry?.overlayId !== null && entry?.overlayId !== undefined) {
        overlays.remove(entry.overlayId);
      }
    });

    refs.robotMetaDecorStateRef.current[kind] = nextState;
  } catch {
  }
}

export function clearPropertiesOverlayDecor(ctx) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const asObject = ctx?.utils?.asObject;
  const toText = ctx?.utils?.toText;
  if (!inst || !kind || !refs || typeof asObject !== "function" || typeof toText !== "function") return;
  const state = asObject(refs.propertiesOverlayStateRef?.current?.[kind]);
  try {
    const overlays = inst.get("overlays");
    Object.values(state).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      if (entry?.overlayId !== null && entry?.overlayId !== undefined) {
        overlays.remove(entry.overlayId);
      }
    });
  } catch {
  }
  refs.propertiesOverlayStateRef.current[kind] = {};
}

export function applyPropertiesOverlayDecor(ctx) {
  const inst = ctx?.inst;
  const kind = ctx?.kind;
  const refs = ctx?.refs;
  const getters = ctx?.getters;
  const readOnly = ctx?.readOnly;
  const toText = ctx?.utils?.toText;
  const asObject = ctx?.utils?.asObject;
  const asArray = ctx?.utils?.asArray;
  if (
    !inst || !kind || !refs || !getters || !readOnly
    || typeof toText !== "function" || typeof asObject !== "function" || typeof asArray !== "function"
  ) return;

  function normalizePreviewEntry(rawPreview) {
    const preview = asObject(rawPreview);
    const elementId = toText(preview?.elementId);
    const items = asArray(preview?.items).map((item) => ({
      key: toText(item?.key),
      label: toText(item?.label),
      value: toText(item?.value),
    })).filter((item) => item.label && item.value);
    const hiddenCount = Math.max(0, Number(preview?.hiddenCount || 0));
    const enabled = preview?.enabled === true && !!elementId && items.length > 0;
    if (!enabled) return null;
    return {
      elementId,
      items,
      hiddenCount,
    };
  }

  const previewByElementId = {};
  const alwaysEnabled = readOnly.propertiesOverlayAlwaysEnabledRef?.current === true;
  if (alwaysEnabled) {
    const alwaysMap = asObject(readOnly.propertiesOverlayAlwaysPreviewByElementIdRef?.current);
    Object.keys(alwaysMap).forEach((rawElementId) => {
      const normalized = normalizePreviewEntry(alwaysMap[rawElementId]);
      if (!normalized) return;
      previewByElementId[normalized.elementId] = normalized;
    });
  }
  const selectedPreview = normalizePreviewEntry(readOnly.selectedPropertiesOverlayPreviewRef?.current);
  if (selectedPreview) {
    previewByElementId[selectedPreview.elementId] = selectedPreview;
  }
  const previewEntries = Object.values(previewByElementId);
  if (!previewEntries.length) {
    clearPropertiesOverlayDecor(ctx);
    return;
  }

  const linkedPropertyFrequency = new Map();
  previewEntries.forEach((preview) => {
    asArray(preview?.items).forEach((item) => {
      const linkedKey = normalizeOverlayPropertyKey(item?.key || item?.label);
      if (!linkedKey) return;
      linkedPropertyFrequency.set(linkedKey, Number(linkedPropertyFrequency.get(linkedKey) || 0) + 1);
    });
  });

  try {
    const overlays = inst.get("overlays");
    const registry = inst.get("elementRegistry");
    const canvasZoom = readOverlayCanvasZoom(inst);
    const zoomBucket = Math.round(canvasZoom * 1000) / 1000;
    const currentState = { ...asObject(refs.propertiesOverlayStateRef.current[kind]) };
    const nextState = {};
    previewEntries.forEach((preview) => {
      const elementId = toText(preview?.elementId);
      const items = asArray(preview?.items);
      const hiddenCount = Math.max(0, Number(preview?.hiddenCount || 0));
      if (!elementId || !items.length) return;

      let el = (
        typeof getters.findDiagramElementForHint === "function"
          ? getters.findDiagramElementForHint(registry, { nodeId: elementId, title: elementId })
          : null
      )
        || getters.findShapeByNodeId(registry, elementId)
        || getters.findShapeForHint(registry, { nodeId: elementId, title: elementId });
      if (!el) return;

      const resolvedElementId = toText(el?.id);
      if (!resolvedElementId) return;
      const signature = JSON.stringify({
        elementId,
        items,
        hiddenCount,
        zoom: zoomBucket,
      });
      const prev = asObject(currentState[resolvedElementId]);
      if (toText(prev?.signature) === signature) {
        nextState[resolvedElementId] = prev;
        delete currentState[resolvedElementId];
        return;
      }

      if (prev?.overlayId !== null && prev?.overlayId !== undefined) {
        overlays.remove(prev.overlayId);
      }

      const isConnection = typeof getters.isConnectionElement === "function" && getters.isConnectionElement(el);
      const container = document.createElement("div");
      container.className = isConnection
        ? "fpcPropertyOverlay fpcPropertyOverlay--table fpcPropertyOverlay--sequence"
        : "fpcPropertyOverlay fpcPropertyOverlay--table fpcPropertyOverlay--task";
      container.dataset.nodeId = elementId;
      container.dataset.hostType = isConnection ? "sequence" : "task";
      const overlayGeometry = buildOverlayGeometry({ element: el, isConnection, canvasZoom });
      container.style.width = `${overlayGeometry.width}px`;
      container.style.maxWidth = `${overlayGeometry.width}px`;
      if (isConnection) {
        const sequenceMinWidth = Math.round(clampNumber(overlayGeometry.width - 4, 56, 102));
        const sequenceFont = clampNumber(overlayGeometry.width / 12.3, 7.7, 8.9);
        container.style.setProperty("--fpc-property-table-min-width", `${sequenceMinWidth}px`);
        container.style.setProperty("--fpc-property-grid-columns", "minmax(24px, 41%) minmax(28px, 59%)");
        container.style.setProperty("--fpc-property-font-size", `${sequenceFont.toFixed(2)}px`);
        container.style.setProperty("--fpc-property-font-scale", "1.15");
        container.style.setProperty("--fpc-property-row-padding", "1px 5px");
        container.style.setProperty("--fpc-property-row-min-height", "14px");
      } else {
        const taskMinWidth = Math.round(clampNumber(overlayGeometry.width - 4, 66, 134));
        const taskFont = clampNumber(overlayGeometry.width / 12.6, 8.1, 9.6);
        container.style.setProperty("--fpc-property-table-min-width", `${taskMinWidth}px`);
        container.style.setProperty("--fpc-property-grid-columns", "minmax(28px, 42%) minmax(34px, 58%)");
        container.style.setProperty("--fpc-property-font-size", `${taskFont.toFixed(2)}px`);
        container.style.setProperty("--fpc-property-font-scale", "1");
        container.style.setProperty("--fpc-property-row-padding", "1px 6px");
        container.style.setProperty("--fpc-property-row-min-height", "15px");
      }

      const table = document.createElement("div");
      table.className = "fpcPropertyTable";

      items.forEach((item) => {
        const row = document.createElement("div");
        const linkedKey = normalizeOverlayPropertyKey(item?.key || item?.label);
        const linkedCount = Number(linkedPropertyFrequency.get(linkedKey) || 0);
        const linkedClass = linkedKey && linkedCount > 1 ? " fpcPropertyRow--linked" : "";
        row.className = `fpcPropertyRow${linkedClass}`;
        row.title = `${item.label}: ${item.value}`;
        const colorModel = overlayPropertyColorByKey(linkedKey || item?.label);
        row.style.setProperty("--fpc-property-accent", colorModel.accent);
        row.style.setProperty("--fpc-property-bg", colorModel.background);
        row.style.setProperty("--fpc-property-accent-shadow", colorModel.shadow);
        if (linkedKey && linkedCount > 1) {
          row.dataset.linkedGroup = linkedKey;
        }

        const keyCell = document.createElement("span");
        keyCell.className = "fpcPropertyCell fpcPropertyCell--key";
        const keyText = document.createElement("span");
        keyText.className = "fpcPropertyKeyText";
        keyText.textContent = item.label;
        keyCell.appendChild(keyText);

        const keySep = document.createElement("span");
        keySep.className = "fpcPropertyKeySep";
        keySep.textContent = "|";
        keyCell.appendChild(keySep);
        row.appendChild(keyCell);

        const valueCell = document.createElement("span");
        valueCell.className = "fpcPropertyCell fpcPropertyCell--value";
        valueCell.textContent = item.value;
        row.appendChild(valueCell);

        table.appendChild(row);
      });

      if (hiddenCount > 0) {
        const moreRow = document.createElement("div");
        moreRow.className = "fpcPropertyRow fpcPropertyRow--summary";
        moreRow.textContent = `+${hiddenCount} ещё`;
        moreRow.title = `Еще свойств: ${hiddenCount}`;
        table.appendChild(moreRow);
      }
      container.appendChild(table);

      const overlayId = overlays.add(resolvedElementId, "fpc-properties", {
        position: { top: overlayGeometry.topOffset, left: overlayGeometry.anchorLeft },
        html: container,
        scale: false,
      });
      nextState[resolvedElementId] = {
        elementId: resolvedElementId,
        overlayId,
        signature,
      };
      delete currentState[resolvedElementId];
    });

    Object.values(currentState).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      if (entry?.overlayId !== null && entry?.overlayId !== undefined) {
        overlays.remove(entry.overlayId);
      }
    });
    refs.propertiesOverlayStateRef.current[kind] = nextState;
  } catch {
  }
}
