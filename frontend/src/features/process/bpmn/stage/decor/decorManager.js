import {
  overlayPropertyColorByKey,
  overlayPropertyColorPlanForItems,
  normalizeOverlayPropertyKey,
} from "./overlayColorModel.js";
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
  if (refs.propertiesOverlayRenderSignatureRef?.current) {
    refs.propertiesOverlayRenderSignatureRef.current[kind] = "";
  }
}

function readOverlayReadingPoint(elementRaw) {
  const element = elementRaw && typeof elementRaw === "object" ? elementRaw : {};
  const waypoints = Array.isArray(element.waypoints) ? element.waypoints : [];
  if (waypoints.length) {
    const first = waypoints[0] && typeof waypoints[0] === "object" ? waypoints[0] : {};
    return {
      x: Number(first.x || 0),
      y: Number(first.y || 0),
    };
  }
  const x = Number(element.x || 0);
  const y = Number(element.y || 0);
  const width = Number(element.width || 0);
  const height = Number(element.height || 0);
  return {
    x: x + width / 2,
    y: y + height / 2,
  };
}

function readOverlayElementBounds(elementRaw) {
  const element = elementRaw && typeof elementRaw === "object" ? elementRaw : {};
  const waypoints = Array.isArray(element?.waypoints) ? element.waypoints : [];
  if (waypoints.length) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    waypoints.forEach((pointRaw) => {
      const point = pointRaw && typeof pointRaw === "object" ? pointRaw : {};
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }
  }
  const x = Number(element?.x);
  const y = Number(element?.y);
  const width = Number(element?.width);
  const height = Number(element?.height);
  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)) {
    return {
      x,
      y,
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }
  return null;
}

function readOverlayViewportContext(inst, canvasZoom) {
  try {
    const canvas = inst?.get?.("canvas");
    const viewbox = canvas?.viewbox?.();
    const x = Number(viewbox?.x);
    const y = Number(viewbox?.y);
    const width = Number(viewbox?.width);
    const height = Number(viewbox?.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(width > 0) || !(height > 0)) {
      return {
        signature: "all",
        bounds: null,
      };
    }
    const zoom = clampNumber(Number(canvasZoom || viewbox?.scale || 1), 0.2, 4);
    const marginUnits = clampNumber(220 / zoom, 80, 960);
    const bucketUnits = clampNumber(72 / zoom, 24, 320);
    return {
      signature: [
        Math.round(x / bucketUnits),
        Math.round(y / bucketUnits),
        Math.round(width / bucketUnits),
        Math.round(height / bucketUnits),
        Math.round(marginUnits),
      ].join(":"),
      bounds: {
        x: x - marginUnits,
        y: y - marginUnits,
        width: width + marginUnits * 2,
        height: height + marginUnits * 2,
      },
    };
  } catch {
    return {
      signature: "all",
      bounds: null,
    };
  }
}

function isOverlayBoundsInsideViewport(boundsRaw, viewportRaw) {
  const bounds = boundsRaw && typeof boundsRaw === "object" ? boundsRaw : null;
  const viewport = viewportRaw && typeof viewportRaw === "object" ? viewportRaw : null;
  if (!viewport || !bounds) return true;
  const left = Number(bounds?.x);
  const top = Number(bounds?.y);
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);
  const vx = Number(viewport?.x);
  const vy = Number(viewport?.y);
  const vw = Number(viewport?.width);
  const vh = Number(viewport?.height);
  if (
    !Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)
    || !Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vw) || !Number.isFinite(vh)
  ) {
    return true;
  }
  const right = left + Math.max(1, width);
  const bottom = top + Math.max(1, height);
  const viewportRight = vx + Math.max(1, vw);
  const viewportBottom = vy + Math.max(1, vh);
  return left <= viewportRight && right >= vx && top <= viewportBottom && bottom >= vy;
}

function sortEntriesByReadingOrder(entriesRaw) {
  const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
  return [...entries].sort((leftRaw, rightRaw) => {
    const left = leftRaw && typeof leftRaw === "object" ? leftRaw : {};
    const right = rightRaw && typeof rightRaw === "object" ? rightRaw : {};
    const leftPoint = readOverlayReadingPoint(left.el);
    const rightPoint = readOverlayReadingPoint(right.el);
    return (leftPoint.y - rightPoint.y) || (leftPoint.x - rightPoint.x);
  });
}

function summarizeSpatialTaskPlan(colorPlanRaw) {
  const colorPlan = Array.isArray(colorPlanRaw) ? colorPlanRaw : [];
  const families = Array.from(new Set(colorPlan.map((item) => String(item?.familyId || "")).filter(Boolean)));
  const leadTone = String(colorPlan[0]?.toneId || "");
  const familyTonePairs = [];
  const seenFamily = new Set();
  colorPlan.forEach((itemRaw) => {
    const item = itemRaw && typeof itemRaw === "object" ? itemRaw : {};
    const familyId = String(item.familyId || "");
    const toneId = String(item.toneId || "");
    if (!familyId || !toneId || seenFamily.has(familyId)) return;
    seenFamily.add(familyId);
    familyTonePairs.push({ familyId, toneId });
  });
  const toneCounts = colorPlan.reduce((acc, item) => {
    const tone = String(item?.toneId || "");
    if (!tone) return acc;
    acc[tone] = Number(acc[tone] || 0) + 1;
    return acc;
  }, {});
  let dominantTone = "";
  Object.entries(toneCounts).forEach(([tone, countRaw]) => {
    const count = Number(countRaw || 0);
    const current = Number(toneCounts[dominantTone] || 0);
    if (!dominantTone || count > current) {
      dominantTone = tone;
    }
  });
  return { families, dominantTone, leadTone, familyTonePairs };
}

const OVERLAY_VISIBLE_LIMIT_BY_HOST = Object.freeze({
  task: 4,
  gateway: 3,
  sequence: 3,
});

const OVERLAY_TEXT_LIMITS_BY_HOST = Object.freeze({
  task: { key: 24, value: 30 },
  gateway: { key: 20, value: 24 },
  sequence: { key: 18, value: 22 },
});

function resolveOverlayHostType({ element, isConnection = false, getters = null } = {}) {
  if (isConnection) return "sequence";
  if (typeof getters?.isGatewayElement === "function" && getters.isGatewayElement(element)) {
    return "gateway";
  }
  const elementType = String(
    element?.businessObject?.$type
    || element?.type
    || "",
  ).toLowerCase();
  if (elementType.includes("gateway")) return "gateway";
  return "task";
}

function overlayVisibleLimitByHost(hostTypeRaw) {
  const hostType = String(hostTypeRaw || "").toLowerCase();
  if (Object.hasOwn(OVERLAY_VISIBLE_LIMIT_BY_HOST, hostType)) {
    return Number(OVERLAY_VISIBLE_LIMIT_BY_HOST[hostType] || OVERLAY_VISIBLE_LIMIT_BY_HOST.task);
  }
  return OVERLAY_VISIBLE_LIMIT_BY_HOST.task;
}

function normalizeChipTextByLimit(textRaw, maxCharsRaw) {
  const text = String(textRaw || "").trim();
  const maxChars = Math.max(6, Number(maxCharsRaw || 0) || 0);
  if (!text || text.length <= maxChars) {
    return {
      text,
      truncated: false,
    };
  }
  return {
    text: `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`,
    truncated: true,
  };
}

function normalizeOverlayRowDisplayText({ hostType = "task", label = "", value = "" } = {}) {
  const limits = OVERLAY_TEXT_LIMITS_BY_HOST[hostType] || OVERLAY_TEXT_LIMITS_BY_HOST.task;
  const labelView = normalizeChipTextByLimit(label, limits.key);
  const valueView = normalizeChipTextByLimit(value, limits.value);
  return {
    label: labelView.text,
    value: valueView.text,
    labelTruncated: labelView.truncated,
    valueTruncated: valueView.truncated,
  };
}

export function buildPropertiesOverlayEntryBaseSignature({
  elementId = "",
  hostType = "task",
  orderIndex = -1,
  items = [],
  hiddenCount = 0,
  linkedFlags = [],
} = {}) {
  const safeElementId = String(elementId || "").trim();
  const safeHostType = String(hostType || "task").trim().toLowerCase() || "task";
  const safeOrderIndex = Number.isFinite(Number(orderIndex)) ? Number(orderIndex) : -1;
  const safeHiddenCount = Math.max(0, Number(hiddenCount || 0));
  const safeItems = (Array.isArray(items) ? items : [])
    .map((itemRaw) => {
      const item = itemRaw && typeof itemRaw === "object" ? itemRaw : {};
      return {
        key: String(item.key || "").trim(),
        label: String(item.label || "").trim(),
        value: String(item.value || "").trim(),
      };
    })
    .filter((item) => item.label && item.value);
  const safeLinkedFlags = (Array.isArray(linkedFlags) ? linkedFlags : [])
    .map((flagRaw) => Number(flagRaw || 0) > 0 ? 1 : 0);
  return JSON.stringify({
    elementId: safeElementId,
    hostType: safeHostType,
    orderIndex: safeOrderIndex,
    items: safeItems,
    hiddenCount: safeHiddenCount,
    linkedFlags: safeLinkedFlags,
  });
}

export function buildPropertiesOverlayEntryContentSignature({
  baseSignature = "",
  colorSignature = "",
} = {}) {
  return `${String(baseSignature || "").trim()}|${String(colorSignature || "").trim()}`;
}

export function buildPropertiesOverlayEntryGeometrySignature({
  hostType = "task",
  zoomBucket = 1,
  width = 0,
  topOffset = 0,
  anchorLeft = 0,
} = {}) {
  const safeHostType = String(hostType || "task").trim().toLowerCase() || "task";
  const safeZoom = Number.isFinite(Number(zoomBucket)) ? Number(zoomBucket) : 1;
  const safeWidth = Number.isFinite(Number(width)) ? Number(width) : 0;
  const safeTop = Number.isFinite(Number(topOffset)) ? Number(topOffset) : 0;
  const safeLeft = Number.isFinite(Number(anchorLeft)) ? Number(anchorLeft) : 0;
  return `${safeHostType}|${safeZoom}|${safeWidth}|${safeTop}|${safeLeft}`;
}

export function classifyPropertiesOverlayEntryOperation(prevEntryRaw, nextEntryRaw) {
  const prevEntry = prevEntryRaw && typeof prevEntryRaw === "object" ? prevEntryRaw : null;
  const nextEntry = nextEntryRaw && typeof nextEntryRaw === "object" ? nextEntryRaw : null;
  if (!prevEntry && nextEntry) return "add";
  if (prevEntry && !nextEntry) return "remove";
  if (!prevEntry && !nextEntry) return "none";
  const prevContent = String(prevEntry?.contentSignature || "").trim();
  const nextContent = String(nextEntry?.contentSignature || "").trim();
  if (!prevContent || prevContent !== nextContent) return "content_update";
  const prevGeometry = String(prevEntry?.geometrySignature || "").trim();
  const nextGeometry = String(nextEntry?.geometrySignature || "").trim();
  if (!prevGeometry || prevGeometry !== nextGeometry) return "position_update";
  return "unchanged";
}

function buildPropertiesOverlayRenderSignature({
  previewEntries,
  zoomBucket,
  alwaysEnabled,
  viewportSignature,
  toText,
  asArray,
}) {
  const entries = asArray(previewEntries)
    .map((entryRaw) => {
      const entry = entryRaw && typeof entryRaw === "object" ? entryRaw : {};
      const elementId = toText(entry?.elementId);
      if (!elementId) return null;
      const hiddenCount = Math.max(0, Number(entry?.hiddenCount || 0));
      const items = asArray(entry?.items)
        .map((itemRaw) => {
          const item = itemRaw && typeof itemRaw === "object" ? itemRaw : {};
          return {
            key: toText(item?.key),
            label: toText(item?.label),
            value: toText(item?.value),
          };
        })
        .filter((item) => item.label && item.value);
      if (!items.length) return null;
      return {
        elementId,
        hiddenCount,
        items,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.elementId.localeCompare(right.elementId));

  let hash = 2166136261;
  const push = (rawValue) => {
    const value = String(rawValue || "");
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  };

  push(alwaysEnabled ? "1" : "0");
  push(String(Number(zoomBucket || 0)));
  push(String(viewportSignature || "all"));
  entries.forEach((entry) => {
    push(entry.elementId);
    push(String(entry.hiddenCount));
    asArray(entry.items).forEach((item) => {
      push(item.key);
      push(item.label);
      push(item.value);
    });
  });
  return `${entries.length}:${hash >>> 0}`;
}

function applyOverlayContainerGeometry(container, hostType, overlayGeometry) {
  if (!container || typeof container !== "object") return;
  const width = Number(overlayGeometry?.width || 0);
  container.style.width = `${width}px`;
  container.style.maxWidth = `${width}px`;
  if (hostType === "sequence") {
    const sequenceMinWidth = Math.round(clampNumber(width - 4, 56, 102));
    const sequenceFont = clampNumber(width / 12.3, 7.7, 8.9);
    container.style.setProperty("--fpc-property-table-min-width", `${sequenceMinWidth}px`);
    container.style.setProperty("--fpc-property-grid-columns", "minmax(24px, 41%) minmax(28px, 59%)");
    container.style.setProperty("--fpc-property-font-size", `${sequenceFont.toFixed(2)}px`);
    container.style.setProperty("--fpc-property-font-scale", "1.15");
    container.style.setProperty("--fpc-property-row-padding", "1px 5px");
    container.style.setProperty("--fpc-property-row-min-height", "14px");
    container.style.setProperty("--fpc-property-row-gap", "4px");
  } else if (hostType === "gateway") {
    const gatewayMinWidth = Math.round(clampNumber(width - 8, 60, 122));
    const gatewayFont = clampNumber(width / 12.8, 7.8, 9.1);
    container.style.setProperty("--fpc-property-table-min-width", `${gatewayMinWidth}px`);
    container.style.setProperty("--fpc-property-grid-columns", "minmax(24px, 44%) minmax(30px, 56%)");
    container.style.setProperty("--fpc-property-font-size", `${gatewayFont.toFixed(2)}px`);
    container.style.setProperty("--fpc-property-font-scale", "1.08");
    container.style.setProperty("--fpc-property-row-padding", "1px 5px");
    container.style.setProperty("--fpc-property-row-min-height", "14px");
    container.style.setProperty("--fpc-property-row-gap", "4px");
  } else {
    const taskMinWidth = Math.round(clampNumber(width - 4, 66, 134));
    const taskFont = clampNumber(width / 12.6, 8.1, 9.6);
    container.style.setProperty("--fpc-property-table-min-width", `${taskMinWidth}px`);
    container.style.setProperty("--fpc-property-grid-columns", "minmax(28px, 42%) minmax(34px, 58%)");
    container.style.setProperty("--fpc-property-font-size", `${taskFont.toFixed(2)}px`);
    container.style.setProperty("--fpc-property-font-scale", "1");
    container.style.setProperty("--fpc-property-row-padding", "1px 6px");
    container.style.setProperty("--fpc-property-row-min-height", "15px");
    container.style.setProperty("--fpc-property-row-gap", "5px");
  }
}

function buildPropertiesOverlayContainer({
  elementId,
  hostType,
  items,
  hiddenCount,
  localColorPlan,
  linkedPropertyFrequency,
  normalizeOverlayRowDisplayText,
  normalizeOverlayPropertyKey,
  overlayPropertyColorByKey,
  toText,
  overlayGeometry,
}) {
  const container = document.createElement("div");
  const overlayHostClass = hostType === "sequence"
    ? "fpcPropertyOverlay--sequence"
    : hostType === "gateway"
      ? "fpcPropertyOverlay--gateway"
      : "fpcPropertyOverlay--task";
  container.className = `fpcPropertyOverlay fpcPropertyOverlay--table ${overlayHostClass}`;
  container.dataset.nodeId = elementId;
  container.dataset.hostType = hostType;
  applyOverlayContainerGeometry(container, hostType, overlayGeometry);

  const table = document.createElement("div");
  table.className = "fpcPropertyTable";

  items.forEach((item, itemIndex) => {
    const labelRaw = toText(item?.label);
    const valueRaw = toText(item?.value);
    const row = document.createElement("div");
    const linkedKey = normalizeOverlayPropertyKey(item?.key || item?.label);
    const linkedCount = Number(linkedPropertyFrequency.get(linkedKey) || 0);
    const linkedClass = linkedKey && linkedCount > 1 ? " fpcPropertyRow--linked" : "";
    const colorModel = localColorPlan[itemIndex] || overlayPropertyColorByKey(linkedKey || item?.label);
    const familyClass = colorModel?.familyId ? ` fpcPropertyRow--family-${toText(colorModel.familyId)}` : "";
    const toneClass = colorModel?.toneId ? ` fpcPropertyRow--tone-${toText(colorModel.toneId)}` : "";
    row.className = `fpcPropertyRow${linkedClass}${familyClass}${toneClass}`;
    row.title = `${labelRaw}: ${valueRaw}`;
    row.dataset.hostType = hostType;
    row.dataset.familyId = toText(colorModel?.familyId);
    row.dataset.toneId = toText(colorModel?.toneId);
    row.style.setProperty("--fpc-property-accent", colorModel.accent);
    row.style.setProperty("--fpc-property-bg", colorModel.background);
    row.style.setProperty("--fpc-property-border", colorModel.border || colorModel.accent);
    row.style.setProperty("--fpc-property-text", colorModel.text || colorModel.accent);
    row.style.setProperty("--fpc-property-ring", colorModel.ring || colorModel.accent);
    row.style.setProperty("--fpc-property-accent-shadow", colorModel.shadow);
    if (linkedKey && linkedCount > 1) {
      row.dataset.linkedGroup = linkedKey;
    }
    const displayText = normalizeOverlayRowDisplayText({
      hostType,
      label: labelRaw,
      value: valueRaw,
    });
    row.dataset.truncated = displayText.labelTruncated || displayText.valueTruncated ? "true" : "false";

    const keyCell = document.createElement("span");
    keyCell.className = "fpcPropertyCell fpcPropertyCell--key";
    keyCell.title = displayText.labelTruncated ? labelRaw : "";
    const keyText = document.createElement("span");
    keyText.className = "fpcPropertyKeyText";
    keyText.textContent = displayText.label;
    keyCell.appendChild(keyText);

    const keySep = document.createElement("span");
    keySep.className = "fpcPropertyKeySep";
    keySep.textContent = "|";
    keyCell.appendChild(keySep);
    row.appendChild(keyCell);

    const valueCell = document.createElement("span");
    valueCell.className = "fpcPropertyCell fpcPropertyCell--value";
    valueCell.title = displayText.valueTruncated ? valueRaw : "";
    const valueText = document.createElement("span");
    valueText.className = "fpcPropertyValueText";
    valueText.textContent = displayText.value;
    valueCell.appendChild(valueText);
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
  return container;
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

  const canvasZoom = readOverlayCanvasZoom(inst);
  const zoomBucket = Math.round(canvasZoom * 1000) / 1000;
  const viewportContext = readOverlayViewportContext(inst, canvasZoom);
  const renderSignature = buildPropertiesOverlayRenderSignature({
    previewEntries,
    zoomBucket,
    alwaysEnabled,
    viewportSignature: viewportContext.signature,
    toText,
    asArray,
  });
  const currentPropertiesState = asObject(refs.propertiesOverlayStateRef.current[kind]);
  const renderSignatureRef = refs.propertiesOverlayRenderSignatureRef?.current || null;
  const prevRenderSignature = renderSignatureRef ? toText(renderSignatureRef[kind]) : "";
  if (
    prevRenderSignature
    && prevRenderSignature === renderSignature
    && Object.keys(currentPropertiesState).length > 0
  ) {
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

  runMeasure(
    ctx,
    "diagram.updatePropertiesOverlays",
    () => {
      try {
        const overlays = inst.get("overlays");
        const registry = inst.get("elementRegistry");
        const activeViewportBounds = viewportContext.bounds;
        const currentState = { ...asObject(refs.propertiesOverlayStateRef.current[kind]) };
        const nextState = {};
        const resolvedEntries = [];
        previewEntries.forEach((preview) => {
          const elementId = toText(preview?.elementId);
          const items = asArray(preview?.items);
          const hiddenCount = Math.max(0, Number(preview?.hiddenCount || 0));
          if (!elementId || !items.length) return;
          const el = (
            typeof getters.findDiagramElementForHint === "function"
              ? getters.findDiagramElementForHint(registry, { nodeId: elementId, title: elementId })
              : null
          )
            || getters.findShapeByNodeId(registry, elementId)
            || getters.findShapeForHint(registry, { nodeId: elementId, title: elementId });
          if (!el) return;
          const resolvedElementId = toText(el?.id);
          if (!resolvedElementId) return;
          const elementBounds = readOverlayElementBounds(el);
          if (!isOverlayBoundsInsideViewport(elementBounds, activeViewportBounds)) return;
          const isConnection = typeof getters.isConnectionElement === "function" && getters.isConnectionElement(el);
          const hostType = resolveOverlayHostType({ element: el, isConnection, getters });
          const visibleLimit = overlayVisibleLimitByHost(hostType);
          const visibleItems = items.slice(0, visibleLimit);
          const overflowFromRenderer = Math.max(0, items.length - visibleItems.length);
          resolvedEntries.push({
            elementId,
            resolvedElementId,
            items: visibleItems,
            hiddenCount: hiddenCount + overflowFromRenderer,
            el,
            isConnection,
            hostType,
          });
        });

        if (!resolvedEntries.length) {
          clearPropertiesOverlayDecor(ctx);
          return;
        }

        const orderedEntries = sortEntriesByReadingOrder(resolvedEntries);
        const spatialTaskWindow = [];
        let spatialWindowDirty = false;
        orderedEntries.forEach((entry, orderIndex) => {
          const elementId = toText(entry?.elementId);
          const resolvedElementId = toText(entry?.resolvedElementId);
          const items = asArray(entry?.items);
          const hiddenCount = Math.max(0, Number(entry?.hiddenCount || 0));
          const el = entry?.el;
          const isConnection = !!entry?.isConnection;
          const hostType = toText(entry?.hostType) || (isConnection ? "sequence" : "task");
          if (!elementId || !resolvedElementId || !items.length || !el) return;
          const prev = asObject(currentState[resolvedElementId]);
          const linkedFlags = items.map((item) => {
            const linkedKey = normalizeOverlayPropertyKey(item?.key || item?.label);
            const linkedCount = Number(linkedPropertyFrequency.get(linkedKey) || 0);
            return linkedKey && linkedCount > 1 ? 1 : 0;
          });
          const baseSignature = buildPropertiesOverlayEntryBaseSignature({
            elementId,
            hostType,
            orderIndex,
            items,
            hiddenCount,
            linkedFlags,
          });
          const canReusePrepared = (
            toText(prev?.baseSignature) === baseSignature
            && (!spatialWindowDirty || isConnection)
            && Array.isArray(prev?.colorPlan)
            && (!isConnection || prev?.isConnection === true)
          );

          let localColorPlan = [];
          let entrySpatialSummary = null;
          let colorSignature = "";
          if (canReusePrepared) {
            localColorPlan = prev.colorPlan;
            colorSignature = toText(prev?.colorSignature);
            entrySpatialSummary = !isConnection ? asObject(prev?.spatialSummary) : null;
          } else {
            localColorPlan = isConnection
              ? overlayPropertyColorPlanForItems(items)
              : overlayPropertyColorPlanForItems(items, { spatialWindow: spatialTaskWindow });
            colorSignature = JSON.stringify(localColorPlan.map((color) => ({
              familyId: toText(color?.familyId),
              toneId: toText(color?.toneId),
              accent: toText(color?.accent),
              background: toText(color?.background),
              border: toText(color?.border),
              text: toText(color?.text),
            })));
            entrySpatialSummary = !isConnection ? summarizeSpatialTaskPlan(localColorPlan) : null;
            if (!isConnection) spatialWindowDirty = true;
          }
          if (!isConnection) {
            spatialTaskWindow.push(entrySpatialSummary || summarizeSpatialTaskPlan(localColorPlan));
            if (spatialTaskWindow.length > 6) spatialTaskWindow.shift();
          }
          const contentSignature = buildPropertiesOverlayEntryContentSignature({
            baseSignature,
            colorSignature,
          });
          const overlayGeometry = buildOverlayGeometry({ element: el, isConnection, canvasZoom });
          const geometrySignature = buildPropertiesOverlayEntryGeometrySignature({
            hostType,
            zoomBucket,
            width: overlayGeometry.width,
            topOffset: overlayGeometry.topOffset,
            anchorLeft: overlayGeometry.anchorLeft,
          });
          const nextEntry = {
            elementId: resolvedElementId,
            sourceElementId: elementId,
            contentSignature,
            baseSignature,
            colorSignature,
            geometrySignature,
            colorPlan: localColorPlan,
            spatialSummary: entrySpatialSummary,
            isConnection,
            hostType,
            items,
            hiddenCount,
            overlayGeometry,
          };
          const operation = classifyPropertiesOverlayEntryOperation(prev, nextEntry);
          if (operation === "remove") {
            return;
          }

          if (operation === "add" || operation === "content_update") {
            if (prev?.overlayId !== null && prev?.overlayId !== undefined) {
              overlays.remove(prev.overlayId);
            }
            const container = buildPropertiesOverlayContainer({
              elementId,
              hostType,
              items,
              hiddenCount,
              localColorPlan,
              linkedPropertyFrequency,
              normalizeOverlayRowDisplayText,
              normalizeOverlayPropertyKey,
              overlayPropertyColorByKey,
              toText,
              overlayGeometry,
            });
            const overlayId = overlays.add(resolvedElementId, "fpc-properties", {
              position: { top: overlayGeometry.topOffset, left: overlayGeometry.anchorLeft },
              html: container,
              scale: false,
            });
            nextState[resolvedElementId] = {
              ...nextEntry,
              overlayId,
              container,
            };
            delete currentState[resolvedElementId];
            return;
          }

          const reusableContainer = prev?.container && typeof prev.container === "object"
            ? prev.container
            : null;
          if (operation === "position_update" && reusableContainer) {
            applyOverlayContainerGeometry(reusableContainer, hostType, overlayGeometry);
            if (prev?.overlayId !== null && prev?.overlayId !== undefined) {
              overlays.remove(prev.overlayId);
            }
            const overlayId = overlays.add(resolvedElementId, "fpc-properties", {
              position: { top: overlayGeometry.topOffset, left: overlayGeometry.anchorLeft },
              html: reusableContainer,
              scale: false,
            });
            nextState[resolvedElementId] = {
              ...nextEntry,
              overlayId,
              container: reusableContainer,
            };
            delete currentState[resolvedElementId];
            return;
          }

          if (operation === "unchanged") {
            nextState[resolvedElementId] = {
              ...prev,
              ...nextEntry,
            };
            delete currentState[resolvedElementId];
            return;
          }

          const fallbackContainer = buildPropertiesOverlayContainer({
            elementId,
            hostType,
            items,
            hiddenCount,
            localColorPlan,
            linkedPropertyFrequency,
            normalizeOverlayRowDisplayText,
            normalizeOverlayPropertyKey,
            overlayPropertyColorByKey,
            toText,
            overlayGeometry,
          });
          if (prev?.overlayId !== null && prev?.overlayId !== undefined) {
            overlays.remove(prev.overlayId);
          }
          const overlayId = overlays.add(resolvedElementId, "fpc-properties", {
            position: { top: overlayGeometry.topOffset, left: overlayGeometry.anchorLeft },
            html: fallbackContainer,
            scale: false,
          });
          nextState[resolvedElementId] = {
            ...nextEntry,
            overlayId,
            container: fallbackContainer,
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
        if (renderSignatureRef) {
          renderSignatureRef[kind] = renderSignature;
        }
      } catch {
      }
    },
    () => ({
      kind,
      entries: previewEntries.length,
      linked: linkedPropertyFrequency.size,
      always: alwaysEnabled ? 1 : 0,
    }),
  );
}
