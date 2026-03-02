function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function toText(v) {
  return String(v || "").trim();
}

function resolveCtx(ctxBase) {
  if (typeof ctxBase === "function") return asObject(ctxBase());
  return asObject(ctxBase);
}

function createFlashRuntimeStateFallback() {
  return {
    node: {},
    badge: {},
    pill: {},
  };
}

function createPlaybackDecorRuntimeStateFallback() {
  return {
    nodeId: "",
    prevNodeId: "",
    flowId: "",
    subprocessId: "",
    frameKey: "",
    stepOverlayId: null,
    branchOverlayId: null,
    subprocessOverlayId: null,
    exitOverlayId: null,
    exitTimer: 0,
    markerNodeIds: [],
    markerFlowIds: [],
    markerSubprocessIds: [],
    overlayIds: [],
    gatewayOverlayId: null,
    cameraRaf: 0,
  };
}

function resolveShapeForNode(registry, nodeIdRaw, getters = {}) {
  const nodeId = toText(nodeIdRaw);
  if (!registry || !nodeId) return null;
  const findShapeByNodeId = getters.findShapeByNodeId;
  const findShapeForHint = getters.findShapeForHint;
  if (typeof findShapeByNodeId === "function") {
    const byNodeId = findShapeByNodeId(registry, nodeId);
    if (byNodeId) return byNodeId;
  }
  if (typeof findShapeForHint === "function") {
    return findShapeForHint(registry, { nodeId, title: nodeId });
  }
  return null;
}

function resolveFlashNodeClass(typeRaw) {
  const type = toText(typeRaw).toLowerCase();
  if (type === "ai") return "fpcNodeFlashAi";
  if (type === "notes") return "fpcNodeFlashNotes";
  if (type === "sync" || type === "xml") return "fpcNodeFlashSync";
  if (type === "flow" || type === "transition") return "fpcNodeFlashFlow";
  return "fpcNodeFlashAccent";
}

function resolveFlashBadgeClass(kindRaw) {
  const kind = toText(kindRaw).toLowerCase();
  if (kind === "notes") return "fpcNodeBadge--notes";
  if (kind === "dod") return "fpcNodeBadge--dod";
  return "fpcNodeBadge--ai";
}

function resolveFlashBadgeLabel(kindRaw) {
  const kind = toText(kindRaw).toLowerCase();
  if (kind === "notes") return "NOTES";
  if (kind === "dod") return "DoD";
  return "AI";
}

function resolveFlashPillLabel(typeRaw) {
  const type = toText(typeRaw).toLowerCase();
  if (type === "ai") return "AI added";
  if (type === "notes") return "Note added";
  if (type === "sync" || type === "xml") return "Synced";
  if (type === "flow" || type === "transition") return "Branch added";
  return "Updated";
}

function buildPlaybackGatewayOverlay(event, payload) {
  const options = asArray(event?.outgoingOptions);
  if (!options.length || typeof document === "undefined") return null;
  const onGatewayDecision = typeof payload?.onGatewayDecision === "function"
    ? payload.onGatewayDecision
    : null;
  const root = document.createElement("div");
  root.className = "fpcPlaybackBranchTag";
  root.style.pointerEvents = "auto";
  root.style.padding = "6px";
  root.style.borderRadius = "10px";
  root.style.display = "grid";
  root.style.gap = "6px";

  const title = document.createElement("div");
  title.style.fontSize = "10px";
  title.style.fontWeight = "700";
  title.textContent = "Выберите исход";
  root.appendChild(title);

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "4px";
  options.forEach((optionRaw) => {
    const option = asObject(optionRaw);
    const flowId = toText(option?.flowId);
    if (!flowId) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondaryBtn";
    btn.style.height = "26px";
    btn.style.padding = "0 8px";
    btn.style.fontSize = "11px";
    const label = toText(option?.label || option?.condition);
    const targetName = toText(option?.targetName || option?.targetId || flowId);
    btn.textContent = label ? `${label} -> ${targetName}` : targetName;
    btn.addEventListener("click", (eventClick) => {
      eventClick.preventDefault();
      eventClick.stopPropagation();
      onGatewayDecision?.({
        gatewayId: toText(event?.gatewayId || event?.nodeId),
        flowId,
      });
    });
    list.appendChild(btn);
  });
  root.appendChild(list);
  return root;
}

export function createPlaybackOverlayAdapter(ctxBase) {
  function getCtx() {
    const ctx = resolveCtx(ctxBase);
    const refs = asObject(ctx.refs);
    const getters = asObject(ctx.getters);
    const callbacks = asObject(ctx.callbacks);
    const readOnly = asObject(ctx.readOnly);
    const utils = asObject(ctx.utils);
    const createFlashRuntimeState = typeof utils.createFlashRuntimeState === "function"
      ? utils.createFlashRuntimeState
      : createFlashRuntimeStateFallback;
    const createPlaybackDecorRuntimeState = typeof utils.createPlaybackDecorRuntimeState === "function"
      ? utils.createPlaybackDecorRuntimeState
      : createPlaybackDecorRuntimeStateFallback;
    return {
      refs,
      getters,
      callbacks,
      readOnly,
      utils: {
        asArray: typeof utils.asArray === "function" ? utils.asArray : asArray,
        asObject: typeof utils.asObject === "function" ? utils.asObject : asObject,
        toText: typeof utils.toText === "function" ? utils.toText : toText,
        createFlashRuntimeState,
        createPlaybackDecorRuntimeState,
      },
    };
  }

  function clearPlaybackDecor(inst, kind) {
    if (!inst) return;
    const { refs, utils } = getCtx();
    const state = utils.asObject(refs.playbackDecorStateRef?.current?.[kind]);
    try {
      const canvas = inst.get("canvas");
      const overlays = inst.get("overlays");
      if (state?.cameraRaf) {
        window.cancelAnimationFrame(state.cameraRaf);
      }
      if (state?.exitTimer) {
        window.clearTimeout(state.exitTimer);
      }
      utils.asArray(state?.markerNodeIds).forEach((nodeIdRaw) => {
        const nodeId = utils.toText(nodeIdRaw);
        if (!nodeId) return;
        canvas.removeMarker(nodeId, "fpcPlaybackNodeActive");
        canvas.removeMarker(nodeId, "fpcPlaybackNodePrev");
      });
      utils.asArray(state?.markerFlowIds).forEach((flowIdRaw) => {
        const flowId = utils.toText(flowIdRaw);
        if (!flowId) return;
        canvas.removeMarker(flowId, "fpcPlaybackFlowActive");
      });
      utils.asArray(state?.markerSubprocessIds).forEach((subprocessIdRaw) => {
        const subprocessId = utils.toText(subprocessIdRaw);
        if (!subprocessId) return;
        canvas.removeMarker(subprocessId, "fpcPlaybackSubprocessActive");
      });
      [
        state?.stepOverlayId,
        state?.branchOverlayId,
        state?.subprocessOverlayId,
        state?.exitOverlayId,
        state?.gatewayOverlayId,
        ...utils.asArray(state?.overlayIds),
      ].forEach((overlayId) => {
        if (overlayId === null || overlayId === undefined) return;
        overlays.remove(overlayId);
      });
    } catch {
    }
    if (refs.playbackDecorStateRef?.current) {
      refs.playbackDecorStateRef.current[kind] = utils.createPlaybackDecorRuntimeState();
    }
  }

  function readElementBounds(inst, kind, elementIdRaw) {
    const { refs, utils } = getCtx();
    const elementId = utils.toText(elementIdRaw);
    if (!inst || !elementId) return null;
    const cache = utils.asObject(refs.playbackBboxCacheRef?.current?.[kind]);
    const cached = utils.asObject(cache[elementId]);
    if (Number.isFinite(cached?.width) && Number.isFinite(cached?.height)) return cached;
    try {
      const registry = inst.get("elementRegistry");
      const el = registry?.get?.(elementId);
      if (!el) return null;
      const x = Number(el?.x);
      const y = Number(el?.y);
      const width = Number(el?.width);
      const height = Number(el?.height);
      let box = null;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)) {
        box = { x, y, width, height };
      } else if (Array.isArray(el?.waypoints) && el.waypoints.length >= 2) {
        const xs = el.waypoints.map((p) => Number(p?.x)).filter(Number.isFinite);
        const ys = el.waypoints.map((p) => Number(p?.y)).filter(Number.isFinite);
        if (xs.length && ys.length) {
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          box = {
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
          };
        }
      }
      if (!box) return null;
      if (refs.playbackBboxCacheRef?.current) {
        refs.playbackBboxCacheRef.current[kind] = {
          ...cache,
          [elementId]: box,
        };
      }
      return box;
    } catch {
      return null;
    }
  }

  function readElementCenter(inst, kind, elementIdRaw) {
    const box = readElementBounds(inst, kind, elementIdRaw);
    if (!box) return null;
    return {
      x: Number(box?.x || 0) + Number(box?.width || 0) / 2,
      y: Number(box?.y || 0) + Number(box?.height || 0) / 2,
    };
  }

  function preparePlaybackCache(inst, kind, timelineItemsRaw) {
    if (!inst) return;
    const { utils } = getCtx();
    try {
      const ids = new Set();
      utils.asArray(timelineItemsRaw).forEach((itemRaw) => {
        const item = utils.asObject(itemRaw);
        const nodeId = utils.toText(item?.nodeId || item?.node_id || item?.bpmn_ref || item?.bpmn_id);
        const flowId = utils.toText(item?.flowId || item?.flow_id || item?.selected_flow_id);
        if (nodeId) ids.add(nodeId);
        if (flowId) ids.add(flowId);
      });
      ids.forEach((id) => {
        readElementBounds(inst, kind, id);
      });
    } catch {
    }
  }

  function centerPlaybackCamera(inst, kind, centerRaw, options = {}) {
    const { refs, utils } = getCtx();
    const center = utils.asObject(centerRaw);
    if (!inst || !Number.isFinite(center?.x) || !Number.isFinite(center?.y)) return false;
    try {
      const canvas = inst.get("canvas");
      const viewbox = utils.asObject(canvas?.viewbox?.());
      const width = Number(viewbox?.width || 0);
      const height = Number(viewbox?.height || 0);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
      const targetViewbox = {
        x: Number(center.x || 0) - width / 2,
        y: Number(center.y || 0) - height / 2,
        width,
        height,
      };
      const durationMs = Math.max(120, Math.min(640, Number(options?.durationMs || 280)));
      const state = utils.asObject(refs.playbackDecorStateRef?.current?.[kind]);
      if (state?.cameraRaf) {
        window.cancelAnimationFrame(state.cameraRaf);
      }
      const startViewbox = utils.asObject(canvas?.viewbox?.());
      const easing = (tRaw) => {
        const t = Math.max(0, Math.min(1, Number(tRaw || 0)));
        return t < 0.5 ? 2 * t * t : 1 - (Math.pow(-2 * t + 2, 2) / 2);
      };
      const startedAt = (typeof performance !== "undefined" && performance.now)
        ? performance.now()
        : Date.now();
      const animate = () => {
        const now = (typeof performance !== "undefined" && performance.now)
          ? performance.now()
          : Date.now();
        const progress = Math.max(0, Math.min(1, (now - startedAt) / durationMs));
        const k = easing(progress);
        canvas.viewbox({
          x: Number(startViewbox?.x || 0) + (targetViewbox.x - Number(startViewbox?.x || 0)) * k,
          y: Number(startViewbox?.y || 0) + (targetViewbox.y - Number(startViewbox?.y || 0)) * k,
          width: targetViewbox.width,
          height: targetViewbox.height,
        });
        if (progress >= 1) {
          if (refs.playbackDecorStateRef?.current) {
            refs.playbackDecorStateRef.current[kind] = {
              ...utils.asObject(refs.playbackDecorStateRef.current[kind]),
              cameraRaf: 0,
            };
          }
          return;
        }
        const rafId = window.requestAnimationFrame(animate);
        if (refs.playbackDecorStateRef?.current) {
          refs.playbackDecorStateRef.current[kind] = {
            ...utils.asObject(refs.playbackDecorStateRef.current[kind]),
            cameraRaf: rafId,
          };
        }
      };
      const firstRaf = window.requestAnimationFrame(animate);
      if (refs.playbackDecorStateRef?.current) {
        refs.playbackDecorStateRef.current[kind] = {
          ...utils.asObject(refs.playbackDecorStateRef.current[kind]),
          cameraRaf: firstRaf,
        };
      }

      const nextZoomRaw = Number(options?.targetZoom || 0);
      if (Number.isFinite(nextZoomRaw) && nextZoomRaw > 0.1) {
        canvas.zoom(Math.max(0.45, Math.min(1.8, nextZoomRaw)), center);
      }
      return true;
    } catch {
      return false;
    }
  }

  function applyPlaybackFrameOnInstance(inst, kind, payloadRaw = {}) {
    if (!inst) return false;
    const { refs, utils } = getCtx();
    const payload = utils.asObject(payloadRaw);
    const event = utils.asObject(payload?.event || payload?.frame);
    const index = Number(payload?.index || 0);
    const total = Number(payload?.total || 0);
    const eventType = utils.toText(event?.type);
    const nodeId = utils.toText(
      event?.nodeId
      || event?.gatewayId
      || event?.subprocessId
      || event?.toId
      || event?.fromId,
    );
    const frameKey = `${utils.toText(event?.id || "")}|${eventType}|${index}|${total}|${payload?.autoCamera ? 1 : 0}`;
    const prevState = utils.asObject(refs.playbackDecorStateRef?.current?.[kind]);
    if (utils.toText(prevState?.frameKey) === frameKey) return true;
    clearPlaybackDecor(inst, kind);

    try {
      const canvas = inst.get("canvas");
      const overlays = inst.get("overlays");
      const nextState = {
        ...utils.createPlaybackDecorRuntimeState(),
        frameKey,
      };
      const addOverlay = (elementIdRaw, position, htmlNode) => {
        const elementId = utils.toText(elementIdRaw);
        if (!elementId || !htmlNode) return null;
        const overlayId = overlays.add(elementId, { position, html: htmlNode });
        nextState.overlayIds = [...utils.asArray(nextState.overlayIds), overlayId];
        return overlayId;
      };
      const markNodeActive = (elementIdRaw, asPrev = false) => {
        const elementId = utils.toText(elementIdRaw);
        if (!elementId) return;
        canvas.addMarker(elementId, asPrev ? "fpcPlaybackNodePrev" : "fpcPlaybackNodeActive");
        nextState.markerNodeIds = [...utils.asArray(nextState.markerNodeIds), elementId];
      };
      const markFlowActive = (elementIdRaw) => {
        const elementId = utils.toText(elementIdRaw);
        if (!elementId) return;
        canvas.addMarker(elementId, "fpcPlaybackFlowActive");
        nextState.markerFlowIds = [...utils.asArray(nextState.markerFlowIds), elementId];
      };
      const markSubprocessActive = (elementIdRaw) => {
        const elementId = utils.toText(elementIdRaw);
        if (!elementId) return;
        canvas.addMarker(elementId, "fpcPlaybackSubprocessActive");
        nextState.markerSubprocessIds = [...utils.asArray(nextState.markerSubprocessIds), elementId];
      };

      const speed = Math.max(0.5, Math.min(4, Number(payload?.speed || 1)));
      const autoCamera = payload?.autoCamera === true;
      const containerNode = canvas?._container;
      if (containerNode?.style?.setProperty) {
        containerNode.style.setProperty("--fpc-playback-flow-dur", `${Math.max(0.16, 0.9 / speed)}s`);
      }
      const pill = document.createElement("div");
      pill.className = "fpcPlaybackPill";
      pill.textContent = `${Math.min(index + 1, Math.max(total, 1))}/${Math.max(total, 1)} · ${eventType || "event"}`;

      if (eventType === "take_flow") {
        const flowId = utils.toText(event?.flowId);
        markFlowActive(flowId);
        markNodeActive(event?.fromId, true);
        addOverlay(event?.toId || event?.fromId, { top: -16, left: 4 }, pill);
        if (autoCamera) {
          const fromCenter = readElementCenter(inst, kind, event?.fromId);
          const toCenter = readElementCenter(inst, kind, event?.toId);
          if (fromCenter && toCenter) {
            centerPlaybackCamera(inst, kind, {
              x: (Number(fromCenter.x || 0) + Number(toCenter.x || 0)) / 2,
              y: (Number(fromCenter.y || 0) + Number(toCenter.y || 0)) / 2,
            }, { durationMs: Math.round(240 / speed) });
          } else if (toCenter || fromCenter) {
            centerPlaybackCamera(inst, kind, toCenter || fromCenter, { durationMs: Math.round(240 / speed) });
          }
        }
      } else if (eventType === "enter_node") {
        markNodeActive(nodeId);
        addOverlay(nodeId, { top: -16, left: 4 }, pill);
        if (autoCamera) {
          const center = readElementCenter(inst, kind, nodeId);
          if (center) {
            centerPlaybackCamera(inst, kind, center, { durationMs: Math.round(280 / speed), targetZoom: 1.02 });
          }
        }
      } else if (eventType === "enter_subprocess" || eventType === "exit_subprocess") {
        const subprocessId = utils.toText(event?.subprocessId || nodeId);
        markSubprocessActive(subprocessId);
        const tag = document.createElement("div");
        tag.className = "fpcPlaybackSubprocessTag";
        tag.textContent = eventType === "enter_subprocess" ? "Entering…" : "Exiting…";
        addOverlay(subprocessId, { top: -16, left: 6 }, tag);
        if (autoCamera) {
          const center = readElementCenter(inst, kind, subprocessId);
          if (center) {
            centerPlaybackCamera(inst, kind, center, { durationMs: Math.round(280 / speed), targetZoom: 1.08 });
          }
        }
      } else if (eventType === "parallel_batch_begin" || eventType === "parallel_batch_end") {
        markNodeActive(event?.gatewayId);
        if (eventType === "parallel_batch_begin") {
          utils.asArray(event?.flowIds).slice(0, 4).forEach((flowIdRaw) => {
            markFlowActive(flowIdRaw);
          });
        }
        const batchTag = document.createElement("div");
        batchTag.className = "fpcPlaybackBranchTag";
        batchTag.textContent = eventType === "parallel_batch_begin"
          ? `parallel x${Number(event?.count || utils.asArray(event?.flowIds).length || 0)}`
          : "parallel done";
        addOverlay(event?.gatewayId, { bottom: -17, left: 2 }, batchTag);
      } else if (eventType === "wait_for_gateway_decision") {
        markNodeActive(event?.gatewayId);
        const gatewayOverlay = buildPlaybackGatewayOverlay(event, payload);
        if (gatewayOverlay) {
          nextState.gatewayOverlayId = addOverlay(event?.gatewayId, { bottom: -18, left: 6 }, gatewayOverlay);
        } else {
          const waitTag = document.createElement("div");
          waitTag.className = "fpcPlaybackBranchTag";
          waitTag.textContent = "Ожидание выбора ветки";
          addOverlay(event?.gatewayId, { bottom: -17, left: 2 }, waitTag);
        }
        if (autoCamera) {
          const center = readElementCenter(inst, kind, event?.gatewayId);
          if (center) {
            centerPlaybackCamera(inst, kind, center, { durationMs: Math.round(260 / speed) });
          }
        }
      } else if (eventType === "stop") {
        if (nodeId) markNodeActive(nodeId);
        const stopTag = document.createElement("div");
        stopTag.className = "fpcPlaybackBranchTag";
        stopTag.textContent = `stop: ${utils.toText(event?.reason || "done")}`;
        addOverlay(nodeId || event?.gatewayId || event?.subprocessId, { bottom: -17, left: 2 }, stopTag);
      } else {
        if (nodeId) {
          markNodeActive(nodeId);
          addOverlay(nodeId, { top: -16, left: 4 }, pill);
        }
      }

      nextState.nodeId = nodeId;
      nextState.flowId = utils.toText(event?.flowId);
      nextState.subprocessId = utils.toText(event?.subprocessId);
      if (refs.playbackDecorStateRef?.current) {
        refs.playbackDecorStateRef.current[kind] = nextState;
      }
      return true;
    } catch {
      return false;
    }
  }

  function clearFlashDecor(inst, kind) {
    const { refs, utils } = getCtx();
    const mode = kind === "editor" ? "editor" : "viewer";
    const state = utils.asObject(refs.flashStateRef?.current?.[mode]);
    const canvas = inst?.get?.("canvas");
    const overlays = inst?.get?.("overlays");

    Object.keys(utils.asObject(state.node)).forEach((key) => {
      const entry = utils.asObject(state.node[key]);
      if (entry.timer) window.clearTimeout(entry.timer);
      if (canvas && entry.elementId && entry.className) {
        try {
          canvas.removeMarker(entry.elementId, entry.className);
        } catch {
        }
      }
    });

    Object.keys(utils.asObject(state.badge)).forEach((key) => {
      const entry = utils.asObject(state.badge[key]);
      if (entry.timer) window.clearTimeout(entry.timer);
      if (entry.node && entry.className) {
        try {
          entry.node.classList.remove(entry.className);
        } catch {
        }
      }
      if (overlays && entry.overlayId) {
        try {
          overlays.remove(entry.overlayId);
        } catch {
        }
      }
    });

    Object.keys(utils.asObject(state.pill)).forEach((key) => {
      const entry = utils.asObject(state.pill[key]);
      if (entry.timer) window.clearTimeout(entry.timer);
      if (overlays && entry.overlayId) {
        try {
          overlays.remove(entry.overlayId);
        } catch {
        }
      }
    });

    if (refs.flashStateRef?.current) {
      refs.flashStateRef.current[mode] = utils.createFlashRuntimeState();
    }
  }

  function flashNodeOnInstance(inst, kind, nodeId, type = "accent", options = {}) {
    const { refs, getters, readOnly, utils } = getCtx();
    if (!inst || readOnly.prefersReducedMotionRef?.current) return false;
    const mode = kind === "editor" ? "editor" : "viewer";
    const nid = utils.toText(nodeId);
    if (!nid) return false;
    try {
      const registry = inst.get("elementRegistry");
      const canvas = inst.get("canvas");
      const overlays = inst.get("overlays");
      const el = resolveShapeForNode(registry, nid, getters);
      if (typeof getters.isShapeElement === "function" && !getters.isShapeElement(el)) return false;

      const cls = resolveFlashNodeClass(type);
      const durationRaw = Number(options?.durationMs);
      const durationMs = Number.isFinite(durationRaw) ? Math.max(300, Math.min(3000, durationRaw)) : 820;
      const nodeKey = `${nid}:${cls}`;
      const nodeState = utils.asObject(refs.flashStateRef?.current?.[mode]?.node?.[nodeKey]);
      if (nodeState.timer) {
        window.clearTimeout(nodeState.timer);
      }
      if (nodeState.elementId && nodeState.className) {
        try {
          canvas.removeMarker(nodeState.elementId, nodeState.className);
        } catch {
        }
      }
      canvas.addMarker(el.id, cls);
      const timer = window.setTimeout(() => {
        try {
          canvas.removeMarker(el.id, cls);
        } catch {
        }
        if (refs.flashStateRef?.current?.[mode]?.node) {
          delete refs.flashStateRef.current[mode].node[nodeKey];
        }
      }, durationMs);
      if (refs.flashStateRef?.current?.[mode]?.node) {
        refs.flashStateRef.current[mode].node[nodeKey] = {
          timer,
          elementId: el.id,
          className: cls,
        };
      }

      const showPill = options?.showPill !== false;
      if (!showPill) return true;
      const pillKey = `${nid}:${utils.toText(type).toLowerCase() || "accent"}`;
      const pillPrev = utils.asObject(refs.flashStateRef?.current?.[mode]?.pill?.[pillKey]);
      if (pillPrev.timer) window.clearTimeout(pillPrev.timer);
      if (pillPrev.overlayId) {
        try {
          overlays.remove(pillPrev.overlayId);
        } catch {
        }
      }

      const pill = document.createElement("div");
      const typeClass = utils.toText(type).toLowerCase() || "accent";
      pill.className = `fpcNodeFlashPill is-${typeClass}`;
      pill.textContent = String(options?.label || resolveFlashPillLabel(type));
      const overlayId = overlays.add(el.id, {
        position: { top: -34, right: -20 },
        html: pill,
      });
      const pillDurationRaw = Number(options?.pillDurationMs);
      const pillDuration = Number.isFinite(pillDurationRaw) ? Math.max(500, Math.min(4000, pillDurationRaw)) : 1800;
      const pillTimer = window.setTimeout(() => {
        try {
          overlays.remove(overlayId);
        } catch {
        }
        if (refs.flashStateRef?.current?.[mode]?.pill) {
          delete refs.flashStateRef.current[mode].pill[pillKey];
        }
      }, pillDuration);
      if (refs.flashStateRef?.current?.[mode]?.pill) {
        refs.flashStateRef.current[mode].pill[pillKey] = {
          timer: pillTimer,
          overlayId,
        };
      }
      return true;
    } catch {
      return false;
    }
  }

  function flashBadgeOnInstance(inst, kind, nodeId, badgeKind = "ai", options = {}) {
    const { refs, getters, readOnly, utils } = getCtx();
    if (!inst || readOnly.prefersReducedMotionRef?.current) return false;
    const mode = kind === "editor" ? "editor" : "viewer";
    const nid = utils.toText(nodeId);
    const bkind = utils.toText(badgeKind).toLowerCase() || "ai";
    if (!nid) return false;
    const key = `${nid}:${bkind}`;
    try {
      const canvas = inst.get("canvas");
      const overlays = inst.get("overlays");
      const registry = inst.get("elementRegistry");
      const el = resolveShapeForNode(registry, nid, getters);
      if (typeof getters.isShapeElement === "function" && !getters.isShapeElement(el)) return false;

      const state = utils.asObject(refs.flashStateRef?.current?.[mode]?.badge?.[key]);
      if (state.timer) window.clearTimeout(state.timer);
      if (state.overlayId) {
        try {
          overlays.remove(state.overlayId);
        } catch {
        }
      }
      if (state.node && state.className) {
        try {
          state.node.classList.remove(state.className);
        } catch {
        }
      }

      const container = canvas?._container || canvas?.getContainer?.();
      let targetBadge = null;
      if (container) {
        const stacks = container.querySelectorAll(".fpcNodeBadgeStack[data-node-id]");
        stacks.forEach((stackEl) => {
          if (targetBadge) return;
          if (utils.toText(stackEl?.dataset?.nodeId) !== nid) return;
          const badges = stackEl.querySelectorAll(".fpcNodeBadge[data-badge-kind]");
          badges.forEach((badgeEl) => {
            if (targetBadge) return;
            if (utils.toText(badgeEl?.dataset?.badgeKind).toLowerCase() === bkind) {
              targetBadge = badgeEl;
            }
          });
        });
      }

      const flashClass = "fpcNodeBadgeFlash";
      const durationRaw = Number(options?.durationMs);
      const durationMs = Number.isFinite(durationRaw) ? Math.max(300, Math.min(3000, durationRaw)) : 820;

      if (targetBadge) {
        targetBadge.classList.remove(flashClass);
        // eslint-disable-next-line no-unused-expressions
        targetBadge.offsetHeight;
        targetBadge.classList.add(flashClass);
        const timer = window.setTimeout(() => {
          try {
            targetBadge.classList.remove(flashClass);
          } catch {
          }
          if (refs.flashStateRef?.current?.[mode]?.badge) {
            delete refs.flashStateRef.current[mode].badge[key];
          }
        }, durationMs);
        if (refs.flashStateRef?.current?.[mode]?.badge) {
          refs.flashStateRef.current[mode].badge[key] = {
            timer,
            node: targetBadge,
            className: flashClass,
          };
        }
        return true;
      }

      const ghost = document.createElement("div");
      ghost.className = `fpcNodeBadge ${resolveFlashBadgeClass(bkind)} fpcNodeBadgeGhost ${flashClass}`;
      ghost.textContent = String(options?.label || resolveFlashBadgeLabel(bkind));
      const topOffset = bkind === "notes" ? 14 : (bkind === "dod" ? 32 : -12);
      const overlayId = overlays.add(el.id, {
        position: { top: topOffset, right: -20 },
        html: ghost,
      });
      const timer = window.setTimeout(() => {
        try {
          overlays.remove(overlayId);
        } catch {
        }
        if (refs.flashStateRef?.current?.[mode]?.badge) {
          delete refs.flashStateRef.current[mode].badge[key];
        }
      }, durationMs);
      if (refs.flashStateRef?.current?.[mode]?.badge) {
        refs.flashStateRef.current[mode].badge[key] = {
          timer,
          overlayId,
        };
      }
      return true;
    } catch {
      return false;
    }
  }

  function clearFocusDecor(inst, kind) {
    const { refs } = getCtx();
    const state = refs.focusStateRef?.current?.[kind];
    if (!state) return;
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = 0;
    }
    if (inst && state.elementId) {
      try {
        const canvas = inst.get("canvas");
        canvas.removeMarker(state.elementId, String(state.markerClass || "fpcNodeFocus"));
      } catch {
      }
    }
    state.elementId = "";
    state.markerClass = "fpcNodeFocus";
  }

  function focusNodeOnInstance(inst, kind, nodeId, options = {}) {
    if (!inst) return false;
    const { getters, callbacks } = getCtx();
    try {
      const registry = inst.get("elementRegistry");
      const canvas = inst.get("canvas");
      const el = typeof getters.findShapeByNodeId === "function"
        ? getters.findShapeByNodeId(registry, nodeId)
        : null;
      if (!el) return false;
      const markerClass = String(options?.markerClass || "fpcNodeFocus").trim() || "fpcNodeFocus";
      const durationRaw = Number(options?.durationMs);
      const durationMs = Number.isFinite(durationRaw) ? Math.max(800, Math.min(8000, durationRaw)) : 1900;
      const targetZoomRaw = Number(options?.targetZoom);
      const targetZoom = Number.isFinite(targetZoomRaw)
        ? Math.max(0.45, Math.min(1.6, targetZoomRaw))
        : null;
      const clearExistingSelection = options?.clearExistingSelection === true;

      const center = {
        x: Number(el.x || 0) + Number(el.width || 0) / 2,
        y: Number(el.y || 0) + Number(el.height || 0) / 2,
      };

      if (clearExistingSelection && typeof callbacks.clearSelectedDecor === "function") {
        callbacks.clearSelectedDecor(inst, kind);
      }

      if (typeof canvas.scrollToElement === "function") {
        canvas.scrollToElement(el, { top: 170, bottom: 170, left: 250, right: 250 });
      }
      if (targetZoom !== null) {
        canvas.zoom(targetZoom, center);
      } else {
        const z = canvas.zoom();
        if (!Number.isFinite(z) || z < 0.8) {
          canvas.zoom(1, center);
        }
      }

      clearFocusDecor(inst, kind);
      canvas.addMarker(el.id, markerClass);
      const focusState = getCtx().refs.focusStateRef;
      if (focusState?.current?.[kind]) {
        focusState.current[kind].elementId = el.id;
        focusState.current[kind].markerClass = markerClass;
        focusState.current[kind].timer = window.setTimeout(() => {
          try {
            canvas.removeMarker(el.id, markerClass);
          } catch {
          }
          focusState.current[kind].elementId = "";
          focusState.current[kind].timer = 0;
          focusState.current[kind].markerClass = "fpcNodeFocus";
        }, durationMs);
      }
      return true;
    } catch {
      return false;
    }
  }

  return {
    clearPlaybackDecor,
    centerPlaybackCamera,
    applyPlaybackFrameOnInstance,
    flashNodeOnInstance,
    flashBadgeOnInstance,
    focusNodeOnInstance,
    clearFlashDecor,
    clearFocusDecor,
    preparePlaybackCache,
  };
}

export default createPlaybackOverlayAdapter;
