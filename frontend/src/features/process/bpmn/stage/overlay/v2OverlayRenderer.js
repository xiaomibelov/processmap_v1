import { overlayPropertyColorByKey } from "../decor/overlayColorModel.js";
import { asArray, asText } from "./overlayUtils.js";

const V2_OVERLAY_IDLE_MAX_PROPS = 5;
const SEQUENCE_OVERLAY_MAX_WIDTH = 160;
// Matches the fixed host height in legacy_bpmn.css (.fpc-overlay-v2-host {
// height: 20px }) — used for collision boxes so the constant cannot drift
// away from the rendered size.
const SEQUENCE_OVERLAY_HEIGHT = 20;
const SEQUENCE_OVERLAY_GAP = 4;
// Anti-collision search: first perpendicular to the flow (both directions),
// then along the flow as a secondary fallback axis.
const SEQUENCE_OVERLAY_NORMAL_OFFSETS = [0, 18, -18, 36, -36, 54, -54, 72, -72];
const SEQUENCE_OVERLAY_ALONG_OFFSETS = [40, -40, 80, -80];

function sequenceOverlayWidth(element) {
  return Math.min(Number(element?.width || 0) || SEQUENCE_OVERLAY_MAX_WIDTH, SEQUENCE_OVERLAY_MAX_WIDTH);
}

function makeV2PropertyRow(prop) {
  const name = asText(prop?.name);
  if (!name) return null;
  let value = String(prop?.value ?? "");
  if (value.length > 80) value = `${value.slice(0, 80)}...`;

  const colorModel = overlayPropertyColorByKey(name || "property");

  const itemEl = document.createElement("li");
  itemEl.classList.add("fpc-overlay-v2-item");
  itemEl.style.setProperty("--fpc-property-accent", colorModel.accent);
  itemEl.style.setProperty("--fpc-property-bg", colorModel.background);

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

function computeSequenceFlowMidpointInfo(waypoints) {
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
        dx: seg.dx,
        dy: seg.dy,
        len: seg.len,
      };
    }
    accumulated += seg.len;
  }
  const last = waypoints[waypoints.length - 1];
  const lastSeg = segments[segments.length - 1] || { dx: 0, dy: 0, len: 0 };
  return { x: Number(last?.x || 0), y: Number(last?.y || 0), dx: lastSeg.dx, dy: lastSeg.dy, len: lastSeg.len };
}

export function computeSequenceFlowMidpoint(waypoints) {
  const info = computeSequenceFlowMidpointInfo(waypoints);
  return info ? { x: info.x, y: info.y } : null;
}

// Unit normal (perpendicular) of the flow segment that contains the path
// midpoint — for multi-segment flows this is the "correct" bent segment, not
// the overall start→end direction. Biased to point upward (ny <= 0) so the
// first offset candidate lands above the flow.
export function computeSequenceFlowNormal(element) {
  const info = computeSequenceFlowMidpointInfo(element?.waypoints);
  if (!info || !Number.isFinite(info.len) || info.len <= 0) return null;
  let nx = -info.dy / info.len;
  let ny = info.dx / info.len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

export function boxesOverlap(a, b, gap = 4) {
  if (!a || !b) return false;
  return (
    a.x - gap < b.x + b.width &&
    a.x + a.width + gap > b.x &&
    a.y - gap < b.y + b.height &&
    a.y + a.height + gap > b.y
  );
}

function isValidViewbox(viewbox) {
  return !!viewbox && Number.isFinite(viewbox.x) && Number.isFinite(viewbox.y)
    && Number.isFinite(viewbox.width) && Number.isFinite(viewbox.height);
}

// Picks a collision-free position for a sequence-flow overlay card.
// Base position: card anchored above the path midpoint. Candidates are tried
// perpendicular to the flow first, then along it; a candidate must not overlap
// any blocker box (with a small gap) and must fit fully inside the viewbox
// when one is provided. Last resort: base position clamped into the viewbox
// (may overlap — better than not rendering or rendering off-screen).
export function computeSequenceFlowOverlayPlacement(element, blockers = [], viewbox = null) {
  const mid = computeSequenceFlowMidpoint(element?.waypoints);
  if (!mid) return null;
  const width = sequenceOverlayWidth(element);
  const height = SEQUENCE_OVERLAY_HEIGHT;
  const base = { top: mid.y - height, left: mid.x - width / 2 };
  const normal = computeSequenceFlowNormal(element) || { x: 0, y: -1 };
  const tangent = { x: -normal.y, y: normal.x };
  const vb = isValidViewbox(viewbox) ? viewbox : null;
  const blockerList = asArray(blockers);

  const fitsViewbox = (box) => !vb || (
    box.x >= vb.x &&
    box.y >= vb.y &&
    box.x + box.width <= vb.x + vb.width &&
    box.y + box.height <= vb.y + vb.height
  );
  const collides = (box) => blockerList.some((blocker) => boxesOverlap(box, blocker, SEQUENCE_OVERLAY_GAP));

  const candidates = [];
  for (const off of SEQUENCE_OVERLAY_NORMAL_OFFSETS) {
    candidates.push({ top: base.top + normal.y * off, left: base.left + normal.x * off });
  }
  for (const off of SEQUENCE_OVERLAY_ALONG_OFFSETS) {
    candidates.push({ top: base.top + tangent.y * off, left: base.left + tangent.x * off });
  }

  for (const candidate of candidates) {
    const box = { x: candidate.left, y: candidate.top, width, height };
    if (!fitsViewbox(box)) continue;
    if (collides(box)) continue;
    return { top: candidate.top, left: candidate.left, width, height };
  }

  let { top, left } = base;
  if (vb) {
    left = Math.min(Math.max(left, vb.x), vb.x + vb.width - width);
    top = Math.min(Math.max(top, vb.y), vb.y + vb.height - height);
  }
  return { top, left, width, height };
}

export function createV2OverlayHost(element, content, expanded = false, placement = null) {
  if (typeof document === "undefined") return null;

  const isSequenceFlow = Array.isArray(element?.waypoints) && String(element?.type).toLowerCase() === "bpmn:sequenceflow";
  const elWidth = Number(element?.width || 0);
  const properties = asArray(content?.properties).filter((prop) => asText(prop?.name));
  const titleText = asText(content?.title ?? content?.text);
  const displayName = asText(content?.displayName);

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
  // Card-level accent is intentionally NOT set: the badge background is a
  // neutral light surface, and each property row carries its own
  // --fpc-property-accent (see makeV2PropertyRow) as a colored left border.
  const v2HostWidth = isSequenceFlow ? sequenceOverlayWidth(element) : elWidth;
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
    // placement (absolute diagram coords of the card's top-left) comes from
    // computeSequenceFlowOverlayPlacement in the coordinator; without it fall
    // back to the plain midpoint anchor.
    let effective = placement;
    if (!effective) {
      const mid = computeSequenceFlowMidpoint(element.waypoints);
      if (mid) {
        effective = { top: mid.y - SEQUENCE_OVERLAY_HEIGHT, left: mid.x - v2HostWidth / 2 };
      }
    }
    if (effective) {
      host.style.top = `${effective.top - element.y}px`;
      host.style.left = `${effective.left - element.x}px`;
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
