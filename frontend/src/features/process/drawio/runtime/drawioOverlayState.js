function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

function toText(value) {
  return String(value || "").trim();
}

function buildDrawioLayerRenderMaps(metaRaw) {
  const meta = asObject(metaRaw);
  const layers = asArray(meta.drawio_layers_v1);
  const elements = asArray(meta.drawio_elements_v1);
  const layerMap = new Map();
  layers.forEach((layerRaw) => {
    const layer = asObject(layerRaw);
    const id = toText(layer.id);
    if (!id) return;
    layerMap.set(id, {
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: Math.max(0.05, Math.min(1, Number(layer.opacity || 1))),
    });
  });
  const elementMap = new Map();
  elements.forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const id = toText(row.id);
    if (!id) return;
    elementMap.set(id, {
      layer_id: toText(row.layer_id),
      visible: row.visible !== false,
      locked: row.locked === true,
      deleted: row.deleted === true,
      opacity: Math.max(0.05, Math.min(1, Number(row.opacity || 1))),
      offset_x: toNumber(row.offset_x ?? row.offsetX, 0),
      offset_y: toNumber(row.offset_y ?? row.offsetY, 0),
    });
  });
  return { layerMap, elementMap };
}

function mergeStyle(attrsRaw, patchStyleRaw) {
  const attrs = String(attrsRaw || "");
  const patchStyle = String(patchStyleRaw || "").trim();
  if (!patchStyle) return attrs;
  if (/\sstyle\s*=\s*"/i.test(attrs)) {
    return attrs.replace(/\sstyle\s*=\s*"([^"]*)"/i, (_match, existing) => {
      const joined = `${String(existing || "").trim()} ${patchStyle}`.trim();
      return ` style="${joined}"`;
    });
  }
  return `${attrs} style="${patchStyle}"`;
}

function formatSvgNumber(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

function mergeSvgTranslate(attrsRaw, offsetXRaw, offsetYRaw) {
  const attrs = String(attrsRaw || "");
  const offsetX = toNumber(offsetXRaw, 0);
  const offsetY = toNumber(offsetYRaw, 0);
  const hasOffset = Math.abs(offsetX) > 0.0001 || Math.abs(offsetY) > 0.0001;
  if (!hasOffset) return attrs;
  const translatePatch = `translate(${formatSvgNumber(offsetX)} ${formatSvgNumber(offsetY)})`;
  const transformPattern = /\stransform\s*=\s*"([^"]*)"|\stransform\s*=\s*'([^']*)'/i;
  if (transformPattern.test(attrs)) {
    return attrs.replace(transformPattern, (fullMatch, doubleValue, singleValue) => {
      const current = String(doubleValue || singleValue || "").trim();
      const next = current ? `${current} ${translatePatch}` : translatePatch;
      if (fullMatch.includes("\"")) return ` transform="${next}"`;
      return ` transform='${next}'`;
    });
  }
  return `${attrs} transform="${translatePatch}"`;
}

function resolveDrawioElementFlags(metaRaw, layerMap, elementMap, elementIdRaw) {
  const meta = asObject(metaRaw);
  const interactionMode = toText(meta.interaction_mode || meta.mode).toLowerCase();
  const interactionEditable = interactionMode ? interactionMode !== "view" : true;
  const elementId = toText(elementIdRaw);
  const hasElement = !!elementId && elementMap.has(elementId);
  const elementState = asObject(elementMap.get(elementId));
  const layerState = asObject(layerMap.get(toText(elementState.layer_id)));
  const visible = hasElement
    && layerState.visible !== false
    && elementState.visible !== false
    && elementState.deleted !== true;
  const editable = visible
    && interactionEditable
    && meta.locked !== true
    && layerState.locked !== true
    && elementState.locked !== true;
  return {
    visible,
    editable,
    layerLocked: layerState.locked === true,
    elementLocked: elementState.locked === true,
    globalLocked: meta.locked === true,
  };
}

function collectDrawioElementIdsFromTarget(targetRaw, rootRaw) {
  const target = targetRaw instanceof Element ? targetRaw : null;
  const root = rootRaw instanceof Element ? rootRaw : null;
  if (!target || !root) return [];
  const ids = [];
  const seen = new Set();
  let node = target;
  while (node instanceof Element) {
    if (!root.contains(node)) break;
    const tagName = toText(node.tagName).toLowerCase();
    const id = toText(node.getAttribute("data-drawio-el-id") || (tagName === "text" ? node.getAttribute("id") : ""));
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    if (node === root) break;
    node = node.parentElement;
  }
  return ids;
}

function resolveDrawioPointerElementId(targetRaw, rootRaw, metaRaw, layerMap, elementMap) {
  const chain = collectDrawioElementIdsFromTarget(targetRaw, rootRaw);
  if (!chain.length) return "";
  const outward = [...chain].reverse();
  for (let i = 0; i < outward.length; i += 1) {
    const id = outward[i];
    const flags = resolveDrawioElementFlags(metaRaw, layerMap, elementMap, id);
    if (flags.visible) return id;
  }
  for (let i = 0; i < chain.length; i += 1) {
    const id = chain[i];
    const flags = resolveDrawioElementFlags(metaRaw, layerMap, elementMap, id);
    if (flags.visible) return id;
  }
  return "";
}

function setStyleProperty(node, name, value) {
  if (!(node instanceof Element)) return;
  if (value === null || value === undefined || value === "") {
    node.style.removeProperty(name);
    return;
  }
  node.style.setProperty(name, String(value));
}

/**
 * Apply or remove selection highlight on a DOM node directly.
 * O(1) — no SVG re-render. Call when selectedId changes.
 */
function applyDrawioSelectionToNode(node, selected) {
  if (!(node instanceof Element)) return;
  if (selected) {
    node.setAttribute("data-drawio-selected", "1");
    if (!node.hasAttribute("data-drawio-prev-stroke")) {
      node.setAttribute("data-drawio-prev-stroke", node.style.getPropertyValue("stroke") || "");
      node.setAttribute("data-drawio-prev-stroke-width", node.style.getPropertyValue("stroke-width") || "");
      node.setAttribute("data-drawio-prev-filter", node.style.getPropertyValue("filter") || "");
    }
    setStyleProperty(node, "stroke", "#2563eb");
    setStyleProperty(node, "stroke-width", "2.4");
    setStyleProperty(node, "filter", "drop-shadow(0 0 2px rgba(37,99,235,.45))");
  } else {
    node.removeAttribute("data-drawio-selected");
    setStyleProperty(node, "stroke", node.getAttribute("data-drawio-prev-stroke") || null);
    setStyleProperty(node, "stroke-width", node.getAttribute("data-drawio-prev-stroke-width") || null);
    setStyleProperty(node, "filter", node.getAttribute("data-drawio-prev-filter") || null);
    node.removeAttribute("data-drawio-prev-stroke");
    node.removeAttribute("data-drawio-prev-stroke-width");
    node.removeAttribute("data-drawio-prev-filter");
  }
}

function readBaseTransform(node) {
  if (!(node instanceof Element)) return "";
  const cached = node.getAttribute("data-drawio-base-transform");
  if (cached !== null) return String(cached || "");
  const current = String(node.getAttribute("transform") || "").trim();
  node.setAttribute("data-drawio-base-transform", current);
  return current;
}

function applyDrawioNodeRenderState(node, metaRaw, layerMap, elementMap, draftOffsetRaw = null) {
  if (!(node instanceof Element)) return;
  const elementId = toText(node.getAttribute("id"));
  if (!elementId) return;
  if (!elementMap.has(elementId)) {
    // Element exists in SVG but is not tracked in elementMap.
    // Hide it completely to prevent ghost rendering (visible but non-interactive).
    node.removeAttribute("data-drawio-el-id");
    setStyleProperty(node, "display", "none");
    setStyleProperty(node, "pointer-events", "none");
    return;
  }
  const elementState = asObject(elementMap.get(elementId));
  const layerState = asObject(layerMap.get(toText(elementState.layer_id)));
  const flags = resolveDrawioElementFlags(metaRaw, layerMap, elementMap, elementId);
  const visible = flags.visible;
  const interactive = flags.editable;
  const opacity = Math.max(0.05, Math.min(1, Number(layerState.opacity || 1) * Number(elementState.opacity || 1)));
  const draftOffset = asObject(draftOffsetRaw);
  const draftId = toText(draftOffset.id);
  const offsetX = draftId && draftId === elementId ? toNumber(draftOffset.offset_x, 0) : toNumber(elementState.offset_x, 0);
  const offsetY = draftId && draftId === elementId ? toNumber(draftOffset.offset_y, 0) : toNumber(elementState.offset_y, 0);
  const hasOffset = Math.abs(offsetX) > 0.0001 || Math.abs(offsetY) > 0.0001;
  const baseTransform = readBaseTransform(node);
  const nextTransform = hasOffset
    ? `${baseTransform ? `${baseTransform} ` : ""}translate(${formatSvgNumber(offsetX)} ${formatSvgNumber(offsetY)})`
    : baseTransform;
  node.setAttribute("data-drawio-el-id", elementId);
  if (nextTransform) {
    node.setAttribute("transform", nextTransform);
  } else {
    node.removeAttribute("transform");
  }
  if (visible) {
    setStyleProperty(node, "display", null);
    setStyleProperty(node, "opacity", opacity);
    setStyleProperty(node, "pointer-events", interactive ? "auto" : "none");
    setStyleProperty(node, "cursor", interactive ? "move" : "default");
  } else {
    setStyleProperty(node, "display", "none");
    setStyleProperty(node, "opacity", 0);
    setStyleProperty(node, "pointer-events", "none");
    setStyleProperty(node, "cursor", "default");
  }
}

function applyDrawioLayerRenderStateToDom(rootRaw, metaRaw, draftOffsetRaw = null, prebuiltMapsRaw = null) {
  const root = rootRaw instanceof Element ? rootRaw : null;
  if (!root) return;
  const prebuilt = prebuiltMapsRaw && prebuiltMapsRaw.layerMap && prebuiltMapsRaw.elementMap
    ? prebuiltMapsRaw
    : buildDrawioLayerRenderMaps(metaRaw);
  const { layerMap, elementMap } = prebuilt;
  const nodes = root.querySelectorAll("[id]");
  for (const node of nodes) {
    applyDrawioNodeRenderState(node, metaRaw, layerMap, elementMap, draftOffsetRaw);
  }
}

function applyDrawioLayerRenderState(bodyRaw, metaRaw, _selectedIdRaw = "", draftOffsetRaw = null, prebuiltMapsRaw = null) {
  const body = String(bodyRaw || "");
  if (!body) return body;
  const prebuilt = prebuiltMapsRaw && prebuiltMapsRaw.layerMap && prebuiltMapsRaw.elementMap
    ? prebuiltMapsRaw
    : buildDrawioLayerRenderMaps(metaRaw);
  const { layerMap, elementMap } = prebuilt;
  // selectedId is intentionally NOT used here — selection is applied via
  // applyDrawioSelectionToNode (direct DOM) so a selection change does not
  // trigger a full SVG regex re-render.
  const draftOffset = asObject(draftOffsetRaw);
  const draftId = toText(draftOffset.id);
  const draftX = toNumber(draftOffset.offset_x, 0);
  const draftY = toNumber(draftOffset.offset_y, 0);
  return body.replace(
    /<([a-zA-Z][a-zA-Z0-9:_-]*)([^>]*?)\sid\s*=\s*("([^"]+)"|'([^']+)')([^>]*)>/g,
    (fullMatch, tagName, beforeIdAttrs, _idQuoted, idDouble, idSingle, afterIdAttrs) => {
      const elementId = toText(idDouble || idSingle);
      if (!elementId) return fullMatch;
      const isSelfClosing = /\/\s*>$/.test(String(fullMatch || ""));
      const afterAttrsRaw = String(afterIdAttrs || "");
      const afterAttrs = isSelfClosing ? afterAttrsRaw.replace(/\/\s*$/, "") : afterAttrsRaw;
      if (!elementMap.has(elementId)) {
        let passthroughAttrs = `${String(beforeIdAttrs || "")}${afterAttrs}`;
        passthroughAttrs = mergeStyle(passthroughAttrs, "pointer-events:none;");
        return `<${tagName}${passthroughAttrs} id="${elementId}"${isSelfClosing ? " />" : ">"}`;
      }
      const elementState = asObject(elementMap.get(elementId));
      const layerState = asObject(layerMap.get(toText(elementState.layer_id)));
      const flags = resolveDrawioElementFlags(metaRaw, layerMap, elementMap, elementId);
      const visible = flags.visible;
      const interactive = flags.editable;
      const opacity = Math.max(0.05, Math.min(1, Number(layerState.opacity || 1) * Number(elementState.opacity || 1)));
      const offsetX = draftId && draftId === elementId ? draftX : toNumber(elementState.offset_x, 0);
      const offsetY = draftId && draftId === elementId ? draftY : toNumber(elementState.offset_y, 0);
      const patchStyle = visible
        ? `opacity:${opacity}; pointer-events:${interactive ? "auto" : "none"}; cursor:${flags.editable ? "move" : "default"};`
        : "display:none; opacity:0; pointer-events:none;";
      let patchedAttrs = `${String(beforeIdAttrs || "")}${afterAttrs}`;
      patchedAttrs = mergeSvgTranslate(patchedAttrs, offsetX, offsetY);
      patchedAttrs = mergeStyle(patchedAttrs, patchStyle);
      if (!/\sdata-drawio-el-id=/.test(patchedAttrs)) {
        patchedAttrs = `${patchedAttrs} data-drawio-el-id="${elementId}"`;
      }
      return `<${tagName}${patchedAttrs} id="${elementId}"${isSelfClosing ? " />" : ">"}`;
    },
  );
}

export {
  asArray,
  asObject,
  toNumber,
  toText,
  buildDrawioLayerRenderMaps,
  resolveDrawioElementFlags,
  collectDrawioElementIdsFromTarget,
  resolveDrawioPointerElementId,
  applyDrawioLayerRenderState,
  applyDrawioLayerRenderStateToDom,
  applyDrawioSelectionToNode,
};
