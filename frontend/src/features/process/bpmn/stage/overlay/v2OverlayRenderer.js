import { overlayPropertyColorByKey } from "../decor/overlayColorModel.js";
import { asArray, asText } from "./overlayUtils.js";

const V2_OVERLAY_IDLE_MAX_PROPS = 5;
const SEQUENCE_OVERLAY_MAX_WIDTH = 160;

function makeV2PropertyRow(prop) {
  const name = asText(prop?.name);
  if (!name) return null;
  let value = String(prop?.value ?? "");
  if (value.length > 80) value = `${value.slice(0, 80)}...`;

  const colorModel = overlayPropertyColorByKey(name || "property");

  const itemEl = document.createElement("li");
  itemEl.classList.add("fpc-overlay-v2-item");
  itemEl.style.setProperty("--fpc-property-accent", colorModel.accent);

  const nameEl = document.createElement("span");
  nameEl.classList.add("fpc-overlay-v2-name");
  nameEl.textContent = `${name}:`;

  const valueEl = document.createElement("span");
  valueEl.classList.add("fpc-overlay-v2-value");
  valueEl.textContent = value;

  itemEl.appendChild(nameEl);
  itemEl.appendChild(valueEl);
  return itemEl;
}

export function computeSequenceFlowMidpoint(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return null;
  let totalLength = 0;
  const segments = [];
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const start = waypoints[i];
    const end = waypoints[i + 1];
    const dx = Number(end?.x || 0) - Number(start?.x || 0);
    const dy = Number(end?.y || 0) - Number(start?.y || 0);
    const len = Math.sqrt(dx * dx + dy * dy);
    segments.push({ dx, dy, len, start });
    totalLength += len;
  }
  if (!Number.isFinite(totalLength) || totalLength <= 0) return null;

  const target = totalLength / 2;
  let accumulated = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (accumulated + seg.len >= target) {
      const t = seg.len > 0 ? (target - accumulated) / seg.len : 0;
      return {
        x: seg.start.x + seg.dx * t,
        y: seg.start.y + seg.dy * t,
      };
    }
    accumulated += seg.len;
  }
  const last = waypoints[waypoints.length - 1];
  return { x: Number(last?.x || 0), y: Number(last?.y || 0) };
}

export function createV2OverlayHost(element, content, expanded = false) {
  if (typeof document === "undefined") return null;

  const isSequenceFlow = Array.isArray(element?.waypoints) && String(element?.type).toLowerCase() === "bpmn:sequenceflow";
  const elWidth = Number(element?.width || 0);
  const properties = asArray(content?.properties).filter((prop) => asText(prop?.name));
  const titleText = asText(content?.title ?? content?.text);
  const displayName = asText(content?.displayName);
  const colorKey = asText(content?.colorKey || content?.meta?.type || "property");
  const colorModel = overlayPropertyColorByKey(colorKey || "property");

  const host = document.createElement("div");
  host.classList.add("fpc-overlay-v2-host");
  if (isSequenceFlow) {
    host.classList.add("fpc-overlay-v2-host--sequence");
  }
  if (expanded) {
    host.classList.add("fpc-overlay-v2-host--expanded");
  }
  host.dataset.fpcElementId = element.id;
  if (displayName) {
    // One-line derived name replaces the raw rows list in idle/compact mode;
    // expanded mode keeps the full rows with this as the title line (CSS).
    host.classList.add("fpc-overlay-v2-host--has-display-name");
  }
  host.style.setProperty("--fpc-overlay-accent", colorModel.accent);

  const v2HostWidth = isSequenceFlow
    ? Math.min(Number(element?.width || 0) || SEQUENCE_OVERLAY_MAX_WIDTH, SEQUENCE_OVERLAY_MAX_WIDTH)
    : elWidth;
  host.style.width = `${v2HostWidth}px`;

  const badge = document.createElement("div");
  badge.classList.add("fpc-overlay-v2-badge");
  badge.title = titleText;

  const hiddenCount = properties.length > V2_OVERLAY_IDLE_MAX_PROPS
    ? properties.length - V2_OVERLAY_IDLE_MAX_PROPS
    : 0;

  const footer = document.createElement("span");
  footer.classList.add("fpc-overlay-v2-footer");
  if (hiddenCount > 0) {
    footer.textContent = `+${hiddenCount}`;
    footer.dataset.hiddenCount = String(hiddenCount);
  }

  const list = document.createElement("ul");
  list.classList.add("fpc-overlay-v2-list");
  properties.forEach((prop) => {
    const row = makeV2PropertyRow(prop);
    if (row) list.appendChild(row);
  });

  if (hiddenCount > 0) {
    badge.appendChild(footer);
  }
  badge.appendChild(list);
  if (displayName) {
    // flex column-reverse on the badge → appended last renders as the FIRST
    // (top) line of the expanded card.
    const titleEl = document.createElement("div");
    titleEl.classList.add("fpc-overlay-v2-title");
    titleEl.textContent = displayName;
    titleEl.title = displayName;
    badge.appendChild(titleEl);
  }
  host.appendChild(badge);

  let position = { top: -20, left: 0 };
  if (isSequenceFlow) {
    const mid = computeSequenceFlowMidpoint(element.waypoints);
    if (mid) {
      host.style.top = `${mid.y - element.y - 20}px`;
      host.style.left = `${mid.x - element.x - v2HostWidth / 2}px`;
      position = { top: 0, left: 0 };
    }
  }

  return { host, position };
}

export function setV2OverlayExpandedForElement(elementId, expanded) {
  if (typeof document === "undefined" || !elementId) return;
  const selector = `.fpc-overlay-v2-host[data-fpc-element-id="${CSS.escape(elementId)}"]`;
  document.querySelectorAll(selector).forEach((host) => {
    host.classList.toggle("fpc-overlay-v2-host--expanded", expanded);
  });
}
