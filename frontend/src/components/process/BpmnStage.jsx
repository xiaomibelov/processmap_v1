import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { apiDeleteBpmnXml, apiGetBpmnXml, apiPutBpmnXml } from "../../lib/api/bpmnApi";
import { traceProcess } from "../../features/process/lib/processDebugTrace";
import createBpmnRuntime from "../../features/process/bpmn/runtime/createBpmnRuntime";
import createBpmnStore from "../../features/process/bpmn/store/createBpmnStore";
import createBpmnCoordinator from "../../features/process/bpmn/coordinator/createBpmnCoordinator";
import createBpmnPersistence from "../../features/process/bpmn/persistence/createBpmnPersistence";
import {
  saveBpmnSnapshot,
  getLatestBpmnSnapshot,
} from "../../features/process/bpmn/snapshots/bpmnSnapshots";
import { elementNotesCount, normalizeElementNotesMap } from "../../features/notes/elementNotes";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function toText(v) {
  return String(v || "").trim();
}

function normalizeLoose(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAiQuestionStatus(raw) {
  const status = String(raw || "").trim().toLowerCase();
  return status === "done" ? "done" : "open";
}

function normalizeAiQuestionItems(rawList) {
  return asArray(rawList)
    .map((raw, idx) => {
      const item = asObject(raw);
      const qid = toText(item?.qid || item?.id || item?.question_id || item?.questionId || `q_${idx + 1}`);
      const text = toText(item?.text || item?.question || item?.label);
      if (!qid || !text) return null;
      return {
        qid,
        text,
        comment: toText(item?.comment || item?.answer),
        status: normalizeAiQuestionStatus(item?.status),
        createdAt: Number(item?.createdAt || item?.created_at || item?.ts || Date.now()) || Date.now(),
        updatedAt: Number(item?.updatedAt || item?.updated_at || item?.createdAt || Date.now()) || Date.now(),
        source: toText(item?.source || "ai"),
        stepId: toText(item?.stepId || item?.step_id),
      };
    })
    .filter(Boolean);
}

function normalizeAiQuestionsByElementMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return {};
  const out = {};
  Object.keys(rawMap).forEach((rawElementId) => {
    const elementId = toText(rawElementId);
    if (!elementId) return;
    const rawEntry = rawMap[rawElementId];
    const rawItems = Array.isArray(rawEntry)
      ? rawEntry
      : (Array.isArray(rawEntry?.items) ? rawEntry.items : []);
    const items = normalizeAiQuestionItems(rawItems)
      .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
    if (items.length) out[elementId] = items;
  });
  return out;
}

function aiQuestionStats(rawItems) {
  const items = normalizeAiQuestionItems(rawItems);
  const total = items.length;
  const done = items.filter((q) => normalizeAiQuestionStatus(q?.status) === "done").length;
  const withoutComment = items.filter((q) => !toText(q?.comment)).length;
  return {
    total,
    done,
    open: Math.max(total - done, 0),
    withoutComment,
  };
}

function shouldLogAiOverlayTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_AI__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_ai") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logAiOverlayTrace(tag, payload = {}) {
  if (!shouldLogAiOverlayTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[AI_OVERLAY] ${String(tag || "trace")} ${suffix}`.trim());
}

function colorFromKey(key) {
  let h = 17;
  const src = normalizeLoose(key || "sp");
  for (let i = 0; i < src.length; i += 1) {
    h = (h * 31 + src.charCodeAt(i)) % 360;
  }
  return `hsl(${h} 88% 74%)`;
}

function localKey(sessionId) {
  return `fpc_bpmn_xml_${sessionId}`;
}

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function safeBpmnId(raw) {
  let s = String(raw || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!s) s = "id";
  if (!/^[A-Za-z_]/.test(s)) s = `id_${s}`;
  return s;
}

function escapeXmlAttr(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function validateBpmnXmlText(rawXml) {
  const raw = String(rawXml || "").trim();
  if (!raw) return "XML пустой";
  if (!raw.includes("<") || (!raw.includes("definitions") && !raw.includes("bpmn:"))) {
    return "Это не BPMN XML";
  }
  try {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(raw, "application/xml");
      const parserErr = doc.getElementsByTagName("parsererror");
      if (parserErr && parserErr.length > 0) {
        return "XML содержит синтаксические ошибки";
      }
    }
  } catch {
    return "XML содержит синтаксические ошибки";
  }
  return "";
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function shouldLogBpmnTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_BPMN__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_bpmn") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logBpmnTrace(tag, xmlText, meta = null) {
  if (!shouldLogBpmnTrace()) return;
  const xml = String(xmlText || "");
  const extra = meta && typeof meta === "object"
    ? Object.entries(meta)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" ")
    : "";
  const suffix = extra ? ` ${extra}` : "";
  // eslint-disable-next-line no-console
  console.debug(`[BPMN] ${String(tag || "unknown")} len=${xml.length} hash=${fnv1aHex(xml)}${suffix}`);
}

let runtimeInstanceSeq = 0;
let runtimeContainerSeq = 0;

function ensureContainerKey(node) {
  if (!node || typeof node !== "object") return "";
  if (!node.__fpcContainerKey) {
    runtimeContainerSeq += 1;
    node.__fpcContainerKey = `container_${runtimeContainerSeq}`;
  }
  return String(node.__fpcContainerKey || "");
}

function logRuntimeTrace(tag, meta = {}) {
  if (!shouldLogBpmnTrace()) return;
  const suffix = Object.entries(meta || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[RUNTIME] ${String(tag || "event")} ${suffix}`.trim());
}

function logEnsureTrace(tag, meta = {}) {
  if (!shouldLogBpmnTrace()) return;
  const suffix = Object.entries(meta || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[ENSURE] ${String(tag || "event")} ${suffix}`.trim());
}

function logImportTrace(tag, meta = {}) {
  if (!shouldLogBpmnTrace()) return;
  const suffix = Object.entries(meta || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[IMPORT] ${String(tag || "event")} ${suffix}`.trim());
}

function seedFromActors(roles = [], startRole = "", poolTitle = "") {
  const clean = roles.map((r) => String(r || "").trim()).filter(Boolean);
  const laneNames = clean.length ? clean : ["Actor"];
  const startLaneName = String(startRole || "").trim();
  const startLaneIndex = Math.max(0, laneNames.includes(startLaneName) ? laneNames.indexOf(startLaneName) : 0);
  const endLaneIndex = Math.max(0, laneNames.length - 1);
  const participantName = escapeXmlAttr(String(poolTitle || "").trim());

  const poolX = 140;
  const poolY = 90;
  const poolW = 1600;
  const laneH = 150;
  const poolH = laneNames.length * laneH;

  const startX = poolX + 140;
  const startY = poolY + startLaneIndex * laneH + Math.floor(laneH / 2) - 18;
  const endX = poolX + poolW - 230;
  const endY = poolY + endLaneIndex * laneH + Math.floor(laneH / 2) - 18;
  const midX = Math.max(startX + 260, Math.round((startX + endX) / 2));

  const lanesXml = laneNames
    .map((name, i) => {
      const id = `Lane_${i + 1}`;
      const refs = [];
      if (i === startLaneIndex) refs.push("<bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>");
      if (i === endLaneIndex) refs.push("<bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>");
      return `<bpmn:lane id="${id}" name="${name}">
  ${refs.join("\n  ")}
</bpmn:lane>`;
    })
    .join("\n");

  const laneShapesXml = laneNames
    .map((_, i) => {
      const id = `Lane_${i + 1}`;
      const y = poolY + i * laneH;
      const laneX = poolX + 30;
      const laneW = Math.max(poolW - 30, 120);
      return `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}" isHorizontal="true">
  <dc:Bounds x="${laneX}" y="${y}" width="${laneW}" height="${laneH}" />
</bpmndi:BPMNShape>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">

  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="${participantName}" processRef="Process_1" />
  </bpmn:collaboration>

  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
${lanesXml}
    </bpmn:laneSet>

    <bpmn:startEvent id="StartEvent_1" name="Стартовое событие" />
    <bpmn:endEvent id="EndEvent_1" name="Процесс завершён" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
  </bpmn:process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="${poolX}" y="${poolY}" width="${poolW}" height="${poolH}" />
      </bpmndi:BPMNShape>

${laneShapesXml}

      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="${startX}" y="${startY}" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="${endX}" y="${endY}" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="${startX + 36}" y="${startY + 18}" />
        <di:waypoint x="${midX}" y="${startY + 18}" />
        <di:waypoint x="${midX}" y="${endY + 18}" />
        <di:waypoint x="${endX}" y="${endY + 18}" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function XmlView({ xmlDraft, xmlDirty, saveBusy, onChange, onSave, onReset }) {
  return (
    <div className="xmlWrap">
      <div className="xmlEditorToolbar">
        <span className={`xmlEditorStatus ${xmlDirty ? "dirty" : "saved"}`}>
          {xmlDirty ? "XML: есть несохраненные изменения" : "XML: синхронизировано"}
        </span>
        <button type="button" className="secondaryBtn smallBtn" onClick={onReset} disabled={saveBusy || !xmlDirty} title="Вернуть последнее сохранённое состояние XML">
          Сбросить
        </button>
        <button type="button" className="primaryBtn smallBtn" onClick={onSave} disabled={saveBusy || !xmlDirty} title="Сохранить XML в сессию">
          {saveBusy ? "Сохранение…" : "Сохранить XML"}
        </button>
      </div>
      <div className="xmlScroller">
        <textarea
          className="xmlEditorTextarea"
          value={xmlDraft}
          onChange={(e) => onChange?.(String(e.target.value || ""))}
          spellCheck={false}
          placeholder="Вставьте BPMN XML..."
        />
      </div>
    </div>
  );
}

function getCanvasSnapshot(inst) {
  try {
    const canvas = inst?.get?.("canvas");
    const registry = inst?.get?.("elementRegistry");
    const container = canvas?._container;
    const rect = container?.getBoundingClientRect?.();
    const vb = canvas?.viewbox?.() || {};
    const zoom = Number(canvas?.zoom?.() || 0);
    const count = Array.isArray(registry?.getAll?.()) ? registry.getAll().length : 0;
    return {
      width: Number(rect?.width || container?.clientWidth || 0),
      height: Number(rect?.height || container?.clientHeight || 0),
      zoom: Number.isFinite(zoom) ? zoom : 0,
      viewbox: {
        x: Number(vb?.x || 0),
        y: Number(vb?.y || 0),
        width: Number(vb?.width || 0),
        height: Number(vb?.height || 0),
      },
      count,
    };
  } catch {
    return {
      width: 0,
      height: 0,
      zoom: 0,
      viewbox: { x: 0, y: 0, width: 0, height: 0 },
      count: 0,
    };
  }
}

function isAnyShapeInViewport(inst) {
  try {
    const canvas = inst?.get?.("canvas");
    const registry = inst?.get?.("elementRegistry");
    const vb = canvas?.viewbox?.();
    const elements = Array.isArray(registry?.getAll?.()) ? registry.getAll() : [];
    const shape = elements.find((el) => {
      if (!el || Array.isArray(el?.waypoints) || el.type === "label") return false;
      const cx = Number(el.x || 0) + Number(el.width || 0) / 2;
      const cy = Number(el.y || 0) + Number(el.height || 0) / 2;
      return Number.isFinite(cx) && Number.isFinite(cy)
        && cx >= Number(vb?.x || 0)
        && cx <= Number(vb?.x || 0) + Number(vb?.width || 0)
        && cy >= Number(vb?.y || 0)
        && cy <= Number(vb?.y || 0) + Number(vb?.height || 0);
    });
    return !!shape;
  } catch {
    return false;
  }
}

function logViewAction(tag, before, after, meta = {}) {
  if (!shouldLogBpmnTrace()) return;
  const extra = Object.entries(meta || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(
    `[VIEW] ${String(tag || "op")} ${extra} `
    + `before_zoom=${before.zoom} after_zoom=${after.zoom} `
    + `before_vb=${before.viewbox.x},${before.viewbox.y},${before.viewbox.width},${before.viewbox.height} `
    + `after_vb=${after.viewbox.x},${after.viewbox.y},${after.viewbox.width},${after.viewbox.height} `
    + `container=${after.width}x${after.height} registry=${after.count}`,
  );
}

function waitAnimationFrame() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });
}

function asRectMetrics(node) {
  if (!node || typeof node.getBoundingClientRect !== "function") {
    return { width: 0, height: 0 };
  }
  const rect = node.getBoundingClientRect();
  return {
    width: Number(rect?.width || 0),
    height: Number(rect?.height || 0),
  };
}

function asStyleMetrics(node) {
  if (typeof window === "undefined" || !node || typeof window.getComputedStyle !== "function") {
    return {
      display: "",
      visibility: "",
      opacity: "",
      overflow: "",
    };
  }
  try {
    const style = window.getComputedStyle(node);
    return {
      display: String(style?.display || ""),
      visibility: String(style?.visibility || ""),
      opacity: String(style?.opacity || ""),
      overflow: String(style?.overflow || ""),
    };
  } catch {
    return {
      display: "",
      visibility: "",
      opacity: "",
      overflow: "",
    };
  }
}

function formatRect(rect) {
  return `${Math.round(Number(rect?.width || 0))}x${Math.round(Number(rect?.height || 0))}`;
}

function compactStyleToken(style = {}) {
  return `display=${String(style.display || "-")} visibility=${String(style.visibility || "-")} opacity=${String(style.opacity || "-")} overflow=${String(style.overflow || "-")}`;
}

function getParentVisibilityChain(node, maxDepth = 3) {
  const out = [];
  let cur = node?.parentElement || null;
  let depth = 0;
  while (cur && depth < maxDepth) {
    const style = asStyleMetrics(cur);
    const rect = asRectMetrics(cur);
    out.push(`p${depth}{${compactStyleToken(style)} rect=${formatRect(rect)}}`);
    cur = cur.parentElement || null;
    depth += 1;
  }
  return out;
}

function hasHiddenParentStyles(node, maxDepth = 3) {
  let cur = node?.parentElement || null;
  let depth = 0;
  while (cur && depth < maxDepth) {
    const style = asStyleMetrics(cur);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return true;
    }
    cur = cur.parentElement || null;
    depth += 1;
  }
  return false;
}

function isNonZeroVisibleLayout(node, minWidth = 20, minHeight = 20) {
  const rect = asRectMetrics(node);
  const style = asStyleMetrics(node);
  const visibleByStyle = style.display !== "none"
    && style.visibility !== "hidden"
    && style.opacity !== "0";
  const sized = rect.width > Number(minWidth || 20) && rect.height > Number(minHeight || 20);
  return {
    ok: visibleByStyle && sized,
    rect,
    style,
  };
}

function logLayoutTrace(meta = {}) {
  if (!shouldLogBpmnTrace()) return;
  const suffix = Object.entries(meta || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[LAYOUT] ${suffix}`.trim());
}

function logVisChainTrace(meta = {}) {
  if (!shouldLogBpmnTrace()) return;
  const suffix = Object.entries(meta || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[VIS_CHAIN] ${suffix}`.trim());
}

async function waitForNonZeroRect(getNode, options = {}) {
  const timeoutMsRaw = Number(options?.timeoutMs ?? 2000);
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 2000;
  const minWidth = Number.isFinite(Number(options?.minWidth)) ? Number(options.minWidth) : 20;
  const minHeight = Number.isFinite(Number(options?.minHeight)) ? Number(options.minHeight) : 20;
  const sid = String(options?.sid || "-");
  const token = Number(options?.token || 0);
  const reason = String(options?.reason || "layout_wait").trim() || "layout_wait";
  const startedAt = Date.now();
  let attempt = 0;
  let last = {
    ok: false,
    rect: { width: 0, height: 0 },
    style: { display: "", visibility: "", opacity: "", overflow: "" },
    djsRect: { width: 0, height: 0 },
    svgRect: { width: 0, height: 0 },
    viewportRect: { width: 0, height: 0 },
    chain: [],
    parentHidden: false,
  };

  while (Date.now() - startedAt <= timeoutMs) {
    const node = typeof getNode === "function" ? getNode() : getNode;
    const base = isNonZeroVisibleLayout(node, minWidth, minHeight);
    const djsContainer = node?.querySelector?.(".djs-container") || null;
    const djsCanvas = djsContainer?.querySelector?.(".djs-canvas") || null;
    const svg = djsContainer?.querySelector?.("svg") || node?.querySelector?.("svg") || null;
    const viewport = svg?.querySelector?.("g.viewport") || svg?.querySelector?.("g.djs-viewport") || null;
    const djsRect = asRectMetrics(djsContainer);
    const svgRect = asRectMetrics(svg);
    const viewportRect = asRectMetrics(djsCanvas || viewport || null);
    const chain = getParentVisibilityChain(node, 3);
    const parentHidden = hasHiddenParentStyles(node, 3);
    const ready = !!base.ok && !parentHidden;
    last = {
      ok: ready,
      rect: base.rect,
      style: base.style,
      djsRect,
      svgRect,
      viewportRect,
      chain,
      parentHidden,
    };

    if (attempt === 0 || ready || attempt % 5 === 0) {
      logLayoutTrace({
        sid,
        token,
        reason,
        attempt,
        ready: ready ? 1 : 0,
        containerRect: formatRect(base.rect),
        djsRect: formatRect(djsRect),
        svgRect: formatRect(svgRect),
        viewportRect: formatRect(viewportRect),
        parentHidden: parentHidden ? 1 : 0,
        display: base.style.display || "-",
        visibility: base.style.visibility || "-",
        opacity: base.style.opacity || "-",
        overflow: base.style.overflow || "-",
      });
      logVisChainTrace({
        sid,
        token,
        reason,
        parent0: chain[0] || "-",
        parent1: chain[1] || "-",
        parent2: chain[2] || "-",
      });
    }

    if (ready) {
      return { ok: true, attempts: attempt + 1, elapsedMs: Date.now() - startedAt, ...last };
    }

    attempt += 1;
    await waitAnimationFrame();
  }

  logLayoutTrace({
    sid,
    token,
    reason,
    attempt,
    ready: 0,
    timeout: 1,
    containerRect: formatRect(last.rect),
    djsRect: formatRect(last.djsRect),
    svgRect: formatRect(last.svgRect),
    viewportRect: formatRect(last.viewportRect),
    parentHidden: last.parentHidden ? 1 : 0,
  });
  logVisChainTrace({
    sid,
    token,
    reason,
    timeout: 1,
    parent0: last.chain?.[0] || "-",
    parent1: last.chain?.[1] || "-",
    parent2: last.chain?.[2] || "-",
  });
  return { ok: false, attempts: attempt, elapsedMs: Date.now() - startedAt, ...last };
}

function probeCanvas(inst, tag = "", options = {}) {
  const tab = String(options?.tab || "-");
  const sid = String(options?.sid || "-");
  const token = Number(options?.token || 0);
  const cycleIndex = Number(options?.cycleIndex || 0);
  const reason = String(options?.reason || "").trim() || "-";
  const expectElements = options?.expectElements === true;
  let probe = {
    registryCount: 0,
    containerWidth: 0,
    containerHeight: 0,
    djsWidth: 0,
    djsHeight: 0,
    svgWidth: 0,
    svgHeight: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    zoom: 0,
    viewbox: { x: 0, y: 0, width: 0, height: 0 },
    transform: "",
    disp: "",
    vis: "",
    op: "",
    overflow: "",
    parent0: "",
    parent1: "",
    parent2: "",
    bboxWidth: 0,
    bboxHeight: 0,
    containerKey: "",
    invisible: false,
  };
  try {
    const canvas = inst?.get?.("canvas");
    const registry = inst?.get?.("elementRegistry");
    const container = canvas?._container;
    const containerRect = asRectMetrics(container);
    const containerKey = ensureContainerKey(container);
    const style = asStyleMetrics(container);
    const djsContainer = container?.querySelector?.(".djs-container") || null;
    const djsCanvas = djsContainer?.querySelector?.(".djs-canvas") || null;
    const djsRect = asRectMetrics(djsContainer);
    const svg = djsContainer?.querySelector?.("svg") || container?.querySelector?.("svg") || null;
    const viewport = svg?.querySelector?.("g.viewport") || svg?.querySelector?.("g.djs-viewport") || null;
    const elementsLayer = svg?.querySelector?.("g.djs-elements")
      || svg?.querySelector?.("g[class^='layer-root-']")
      || svg?.querySelector?.("g.layer-root")
      || null;
    const svgRect = asRectMetrics(svg);
    const viewportRect = asRectMetrics(djsCanvas || viewport || null);
    const ctm = typeof viewport?.getCTM === "function" ? viewport.getCTM() : null;
    const transformAttr = String(viewport?.getAttribute?.("transform") || "");
    const transform = transformAttr || (ctm
      ? `matrix(${Number(ctm.a || 0)},${Number(ctm.b || 0)},${Number(ctm.c || 0)},${Number(ctm.d || 0)},${Number(ctm.e || 0)},${Number(ctm.f || 0)})`
      : "");
    const vb = canvas?.viewbox?.() || {};
    const zoom = Number(canvas?.zoom?.() || 0);
    const parentChain = getParentVisibilityChain(container, 3);
    let elementsBBox = { width: 0, height: 0 };
    let hasElementsBBox = false;
    try {
      if (elementsLayer && typeof elementsLayer.getBBox === "function") {
        const box = elementsLayer.getBBox();
        elementsBBox = {
          width: Number(box?.width || 0),
          height: Number(box?.height || 0),
        };
        hasElementsBBox = true;
      }
    } catch {
      elementsBBox = { width: 0, height: 0 };
      hasElementsBBox = false;
    }

    const registryCount = Array.isArray(registry?.getAll?.()) ? registry.getAll().length : 0;
    const zoomInvalid = !Number.isFinite(zoom) || zoom <= 0;
    const ctmInvalid = ctm
      ? !Number.isFinite(Number(ctm.a)) || !Number.isFinite(Number(ctm.d)) || Number(ctm.a) <= 0 || Number(ctm.d) <= 0
      : false;
    const hiddenStyle = style.display === "none"
      || style.visibility === "hidden"
      || style.opacity === "0";
    const svgMissing = svgRect.width <= 0 || svgRect.height <= 0;
    const viewportMissing = viewportRect.width <= 0 || viewportRect.height <= 0;
    const containerMissing = containerRect.width <= 0 || containerRect.height <= 0;
    const bboxEmpty = hasElementsBBox && elementsBBox.width <= 0 && elementsBBox.height <= 0;
    const missingExpectedElements = expectElements && registryCount <= 0;

    const invisible = missingExpectedElements
      || (registryCount > 0
        && (svgMissing || viewportMissing || containerMissing || hiddenStyle || zoomInvalid || ctmInvalid || bboxEmpty));

    probe = {
      registryCount,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      djsWidth: djsRect.width,
      djsHeight: djsRect.height,
      svgWidth: svgRect.width,
      svgHeight: svgRect.height,
      viewportWidth: viewportRect.width,
      viewportHeight: viewportRect.height,
      zoom: Number.isFinite(zoom) ? zoom : 0,
      viewbox: {
        x: Number(vb?.x || 0),
        y: Number(vb?.y || 0),
        width: Number(vb?.width || 0),
        height: Number(vb?.height || 0),
      },
      transform,
      disp: style.display,
      vis: style.visibility,
      op: style.opacity,
      overflow: style.overflow,
      parent0: parentChain[0] || "",
      parent1: parentChain[1] || "",
      parent2: parentChain[2] || "",
      bboxWidth: elementsBBox.width,
      bboxHeight: elementsBBox.height,
      containerKey,
      invisible,
    };
  } catch {
    probe = {
      ...probe,
      invisible: true,
    };
  }
  if (shouldLogBpmnTrace()) {
    // eslint-disable-next-line no-console
    console.debug(
      `[PROBE] tag=${String(tag || "-")} i=${cycleIndex} tab=${tab} sid=${sid} token=${token} reason=${reason} `
      + `reg=${probe.registryCount} rect=${probe.containerWidth}x${probe.containerHeight} `
      + `djs=${probe.djsWidth}x${probe.djsHeight} svg=${probe.svgWidth}x${probe.svgHeight} viewport=${probe.viewportWidth}x${probe.viewportHeight} `
      + `disp=${probe.disp || "-"} vis=${probe.vis || "-"} op=${probe.op || "-"} ovf=${probe.overflow || "-"} `
      + `zoom=${probe.zoom} viewbox=${probe.viewbox.x},${probe.viewbox.y},${probe.viewbox.width},${probe.viewbox.height} `
      + `bbox=${probe.bboxWidth}x${probe.bboxHeight} containerKey=${probe.containerKey || "-"} `
      + `transform=${probe.transform || "-"} expectEls=${expectElements ? 1 : 0} invisible=${probe.invisible ? 1 : 0}`,
    );
    // eslint-disable-next-line no-console
    console.debug(
      `[VIS_CHAIN] sid=${sid} token=${token} reason=${reason} tag=${String(tag || "-")} `
      + `parent0=${probe.parent0 || "-"} parent1=${probe.parent1 || "-"} parent2=${probe.parent2 || "-"}`,
    );
  }
  return probe;
}

async function safeFit(inst, options = {}) {
  const reason = String(options?.reason || "fit").trim() || "fit";
  const tab = String(options?.tab || "-");
  const sid = String(options?.sid || "-");
  const token = Number(options?.token || 0);
  const suppress = typeof options?.suppressViewbox === "function"
    ? options.suppressViewbox
    : null;
  let attempt = 0;
  while (attempt <= 10) {
    try {
      const canvas = inst.get("canvas");
      const container = canvas?._container;
      const w = Number(container?.clientWidth || 0);
      const h = Number(container?.clientHeight || 0);
      if ((!w || !h) && attempt < 10) {
        await new Promise((r) => setTimeout(r, 70));
        attempt += 1;
        // eslint-disable-next-line no-continue
        continue;
      }
      const before = getCanvasSnapshot(inst);
      suppress?.(1);
      try {
        canvas.zoom("fit-viewport");
        const z = canvas.zoom();
        if (!Number.isFinite(z)) canvas.zoom(1);
      } finally {
        suppress?.(-1);
      }
      const after = getCanvasSnapshot(inst);
      logViewAction("fit", before, after, { reason, tab, sid, token });
      return;
    } catch {
      return;
    }
  }
}

function logCanvasMetrics(inst, tag = "", sid = "") {
  if (!shouldLogBpmnTrace()) return;
  try {
    const canvas = inst?.get?.("canvas");
    const registry = inst?.get?.("elementRegistry");
    const container = canvas?._container;
    const rect = container?.getBoundingClientRect?.();
    const width = Number(rect?.width || container?.clientWidth || 0);
    const height = Number(rect?.height || container?.clientHeight || 0);
    const count = Array.isArray(registry?.getAll?.()) ? registry.getAll().length : 0;
    // eslint-disable-next-line no-console
    console.debug(`[BPMN] ${String(tag || "canvas")} sid=${String(sid || "-")} width=${width} height=${height} elementRegistryCount=${count}`);
  } catch {
  }
}

async function ensureCanvasVisibleAndFit(inst, tag = "", sid = "", options = {}) {
  if (!inst) return;
  const reason = String(options?.reason || tag || "canvas").trim() || "canvas";
  const tab = String(options?.tab || "-");
  const token = Number(options?.token || 0);
  const allowFit = options?.allowFit !== false;
  const fitIfInvisible = options?.fitIfInvisible !== false;
  const suppress = typeof options?.suppressViewbox === "function"
    ? options.suppressViewbox
    : null;
  const cycleIndex = Number(options?.cycleIndex || 0);
  let before = getCanvasSnapshot(inst);
  const layoutReady = await waitForNonZeroRect(
    () => inst?.get?.("canvas")?._container || null,
    {
      sid: String(sid || "-"),
      token,
      reason: `${reason}:before_canvas_ops`,
      timeoutMs: 3000,
    },
  );
  if (!layoutReady.ok) {
    return;
  }
  try {
    const canvas = inst.get("canvas");
    const container = canvas?._container;
    const rect = container?.getBoundingClientRect?.();
    const width = Number(rect?.width || container?.clientWidth || 0);
    const height = Number(rect?.height || container?.clientHeight || 0);
    suppress?.(1);
    try {
      canvas?.resized?.();
    } finally {
      suppress?.(-1);
    }
    const afterResized = getCanvasSnapshot(inst);
    logViewAction("resized", before, afterResized, {
      reason,
      tab,
      sid: String(sid || "-"),
      token,
    });
    before = afterResized;
    if (!width || !height) {
      window.setTimeout(async () => {
        try {
          const b = getCanvasSnapshot(inst);
          suppress?.(1);
          try {
            canvas?.resized?.();
          } finally {
            suppress?.(-1);
          }
          const a = getCanvasSnapshot(inst);
          logViewAction("resized", b, a, {
            reason: `${reason}:post_show`,
            tab,
            sid: String(sid || "-"),
            token,
          });
          if (allowFit) {
            const probe = probeCanvas(inst, `${String(tag || "canvas")}.post_show_probe`, {
              tab,
              sid: String(sid || "-"),
              token,
              reason: `${reason}:post_show`,
              cycleIndex,
            });
            if (probe.invisible || !Number.isFinite(probe.zoom) || probe.zoom <= 0) {
              await safeFit(inst, {
                reason: `${reason}:post_show`,
                tab,
                sid,
                token,
                suppressViewbox: suppress,
              });
            }
          }
          logCanvasMetrics(inst, `${String(tag || "canvas")}.post_show`, sid);
        } catch {
        }
      }, 90);
    }
  } catch {
  }
  if (allowFit) {
    const hasVisibleShapes = isAnyShapeInViewport(inst);
    const afterResized = getCanvasSnapshot(inst);
    const shouldFit = !Number.isFinite(afterResized.zoom)
      || afterResized.zoom <= 0
      || (fitIfInvisible && afterResized.count > 0 && !hasVisibleShapes);
    if (shouldFit) {
      await safeFit(inst, {
        reason,
        tab,
        sid,
        token,
        suppressViewbox: suppress,
      });
    }
  }
  logCanvasMetrics(inst, tag, sid);
}

const BpmnStage = forwardRef(function BpmnStage({
  sessionId,
  view,
  draft,
  reloadKey,
  onDiagramMutation,
  onElementSelectionChange,
  onElementNotesRemap,
  onAiQuestionsByElementChange,
}, ref) {
  const viewerEl = useRef(null);
  const editorEl = useRef(null);

  const viewerRef = useRef(null);
  const modelerRef = useRef(null);
  const viewerInitPromiseRef = useRef(null);
  const modelerInitPromiseRef = useRef(null);
  const modelerRuntimeRef = useRef(null);
  const modelerDecorBoundInstanceRef = useRef(null);
  const bpmnStoreRef = useRef(null);
  const bpmnCoordinatorRef = useRef(null);
  const bpmnPersistenceRef = useRef(null);
  const bpmnStoreUnsubRef = useRef(null);
  const activeSessionRef = useRef("");
  const prevSessionRef = useRef("");
  const loadTokenRef = useRef(0);
  const draftRef = useRef(draft);

  const [xml, setXml] = useState("");
  const [xmlDraft, setXmlDraft] = useState("");
  const [xmlDirty, setXmlDirty] = useState(false);
  const [xmlSaveBusy, setXmlSaveBusy] = useState(false);
  const [srcHint, setSrcHint] = useState("");
  const [err, setErr] = useState("");
  const bottlenecksRef = useRef([]);
  const markerStateRef = useRef({ viewer: [], editor: [] });
  const overlayStateRef = useRef({ viewer: [], editor: [] });
  const interviewMarkerStateRef = useRef({ viewer: [], editor: [] });
  const interviewOverlayStateRef = useRef({ viewer: [], editor: [] });
  const taskTypeMarkerStateRef = useRef({ viewer: [], editor: [] });
  const userNotesMarkerStateRef = useRef({ viewer: [], editor: [] });
  const userNotesOverlayStateRef = useRef({ viewer: [], editor: [] });
  const aiQuestionPanelStateRef = useRef({
    viewer: { overlayId: null, elementId: "" },
    editor: { overlayId: null, elementId: "" },
  });
  const aiQuestionPanelTargetRef = useRef({ viewer: "", editor: "" });
  const selectedMarkerStateRef = useRef({ viewer: "", editor: "" });
  const onDiagramMutationRef = useRef(onDiagramMutation);
  const onElementSelectionChangeRef = useRef(onElementSelectionChange);
  const onElementNotesRemapRef = useRef(onElementNotesRemap);
  const onAiQuestionsByElementChangeRef = useRef(onAiQuestionsByElementChange);
  const replaceCommandStateRef = useRef({
    oldId: "",
    oldType: "",
    hadNotes: false,
    oldNotesEntry: null,
    oldBounds: null,
    source: "",
    ts: 0,
  });
  const suppressCommandStackRef = useRef(0);
  const suppressViewboxEventRef = useRef(0);
  const modelerReadyRef = useRef(false);
  const viewerReadyRef = useRef(false);
  const userViewportTouchedRef = useRef(false);
  const lastStoreEventRef = useRef({
    source: "",
    reason: "",
    rev: 0,
    hash: "",
  });
  const lastModelerXmlHashRef = useRef("");
  const modelerInstanceMetaRef = useRef({ id: 0, containerKey: "" });
  const viewerInstanceMetaRef = useRef({ id: 0, containerKey: "" });
  const ensureVisiblePromiseRef = useRef(null);
  const ensureVisibleCycleRef = useRef(0);
  const ensureEpochRef = useRef(0);
  const renderRunRef = useRef(0);
  const modelerImportInFlightRef = useRef({ sid: "", xmlHash: "", promise: null });
  const prevViewRef = useRef(view);
  const runtimeTokenRef = useRef(0);
  const runtimeStatusRef = useRef({
    token: 0,
    ready: false,
    destroyed: false,
  });
  const saveCountersRef = useRef({
    requested: 0,
    skipped_not_ready: 0,
    executed_savexml: 0,
    persist_started: 0,
    persist_done: 0,
    persist_fail: 0,
    store_updated: 0,
  });
  const focusStateRef = useRef({
    viewer: { elementId: "", timer: 0 },
    editor: { elementId: "", timer: 0 },
  });

  useEffect(() => {
    onDiagramMutationRef.current = onDiagramMutation;
  }, [onDiagramMutation]);

  useEffect(() => {
    onElementSelectionChangeRef.current = onElementSelectionChange;
  }, [onElementSelectionChange]);

  useEffect(() => {
    onElementNotesRemapRef.current = onElementNotesRemap;
  }, [onElementNotesRemap]);

  useEffect(() => {
    onAiQuestionsByElementChangeRef.current = onAiQuestionsByElementChange;
  }, [onAiQuestionsByElementChange]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  function ensureBpmnStore() {
    if (bpmnStoreRef.current) return bpmnStoreRef.current;
    const initialXml = String(xml || draft?.bpmn_xml || "");
    const store = createBpmnStore({
      xml: initialXml,
      dirty: false,
      source: "stage_init",
    });
    if (typeof bpmnStoreUnsubRef.current === "function") {
      try {
        bpmnStoreUnsubRef.current();
      } catch {
      }
    }
    bpmnStoreUnsubRef.current = store.subscribe((state) => {
      if (!state || typeof state !== "object") return;
      const nextXml = String(state.xml || "");
      lastStoreEventRef.current = {
        source: String(state.source || ""),
        reason: String(state.reason || ""),
        rev: Number(state.rev || 0),
        hash: String(state.hash || fnv1aHex(nextXml)),
      };
      setXml(nextXml);
      setXmlDraft(nextXml);
      setXmlDirty(!!state.dirty);
      if (state.reason === "setXml") {
        const count = bumpSaveCounter("store_updated");
        logBpmnTrace("STORE_UPDATED", nextXml, {
          sid: String(sessionId || ""),
          source: String(state.source || "store"),
          rev: Number(state.rev || 0),
          count,
        });
      }
    });
    bpmnStoreRef.current = store;
    return store;
  }

  function onCoordinatorTrace(event, payload = {}) {
    const storeXml = String(bpmnStoreRef.current?.getState?.()?.xml || xmlDraft || xml || "");
    const sid = String(sessionId || "");
    const meta = payload && typeof payload === "object" ? payload : {};
    if (event === "SAVE_REQUESTED") {
      const count = bumpSaveCounter("requested");
      logBpmnTrace("SAVE_REQUESTED", storeXml, { sid, ...meta, count });
      return;
    }
    if (event === "SAVE_SKIPPED_NOT_READY") {
      const count = bumpSaveCounter("skipped_not_ready");
      logBpmnTrace("SAVE_SKIPPED_NOT_READY", storeXml, { sid, ...meta, count });
      return;
    }
    if (event === "SAVE_EXECUTED") {
      const count = bumpSaveCounter("executed_savexml");
      logBpmnTrace("SAVE_EXECUTED", storeXml, { sid, ...meta, count });
      logBpmnTrace("SAVE_EXECUTED_SAVEXML", storeXml, { sid, ...meta, count });
      return;
    }
    if (event === "REV_BUMP") {
      logBpmnTrace("REV_BUMP", storeXml, { sid, ...meta });
      return;
    }
    if (event === "SAVE_PERSIST_STARTED") {
      const count = bumpSaveCounter("persist_started");
      logBpmnTrace("SAVE_PERSIST_STARTED", storeXml, { sid, ...meta, count });
      return;
    }
    if (event === "SAVE_PERSIST_DONE") {
      const count = bumpSaveCounter("persist_done");
      logBpmnTrace("SAVE_PERSIST_DONE", storeXml, { sid, ...meta, count });
      return;
    }
    if (event === "SAVE_PERSIST_FAIL") {
      const count = bumpSaveCounter("persist_fail");
      logBpmnTrace("SAVE_PERSIST_FAIL", storeXml, { sid, ...meta, count });
      return;
    }
    logBpmnTrace(event, storeXml, { sid, ...meta });
  }

  function trackRuntimeStatus(status, fallbackReason = "") {
    const sid = String(sessionId || "");
    const reason = String(status?.reason || fallbackReason || "").trim() || "status";
    const prev = asObject(runtimeStatusRef.current);
    const nextToken = Number(status?.token || 0);
    const nextReady = !!status?.ready && !!status?.defs;
    const nextDestroyed = !!status?.destroyed;

    if (Number(prev.token || 0) !== nextToken) {
      const storeXml = String(bpmnStoreRef.current?.getState?.()?.xml || xmlDraft || xml || "");
      logBpmnTrace("TOKEN_CHANGED", storeXml, {
        sid,
        from: Number(prev.token || 0),
        to: nextToken,
        reason,
      });
    }
    if (!prev.ready && nextReady) {
      const storeXml = String(bpmnStoreRef.current?.getState?.()?.xml || xmlDraft || xml || "");
      logBpmnTrace("RUNTIME_READY", storeXml, {
        sid,
        token: nextToken,
        reason,
      });
    }
    if (!prev.destroyed && nextDestroyed) {
      const storeXml = String(bpmnStoreRef.current?.getState?.()?.xml || xmlDraft || xml || "");
      logBpmnTrace("RUNTIME_DESTROYED", storeXml, {
        sid,
        token: nextToken,
        reason,
      });
    }

    runtimeStatusRef.current = {
      token: nextToken,
      ready: nextReady,
      destroyed: nextDestroyed,
    };
  }

  function ensureBpmnPersistence() {
    if (bpmnPersistenceRef.current) return bpmnPersistenceRef.current;
    const persistence = createBpmnPersistence({
      getSessionDraft: () => draftRef.current || {},
      getSnapshotProjectId: () => String(draftRef.current?.project_id || draftRef.current?.projectId || ""),
      saveSnapshot: saveBpmnSnapshot,
      loadLatestSnapshot: getLatestBpmnSnapshot,
      getLocalStorageKey: localKey,
      isLocalSessionId,
      apiGetBpmnXml,
      apiPutBpmnXml,
      onTrace: (event, payload = {}) => {
        const sid = String(activeSessionRef.current || "");
        const storeXml = String(bpmnStoreRef.current?.getState?.()?.xml || "");
        logBpmnTrace(event, storeXml, { sid, ...payload });
      },
    });
    bpmnPersistenceRef.current = persistence;
    return persistence;
  }

  function ensureBpmnCoordinator() {
    if (bpmnCoordinatorRef.current) return bpmnCoordinatorRef.current;
    const store = ensureBpmnStore();
    const persistence = ensureBpmnPersistence();
    const coordinator = createBpmnCoordinator({
      store,
      getRuntime: () => modelerRuntimeRef.current,
      getSessionId: () => String(activeSessionRef.current || ""),
      persistence: {
        saveRaw: (sid, xmlText, rev, reason) => persistence.saveRaw(sid, xmlText, rev, reason),
        loadRaw: (sid, optionsForLoad) => persistence.loadRaw(sid, optionsForLoad),
      },
      onTrace: onCoordinatorTrace,
      onRuntimeChange: (ev) => {
        if (suppressCommandStackRef.current > 0) return;
        setXmlDirty(true);
        if (shouldLogBpmnTrace()) {
          const runtime = modelerRuntimeRef.current;
          const status = runtime?.getStatus?.() || {};
          const activeInst = runtime?.getInstance?.();
          // eslint-disable-next-line no-console
          console.debug(
            `[BPMN] commandStack.changed sid=${String(sessionId || "-")} token=${Number(status?.token || 0)} ready=${status?.ready ? 1 : 0} defs=${status?.defs ? 1 : 0} active_modeler=${activeInst === modelerRef.current ? 1 : 0}`,
          );
          probeCanvas(activeInst || modelerRef.current, "after_command_change", {
            sid: String(sessionId || ""),
            tab: "diagram",
            token: Number(status?.token || 0),
            reason: "commandStack.changed",
            cycleIndex: Number(ensureVisibleCycleRef.current || 0),
          });
        }
        emitDiagramMutation("diagram.change", {
          eventName: "commandStack.changed",
          command: String(ev?.command || "").trim(),
        });
      },
      onRuntimeStatus: (status) => {
        modelerReadyRef.current = !!status?.ready && !!status?.defs;
        runtimeTokenRef.current = Number(status?.token || runtimeTokenRef.current || 0);
        trackRuntimeStatus(status, "runtime_status");
      },
    });
    bpmnCoordinatorRef.current = coordinator;
    return coordinator;
  }

  function ensureModelerRuntime() {
    if (modelerRuntimeRef.current) return modelerRuntimeRef.current;
    const runtime = createBpmnRuntime({
      mode: "modeler",
    });
    modelerRuntimeRef.current = runtime;
    try {
      if (typeof window !== "undefined") {
        window.__FPC_E2E_RUNTIME__ = runtime;
      }
    } catch {
    }
    ensureBpmnCoordinator().bindRuntime(runtime);
    return runtime;
  }

  function bumpSaveCounter(key) {
    const k = String(key || "").trim();
    if (!k) return 0;
    const prev = asObject(saveCountersRef.current);
    const next = Number(prev[k] || 0) + 1;
    saveCountersRef.current = { ...prev, [k]: next };
    return next;
  }

  function suppressViewboxEvents(delta) {
    const d = Number(delta || 0);
    if (!Number.isFinite(d) || d === 0) return;
    suppressViewboxEventRef.current = Math.max(0, Number(suppressViewboxEventRef.current || 0) + d);
  }

  function getInstanceMeta(inst) {
    if (inst && inst === modelerRef.current) {
      return asObject(modelerInstanceMetaRef.current);
    }
    if (inst && inst === viewerRef.current) {
      return asObject(viewerInstanceMetaRef.current);
    }
    return { id: 0, containerKey: "" };
  }

  function logStaleGuard(reason, extra = {}) {
    if (!shouldLogBpmnTrace()) return;
    // eslint-disable-next-line no-console
    console.debug(
      `[STALE_GUARD] skipped_apply sid=${String(activeSessionRef.current || "-")} reason=${String(reason || "stale")} ${Object.entries(extra || {}).map(([k, v]) => `${k}=${String(v)}`).join(" ")}`.trim(),
    );
  }

  function applyXmlSnapshot(nextXml, nextSrcHint = "") {
    const raw = String(nextXml || "");
    setXml(raw);
    setXmlDraft(raw);
    setXmlDirty(false);
    if (nextSrcHint) setSrcHint(nextSrcHint);
    ensureBpmnCoordinator().syncExternalXml(raw, nextSrcHint || "external", {
      bumpRev: false,
      dirty: false,
    });
  }

  function emitDiagramMutation(kind, payload = {}) {
    const cb = onDiagramMutationRef.current;
    if (typeof cb !== "function") return;
    const mutationKind = String(kind || "").trim() || "diagram.change";
    traceProcess("bpmn.emit_mutation", {
      sid: String(sessionId || ""),
      mutation_kind: mutationKind,
      payload_keys: Object.keys(payload || {}),
    });
    cb({
      kind: mutationKind,
      ...payload,
      at: Date.now(),
    });
  }

  function updateXmlDraft(nextDraft) {
    const raw = String(nextDraft || "");
    setXmlDraft(raw);
    setXmlDirty(raw !== String(xml || ""));
    if (shouldLogBpmnTrace()) {
      // eslint-disable-next-line no-console
      console.debug(
        `[XMLDRAFT_SET] sid=${String(sessionId || "-")} source=typing len=${raw.length} hash=${fnv1aHex(raw)} dirty=${raw !== String(xml || "") ? 1 : 0}`,
      );
    }
    if (raw !== String(xml || "")) {
      emitDiagramMutation("xml.edit", { source: "xml_editor" });
    }
  }

  async function withSuppressedCommandStack(task) {
    suppressCommandStackRef.current += 1;
    try {
      return await task();
    } finally {
      suppressCommandStackRef.current = Math.max(0, suppressCommandStackRef.current - 1);
    }
  }

  function hasDefinitionsLoaded(inst) {
    if (!inst || typeof inst.getDefinitions !== "function") return false;
    try {
      const defs = inst.getDefinitions();
      return !!defs;
    } catch {
      return false;
    }
  }

  function severityClass(severity) {
    const s = String(severity || "low").toLowerCase();
    if (s === "high") return "fpcBottleneckHigh";
    if (s === "medium") return "fpcBottleneckMedium";
    return "fpcBottleneckLow";
  }

  function severityTag(severity) {
    const s = String(severity || "low").toLowerCase();
    if (s === "high") return "HOT";
    if (s === "medium") return "RISK";
    return "WATCH";
  }

  function isShapeElement(el) {
    return !!el && !Array.isArray(el?.waypoints) && el.type !== "label";
  }

  function isSelectableElement(el) {
    return !!el && el.type !== "label";
  }

  function clearSelectedDecor(inst, kind) {
    if (!inst) return;
    const id = String(selectedMarkerStateRef.current[kind] || "");
    if (!id) return;
    try {
      const canvas = inst.get("canvas");
      canvas.removeMarker(id, "fpcElementSelected");
    } catch {
    }
    selectedMarkerStateRef.current[kind] = "";
  }

  function setSelectedDecor(inst, kind, elementId) {
    if (!inst) return;
    clearSelectedDecor(inst, kind);
    const eid = String(elementId || "").trim();
    if (!eid) return;
    try {
      const registry = inst.get("elementRegistry");
      const el = registry.get(eid);
      if (!isSelectableElement(el)) return;
      const canvas = inst.get("canvas");
      canvas.addMarker(eid, "fpcElementSelected");
      selectedMarkerStateRef.current[kind] = eid;
    } catch {
    }
  }

  function getElementNotesMap() {
    const d = asObject(draftRef.current);
    return normalizeElementNotesMap(d.notes_by_element || d.notesByElementId);
  }

  function getElementNoteCount(elementId) {
    return elementNotesCount(getElementNotesMap(), String(elementId || "").trim());
  }

  function getElementNoteEntry(elementId) {
    const id = String(elementId || "").trim();
    if (!id) return null;
    const map = getElementNotesMap();
    const entry = asObject(map[id]);
    const items = asArray(entry.items).map((item) => ({ ...asObject(item) }));
    if (!items.length) return null;
    return {
      items,
      updatedAt: Number(entry.updatedAt || Date.now()),
    };
  }

  function getAiQuestionsByElementMap() {
    const d = asObject(draftRef.current);
    const interview = asObject(d.interview);
    return normalizeAiQuestionsByElementMap(interview.ai_questions_by_element || interview.aiQuestionsByElementId);
  }

  function getAiQuestionsForElement(elementId) {
    const eid = toText(elementId);
    if (!eid) return [];
    const map = getAiQuestionsByElementMap();
    return normalizeAiQuestionItems(map[eid]);
  }

  function getAiPanelInstance(kind) {
    return kind === "editor" ? modelerRef.current : viewerRef.current;
  }

  function clearAiQuestionPanel(inst, kind, options = {}) {
    const mode = kind === "editor" ? "editor" : "viewer";
    const state = asObject(aiQuestionPanelStateRef.current[mode]);
    const overlayId = state.overlayId;
    if (overlayId) {
      try {
        const target = inst || getAiPanelInstance(mode);
        target?.get?.("overlays")?.remove?.(overlayId);
      } catch {
      }
    }
    aiQuestionPanelStateRef.current[mode] = {
      overlayId: null,
      elementId: options.keepElementId ? String(state.elementId || "") : "",
    };
    if (!options.keepTarget) {
      aiQuestionPanelTargetRef.current[mode] = "";
    }
  }

  function persistAiQuestionEntry(elementId, qid, patch = {}, meta = {}) {
    const eid = toText(elementId);
    const questionId = toText(qid);
    if (!eid || !questionId) return false;

    const currentMap = getAiQuestionsByElementMap();
    const currentList = normalizeAiQuestionItems(currentMap[eid]);
    const idx = currentList.findIndex((it) => toText(it?.qid) === questionId);
    if (idx < 0) return false;

    const prevItem = asObject(currentList[idx]);
    const nextStatus = Object.prototype.hasOwnProperty.call(patch, "status")
      ? normalizeAiQuestionStatus(patch?.status)
      : normalizeAiQuestionStatus(prevItem?.status);
    const nextComment = Object.prototype.hasOwnProperty.call(patch, "comment")
      ? toText(patch?.comment)
      : toText(prevItem?.comment);
    if (nextStatus === normalizeAiQuestionStatus(prevItem?.status) && nextComment === toText(prevItem?.comment)) {
      return false;
    }

    const nextItem = {
      ...prevItem,
      status: nextStatus,
      comment: nextComment,
      updatedAt: Date.now(),
    };

    const nextList = [...currentList];
    nextList[idx] = nextItem;
    const nextMap = {
      ...currentMap,
      [eid]: nextList.map((item) => ({
        qid: toText(item?.qid),
        text: toText(item?.text),
        comment: toText(item?.comment),
        status: normalizeAiQuestionStatus(item?.status),
        createdAt: Number(item?.createdAt || Date.now()) || Date.now(),
        updatedAt: Number(item?.updatedAt || item?.createdAt || Date.now()) || Date.now(),
        source: toText(item?.source || "ai"),
        stepId: toText(item?.stepId),
      })),
    };

    const cb = onAiQuestionsByElementChangeRef.current;
    if (typeof cb === "function") {
      cb(nextMap, {
        source: toText(meta?.source || "bpmn_ai_overlay"),
        elementId: eid,
        qid: questionId,
      });
    }

    logAiOverlayTrace("persist", {
      sid: String(sessionId || "-"),
      elementId: eid,
      qid: questionId,
      status: nextStatus,
      commentLen: nextComment.length,
      source: toText(meta?.source || "bpmn_ai_overlay"),
    });

    return true;
  }

  function openAiQuestionPanel(inst, kind, elementId, options = {}) {
    if (!inst) return;
    const mode = kind === "editor" ? "editor" : "viewer";
    const eid = toText(elementId);
    if (!eid) {
      clearAiQuestionPanel(inst, mode);
      return;
    }

    const registry = inst.get("elementRegistry");
    const overlays = inst.get("overlays");
    const el = registry.get(eid);
    if (!isShapeElement(el)) {
      clearAiQuestionPanel(inst, mode);
      return;
    }

    const questions = getAiQuestionsForElement(eid);
    if (!questions.length) {
      clearAiQuestionPanel(inst, mode);
      return;
    }

    const prevState = asObject(aiQuestionPanelStateRef.current[mode]);
    if (
      options.toggle
      && prevState.overlayId
      && toText(prevState.elementId) === eid
    ) {
      clearAiQuestionPanel(inst, mode);
      return;
    }

    clearAiQuestionPanel(inst, mode, { keepTarget: true });
    aiQuestionPanelTargetRef.current[mode] = eid;

    const bo = asObject(el?.businessObject);
    const title = toText(bo?.name || eid);
    const stats = aiQuestionStats(questions);

    const panel = document.createElement("div");
    panel.className = "fpcAiQuestionPanel";
    panel.dataset.elementId = eid;
    panel.addEventListener("mousedown", (ev) => ev.stopPropagation());
    panel.addEventListener("click", (ev) => ev.stopPropagation());
    panel.addEventListener("dblclick", (ev) => ev.stopPropagation());

    const head = document.createElement("div");
    head.className = "fpcAiQuestionPanelHead";
    const titleNode = document.createElement("div");
    titleNode.className = "fpcAiQuestionPanelTitle";
    titleNode.textContent = title || eid;
    const metaNode = document.createElement("div");
    metaNode.className = "fpcAiQuestionPanelMeta";
    metaNode.textContent = `AI-вопросов: ${stats.total} · без ответа: ${stats.withoutComment}`;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "fpcAiQuestionPanelClose";
    closeBtn.textContent = "×";
    closeBtn.title = "Закрыть";
    closeBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      clearAiQuestionPanel(inst, mode);
    });

    const headText = document.createElement("div");
    headText.className = "fpcAiQuestionPanelHeadText";
    headText.appendChild(titleNode);
    headText.appendChild(metaNode);
    head.appendChild(headText);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    const list = document.createElement("div");
    list.className = "fpcAiQuestionList";
    questions.forEach((question) => {
      const row = document.createElement("div");
      row.className = `fpcAiQuestionRow ${normalizeAiQuestionStatus(question?.status) === "done" ? "done" : "open"}`;

      const line = document.createElement("label");
      line.className = "fpcAiQuestionLine";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = normalizeAiQuestionStatus(question?.status) === "done";
      checkbox.className = "fpcAiQuestionCheck";
      const text = document.createElement("span");
      text.className = "fpcAiQuestionText";
      text.textContent = toText(question?.text || question?.qid);
      line.appendChild(checkbox);
      line.appendChild(text);
      row.appendChild(line);

      const textarea = document.createElement("textarea");
      textarea.className = "fpcAiQuestionComment";
      textarea.placeholder = "Комментарий/ответ...";
      textarea.value = toText(question?.comment);
      textarea.rows = 2;
      row.appendChild(textarea);

      const foot = document.createElement("div");
      foot.className = "fpcAiQuestionRowFoot";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "fpcAiQuestionSave";
      saveBtn.textContent = "Сохранить";
      const state = document.createElement("span");
      state.className = "fpcAiQuestionState";
      state.textContent = "";
      foot.appendChild(saveBtn);
      foot.appendChild(state);
      row.appendChild(foot);
      list.appendChild(row);

      const applyStateText = (label) => {
        state.textContent = label;
        if (!label) return;
        setTimeout(() => {
          if (state.textContent === label) state.textContent = "";
        }, 1200);
      };

      const commit = (source) => {
        const changed = persistAiQuestionEntry(eid, question.qid, {
          status: checkbox.checked ? "done" : "open",
          comment: textarea.value,
        }, { source });
        if (changed) {
          row.classList.toggle("done", checkbox.checked);
          row.classList.toggle("open", !checkbox.checked);
          applyStateText("Сохранено");
        }
      };

      checkbox.addEventListener("change", () => commit("overlay_toggle_status"));
      saveBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        commit("overlay_save_click");
      });
      textarea.addEventListener("blur", () => commit("overlay_comment_blur"));
      textarea.addEventListener("keydown", (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
          ev.preventDefault();
          commit("overlay_comment_hotkey");
        }
      });
    });
    panel.appendChild(list);

    const panelWidth = 320;
    const left = Number(el?.width || 0) + 10;
    const top = Math.max(-6, Math.round(Number(el?.height || 0) / 2 - 80));
    const overlayId = overlays.add(el.id, {
      position: {
        left: Number.isFinite(left) ? left : panelWidth / 3,
        top: Number.isFinite(top) ? top : -6,
      },
      html: panel,
    });
    aiQuestionPanelStateRef.current[mode] = {
      overlayId,
      elementId: eid,
    };

    logAiOverlayTrace("panel_open", {
      sid: String(sessionId || "-"),
      elementId: eid,
      count: stats.total,
      source: toText(options?.source || "unknown"),
      kind: mode,
    });
  }

  function syncAiQuestionPanelWithSelection(inst, kind, element, source = "selection") {
    if (!inst) return;
    const mode = kind === "editor" ? "editor" : "viewer";
    const eid = toText(element?.id);
    if (!eid) {
      clearAiQuestionPanel(inst, mode);
      return;
    }
    const questions = getAiQuestionsForElement(eid);
    if (!questions.length) {
      clearAiQuestionPanel(inst, mode);
      return;
    }
    openAiQuestionPanel(inst, mode, eid, { source });
  }

  function emitElementSelectionChange(payload) {
    const cb = onElementSelectionChangeRef.current;
    if (typeof cb !== "function") return;
    if (!payload || !payload.id) {
      cb(null);
      return;
    }
    cb(payload);
  }

  function emitElementSelection(el, source = "diagram_click") {
    if (!isSelectableElement(el)) {
      emitElementSelectionChange(null);
      return;
    }
    const elementId = String(el?.id || "").trim();
    if (!elementId) {
      emitElementSelectionChange(null);
      return;
    }
    const bo = asObject(el?.businessObject);
    const name = String(bo?.name || elementId).trim() || elementId;
    const type = String(bo?.$type || el?.type || "").trim();
    const aiStats = aiQuestionStats(getAiQuestionsForElement(elementId));
    emitElementSelectionChange({
      id: elementId,
      name,
      type,
      noteCount: getElementNoteCount(elementId),
      aiQuestionCount: aiStats.total,
      aiQuestionDoneCount: aiStats.done,
      aiQuestionMissingCommentCount: aiStats.withoutComment,
      source,
    });
  }

  function readShapeBounds(el) {
    if (!el) return null;
    const x = Number(el?.x);
    const y = Number(el?.y);
    const width = Number(el?.width);
    const height = Number(el?.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    if (width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  }

  function isTaskLikeType(type) {
    const t = String(type || "").trim();
    return /task$/i.test(t);
  }

function logChangeElementTrace(stage, payload = {}) {
    try {
      if (typeof window !== "undefined" && (window.__FPC_E2E__ || shouldLogBpmnTrace())) {
        const prev = Array.isArray(window.__FPC_CHANGE_ELEMENT_LOG__) ? window.__FPC_CHANGE_ELEMENT_LOG__ : [];
        const next = [...prev, { ts: Date.now(), stage: String(stage || "-"), ...asObject(payload) }];
        if (next.length > 120) next.splice(0, next.length - 120);
        window.__FPC_CHANGE_ELEMENT_LOG__ = next;
      }
    } catch {
    }
    if (!shouldLogBpmnTrace()) return;
    const suffix = Object.entries(payload || {})
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" ");
    // eslint-disable-next-line no-console
    console.debug(`[CHANGE_ELEMENT] stage=${String(stage || "-")} ${suffix}`.trim());
  }

  function captureShapeReplacePre(ev, source = "pre") {
    const ctx = asObject(ev?.context || ev);
    const oldShape = ctx.oldShape || ctx.oldElement || ctx.shape || ctx.element || null;
    const oldId = String(oldShape?.id || "").trim();
    const oldType = String(oldShape?.businessObject?.$type || oldShape?.type || "").trim();
    const oldBounds = readShapeBounds(oldShape);
    const hadNotes = oldId ? getElementNoteCount(oldId) > 0 : false;
    const oldNotesEntry = hadNotes ? getElementNoteEntry(oldId) : null;
    replaceCommandStateRef.current = {
      oldId,
      oldType,
      hadNotes,
      oldNotesEntry,
      oldBounds,
      source,
      ts: Date.now(),
    };
    logChangeElementTrace("pre", {
      sid: String(sessionId || "-"),
      source,
      oldId: oldId || "-",
      oldType: oldType || "-",
      oldBounds: oldBounds ? formatRect(oldBounds) : "-",
      oldNotes: hadNotes ? 1 : 0,
    });
  }

  function applyShapeReplacePost(inst, ev, source = "post") {
    if (!inst) return;
    const ctx = asObject(ev?.context || ev);
    const state = asObject(replaceCommandStateRef.current);
    const registry = inst.get("elementRegistry");
    const modeling = inst.get("modeling");
    const newShape = ctx.newShape || ctx.newElement || ctx.shape || ctx.element || (state.oldId ? registry.get(state.oldId) : null);
    const newId = String(newShape?.id || "").trim();
    const newType = String(newShape?.businessObject?.$type || newShape?.type || "").trim();
    const newBounds = readShapeBounds(newShape);
    const oldBounds = state.oldBounds && typeof state.oldBounds === "object" ? state.oldBounds : null;
    const oldId = String(state.oldId || "").trim();
    const oldType = String(state.oldType || "").trim();
    const oldNotes = !!state.hadNotes;
    const oldNotesEntry = state.oldNotesEntry && typeof state.oldNotesEntry === "object"
      ? state.oldNotesEntry
      : null;
    const newNotesCount = newId ? getElementNoteCount(newId) : 0;

    logChangeElementTrace("post", {
      sid: String(sessionId || "-"),
      source,
      oldId: oldId || "-",
      newId: newId || "-",
      oldType: oldType || "-",
      newType: newType || "-",
      oldBounds: oldBounds ? formatRect(oldBounds) : "-",
      newBounds: newBounds ? formatRect(newBounds) : "-",
      oldNotes: oldNotes ? 1 : 0,
      newNotes: newNotesCount,
    });

    const shouldKeepTaskBounds = oldBounds
      && newBounds
      && isTaskLikeType(oldType)
      && isTaskLikeType(newType);
    const needsResize = shouldKeepTaskBounds
      && (
        Math.abs(Number(newBounds.width || 0) - Number(oldBounds.width || 0)) > 0.5
        || Math.abs(Number(newBounds.height || 0) - Number(oldBounds.height || 0)) > 0.5
        || Math.abs(Number(newBounds.x || 0) - Number(oldBounds.x || 0)) > 0.5
        || Math.abs(Number(newBounds.y || 0) - Number(oldBounds.y || 0)) > 0.5
      );

    if (needsResize && typeof modeling?.resizeShape === "function") {
      void withSuppressedCommandStack(async () => {
        try {
          const centerX = Number(oldBounds.x || 0) + Number(oldBounds.width || 0) / 2;
          const centerY = Number(oldBounds.y || 0) + Number(oldBounds.height || 0) / 2;
          const target = {
            x: Math.round((centerX - Number(oldBounds.width || 0) / 2) * 100) / 100,
            y: Math.round((centerY - Number(oldBounds.height || 0) / 2) * 100) / 100,
            width: Number(oldBounds.width || 0),
            height: Number(oldBounds.height || 0),
          };
          modeling.resizeShape(newShape, target);
          logChangeElementTrace("resize_applied", {
            sid: String(sessionId || "-"),
            elementId: newId || "-",
            targetBounds: formatRect(target),
          });
        } catch (error) {
          logChangeElementTrace("resize_failed", {
            sid: String(sessionId || "-"),
            elementId: newId || "-",
            err: String(error?.message || error || "resize_failed"),
          });
        }
      });
    }

    if (oldNotes && oldId && newId && (oldId !== newId || newNotesCount === 0)) {
      try {
        const remapCb = onElementNotesRemapRef.current;
        if (typeof remapCb === "function") {
          void Promise.resolve(
            remapCb(oldId, newId, {
              source: "shape_replace",
              oldType,
              newType,
              notesEntry: oldNotesEntry,
              forceRestore: newNotesCount === 0,
            }),
          );
        }
      } catch {
      }
    }

    if (newShape && isSelectableElement(newShape)) {
      setSelectedDecor(inst, "editor", newId);
      emitElementSelection(newShape, "editor.shape_replace");
      syncAiQuestionPanelWithSelection(inst, "editor", newShape, "editor.shape_replace");
    }
    applyTaskTypeDecor(inst, "editor");
    applyUserNotesDecor(inst, "editor");
  }

  function findShapeForHint(registry, hint) {
    const ids = new Set();
    asArray(hint?.elementIds)
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .forEach((x) => ids.add(x));

    const nodeId = String(hint?.nodeId || "").trim();
    if (nodeId) {
      ids.add(nodeId);
      ids.add(safeBpmnId(nodeId));
    }

    for (const id of ids) {
      const el = registry.get(id);
      if (isShapeElement(el)) return el;
    }

    const t = String(hint?.title || "").trim().toLowerCase();
    if (!t) return null;
    const byName = registry.filter((el) => {
      if (!isShapeElement(el)) return false;
      const n = String(el?.businessObject?.name || "").trim().toLowerCase();
      return n && n === t;
    });
    return byName[0] || null;
  }

  function findShapeByNodeId(registry, nodeId) {
    const nid = String(nodeId || "").trim();
    if (!nid) return null;
    const ids = [nid, safeBpmnId(nid)];
    for (const id of ids) {
      const el = registry.get(id);
      if (isShapeElement(el)) return el;
    }
    return null;
  }

  function clearInterviewDecor(inst, kind) {
    if (!inst) return;
    try {
      const canvas = inst.get("canvas");
      const overlays = inst.get("overlays");
      asArray(interviewMarkerStateRef.current[kind]).forEach((m) => {
        canvas.removeMarker(m.elementId, m.className);
      });
      asArray(interviewOverlayStateRef.current[kind]).forEach((id) => {
        overlays.remove(id);
      });
      interviewMarkerStateRef.current[kind] = [];
      interviewOverlayStateRef.current[kind] = [];
      clearAiQuestionPanel(inst, kind, { keepTarget: true });
    } catch {
    }
  }

  function clearTaskTypeDecor(inst, kind) {
    if (!inst) return;
    try {
      const canvas = inst.get("canvas");
      asArray(taskTypeMarkerStateRef.current[kind]).forEach((m) => {
        canvas.removeMarker(m.elementId, m.className);
      });
      taskTypeMarkerStateRef.current[kind] = [];
    } catch {
    }
  }

  function applyTaskTypeDecor(inst, kind) {
    if (!inst) return;
    clearTaskTypeDecor(inst, kind);
    try {
      const canvas = inst.get("canvas");
      const registry = inst.get("elementRegistry");
      const elements = registry.filter((el) => isShapeElement(el));
      const addTaskMarker = (elementId, className) => {
        canvas.addMarker(elementId, className);
        taskTypeMarkerStateRef.current[kind].push({ elementId, className });
      };
      const lightTaskTypes = new Set([
        "bpmn:Task",
        "bpmn:SendTask",
        "bpmn:ReceiveTask",
        "bpmn:ServiceTask",
        "bpmn:ManualTask",
        "bpmn:UserTask",
        "bpmn:ScriptTask",
        "bpmn:BusinessRuleTask",
        "bpmn:CallActivity",
      ]);

      elements.forEach((el) => {
        const t = String(el?.businessObject?.$type || "").trim();
        if (t === "bpmn:SendTask") {
          addTaskMarker(el.id, "fpcSendTask");
        }
        if (t === "bpmn:ReceiveTask") {
          addTaskMarker(el.id, "fpcReceiveTask");
        }
        if (lightTaskTypes.has(t)) {
          addTaskMarker(el.id, "fpcTaskLightBg");
        }
        if (t === "bpmn:StartEvent") {
          addTaskMarker(el.id, "fpcStartEvent");
        }
        if (t === "bpmn:EndEvent") {
          addTaskMarker(el.id, "fpcEndEvent");
        }
      });
    } catch {
    }
  }

  function buildInterviewDecorPayload() {
    const iv = asObject(draft?.interview);
    const steps = asArray(iv.steps);
    const nodesList = asArray(draft?.nodes);
    const aiQuestionsByElement = normalizeAiQuestionsByElementMap(iv.ai_questions_by_element || iv.aiQuestionsByElementId);
    if (!steps.length && !Object.keys(aiQuestionsByElement).length) return { items: [], groups: [], noteItems: [], aiQuestionItems: [] };

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
    const notesByNode = {};
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
      const hasNote = !!toText(s?.comment);

      if (subprocess) {
        const item = byNode[nodeId] || {
          nodeId,
          title: nodeTitle,
          subprocess: "",
        };
        item.subprocess = subprocess;
        byNode[nodeId] = item;
      }

      if (hasNote) {
        notesByNode[nodeId] = {
          nodeId,
          title: nodeTitle,
        };
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
      const items = normalizeAiQuestionItems(aiQuestionsByElement[rawElementId]);
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
      noteItems: Object.values(notesByNode),
      aiQuestionItems: Object.values(aiByNode),
    };
  }

  function applyInterviewDecor(inst, kind) {
    if (!inst) return;
    clearInterviewDecor(inst, kind);
    const payload = buildInterviewDecorPayload();
    const items = asArray(payload?.items);
    const groups = asArray(payload?.groups);
    const noteItems = asArray(payload?.noteItems);
    const aiQuestionItems = asArray(payload?.aiQuestionItems);
    if (!items.length && !groups.length && !noteItems.length && !aiQuestionItems.length) {
      aiQuestionPanelTargetRef.current[kind] = "";
      clearAiQuestionPanel(inst, kind);
      return;
    }

    try {
      const canvas = inst.get("canvas");
      const overlays = inst.get("overlays");
      const registry = inst.get("elementRegistry");

      items.forEach((it) => {
        const el = findShapeByNodeId(registry, it.nodeId) || findShapeForHint(registry, { nodeId: it.nodeId, title: it.title });
        if (!el) return;

        canvas.addMarker(el.id, "fpcInterviewNode");
        interviewMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcInterviewNode" });
      });

      noteItems.forEach((it) => {
        const el = findShapeByNodeId(registry, it.nodeId) || findShapeForHint(registry, { nodeId: it.nodeId, title: it.title });
        if (!el) return;
        canvas.addMarker(el.id, "fpcHasNote");
        interviewMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcHasNote" });

        const dot = document.createElement("div");
        dot.className = "fpcNoteDot";
        dot.title = "Есть заметка в Interview";
        const oid = overlays.add(el.id, {
          position: { top: -7, right: -7 },
          html: dot,
        });
        interviewOverlayStateRef.current[kind].push(oid);
      });

      aiQuestionItems.forEach((it) => {
        const el = findShapeByNodeId(registry, it.nodeId) || findShapeForHint(registry, { nodeId: it.nodeId, title: it.title });
        if (!el) return;
        canvas.addMarker(el.id, "fpcHasAiQuestion");
        interviewMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcHasAiQuestion" });

        const indicator = document.createElement("button");
        indicator.type = "button";
        indicator.className = `fpcAiQuestionIndicator ${Number(it?.withoutComment || 0) > 0 ? "warn" : "ok"}`;
        indicator.textContent = `AI ${Number(it?.count || 0)} ▼`;
        indicator.title = `AI-вопросов: ${Number(it?.count || 0)} · без комментария: ${Number(it?.withoutComment || 0)}`;
        indicator.addEventListener("mousedown", (ev) => ev.stopPropagation());
        indicator.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setSelectedDecor(inst, kind, el.id);
          emitElementSelection(el, `${kind}.ai_indicator_click`);
          openAiQuestionPanel(inst, kind, el.id, { source: "indicator_click", toggle: true });
        });
        const oid = overlays.add(el.id, {
          position: {
            top: Number(el?.height || 0) + 8,
            left: Math.max(6, Math.round(Number(el?.width || 0) / 2 - 34)),
          },
          html: indicator,
        });
        interviewOverlayStateRef.current[kind].push(oid);
      });

      groups.forEach((g) => {
        const groupName = toText(g?.name);
        const rawIds = asArray(g?.nodeIds).map((x) => toText(x)).filter(Boolean);
        if (!groupName || !rawIds.length) return;

        const shapes = [];
        const usedShapeIds = new Set();
        rawIds.forEach((nid) => {
          const el = findShapeByNodeId(registry, nid) || findShapeForHint(registry, { nodeId: nid, title: nid });
          if (!isShapeElement(el) || usedShapeIds.has(el.id)) return;
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
        interviewOverlayStateRef.current[kind].push(oid);
      });

      const currentTarget = toText(aiQuestionPanelTargetRef.current[kind]);
      if (currentTarget) {
        openAiQuestionPanel(inst, kind, currentTarget, {
          source: "interview_decor_refresh",
        });
      } else {
        clearAiQuestionPanel(inst, kind, { keepTarget: true });
      }
    } catch {
    }
  }

  function clearUserNotesDecor(inst, kind) {
    if (!inst) return;
    try {
      const canvas = inst.get("canvas");
      const overlays = inst.get("overlays");
      asArray(userNotesMarkerStateRef.current[kind]).forEach((m) => {
        canvas.removeMarker(m.elementId, m.className);
      });
      asArray(userNotesOverlayStateRef.current[kind]).forEach((id) => {
        overlays.remove(id);
      });
      userNotesMarkerStateRef.current[kind] = [];
      userNotesOverlayStateRef.current[kind] = [];
    } catch {
    }
  }

  function buildUserNotesDecorPayload() {
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

  function applyUserNotesDecor(inst, kind) {
    if (!inst) return;
    clearUserNotesDecor(inst, kind);
    const payload = buildUserNotesDecorPayload();
    if (!payload.length) return;
    try {
      const canvas = inst.get("canvas");
      const overlays = inst.get("overlays");
      const registry = inst.get("elementRegistry");
      payload.forEach((it) => {
        const el = registry.get(it.elementId);
        if (!isShapeElement(el)) return;
        canvas.addMarker(el.id, "fpcHasUserNote");
        userNotesMarkerStateRef.current[kind].push({ elementId: el.id, className: "fpcHasUserNote" });

        const dot = document.createElement("div");
        dot.className = "fpcUserNoteDot";
        dot.textContent = it.count > 9 ? "9+" : String(it.count);
        dot.title = `Заметок: ${it.count}`;
        const oid = overlays.add(el.id, {
          position: { top: -8, right: -8 },
          html: dot,
        });
        userNotesOverlayStateRef.current[kind].push(oid);
      });
    } catch {
    }
  }

  function clearFocusDecor(inst, kind) {
    const state = focusStateRef.current[kind];
    if (!state) return;
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = 0;
    }
    if (inst && state.elementId) {
      try {
        const canvas = inst.get("canvas");
        canvas.removeMarker(state.elementId, "fpcNodeFocus");
      } catch {
      }
    }
    state.elementId = "";
  }

  function focusNodeOnInstance(inst, kind, nodeId) {
    if (!inst) return false;
    try {
      const registry = inst.get("elementRegistry");
      const canvas = inst.get("canvas");
      const el = findShapeByNodeId(registry, nodeId);
      if (!el) return false;

      const center = {
        x: Number(el.x || 0) + Number(el.width || 0) / 2,
        y: Number(el.y || 0) + Number(el.height || 0) / 2,
      };

      if (typeof canvas.scrollToElement === "function") {
        canvas.scrollToElement(el, { top: 120, bottom: 120, left: 180, right: 180 });
      }
      const z = canvas.zoom();
      if (!Number.isFinite(z) || z < 0.8) {
        canvas.zoom(1, center);
      }

      clearFocusDecor(inst, kind);
      canvas.addMarker(el.id, "fpcNodeFocus");
      focusStateRef.current[kind].elementId = el.id;
      focusStateRef.current[kind].timer = window.setTimeout(() => {
        try {
          canvas.removeMarker(el.id, "fpcNodeFocus");
        } catch {
        }
        focusStateRef.current[kind].elementId = "";
        focusStateRef.current[kind].timer = 0;
      }, 1900);
      return true;
    } catch {
      return false;
    }
  }

  function clearBottleneckDecor(inst, kind) {
    if (!inst) return;
    try {
      const canvas = inst.get("canvas");
      const overlays = inst.get("overlays");
      asArray(markerStateRef.current[kind]).forEach((m) => {
        canvas.removeMarker(m.elementId, m.className);
      });
      asArray(overlayStateRef.current[kind]).forEach((id) => {
        overlays.remove(id);
      });
      markerStateRef.current[kind] = [];
      overlayStateRef.current[kind] = [];
    } catch {
    }
  }

  function applyBottleneckDecor(inst, kind) {
    if (!inst) return;
    clearBottleneckDecor(inst, kind);
    const hints = asArray(bottlenecksRef.current);
    if (!hints.length) return;

    try {
      const canvas = inst.get("canvas");
      const overlays = inst.get("overlays");
      const registry = inst.get("elementRegistry");
      const used = new Set();

      hints.forEach((hint) => {
        const el = findShapeForHint(registry, hint);
        if (!el || used.has(el.id)) return;
        used.add(el.id);

        const cls = severityClass(hint?.severity);
        canvas.addMarker(el.id, cls);
        markerStateRef.current[kind].push({ elementId: el.id, className: cls });

        const tag = document.createElement("div");
        const aiHint = String(hint?.aiHint || hint?.ai_hint || "").trim();
        const hasHint = !!aiHint;
        tag.className = `fpcBottleneckTag ${String(hint?.severity || "low").toLowerCase()}${hasHint ? " hint" : ""}`;
        tag.textContent = hasHint ? aiHint : severityTag(hint?.severity);
        const title = [
          String(hint?.title || "").trim(),
          hasHint ? `AI: ${aiHint}` : "",
          asArray(hint?.reasons).join("; "),
        ].filter(Boolean).join(" · ");
        if (title) tag.title = title;

        const oid = overlays.add(el.id, {
          position: { top: -14, right: -14 },
          html: tag,
        });
        overlayStateRef.current[kind].push(oid);
      });
    } catch {
    }
  }

  function destroyRuntime() {
    const prevModeler = modelerRef.current;
    const prevModelerMeta = asObject(modelerInstanceMetaRef.current);
    const prevViewerMeta = asObject(viewerInstanceMetaRef.current);
    const sidBeforeDestroy = String(activeSessionRef.current || sessionId || "-");
    if (typeof bpmnStoreUnsubRef.current === "function") {
      try {
        bpmnStoreUnsubRef.current();
      } catch {
      }
    }
    bpmnStoreUnsubRef.current = null;
    try {
      bpmnCoordinatorRef.current?.destroy?.();
    } catch {
    }
    bpmnCoordinatorRef.current = null;
    bpmnStoreRef.current = null;
    modelerDecorBoundInstanceRef.current = null;
    const modelerRuntime = modelerRuntimeRef.current;
    modelerRuntimeRef.current = null;
    clearFocusDecor(viewerRef.current, "viewer");
    clearFocusDecor(modelerRef.current, "editor");
    clearSelectedDecor(viewerRef.current, "viewer");
    clearSelectedDecor(modelerRef.current, "editor");
    clearBottleneckDecor(viewerRef.current, "viewer");
    clearBottleneckDecor(modelerRef.current, "editor");
    clearInterviewDecor(viewerRef.current, "viewer");
    clearInterviewDecor(modelerRef.current, "editor");
    clearTaskTypeDecor(viewerRef.current, "viewer");
    clearTaskTypeDecor(modelerRef.current, "editor");
    clearUserNotesDecor(viewerRef.current, "viewer");
    clearUserNotesDecor(modelerRef.current, "editor");
    try {
      viewerRef.current?.destroy?.();
    } catch {
    }
    try {
      modelerRuntime?.destroy?.();
    } catch {
    }
    markerStateRef.current = { viewer: [], editor: [] };
    overlayStateRef.current = { viewer: [], editor: [] };
    interviewMarkerStateRef.current = { viewer: [], editor: [] };
    interviewOverlayStateRef.current = { viewer: [], editor: [] };
    taskTypeMarkerStateRef.current = { viewer: [], editor: [] };
    userNotesMarkerStateRef.current = { viewer: [], editor: [] };
    userNotesOverlayStateRef.current = { viewer: [], editor: [] };
    aiQuestionPanelStateRef.current = {
      viewer: { overlayId: null, elementId: "" },
      editor: { overlayId: null, elementId: "" },
    };
    aiQuestionPanelTargetRef.current = { viewer: "", editor: "" };
    selectedMarkerStateRef.current = { viewer: "", editor: "" };
    focusStateRef.current = {
      viewer: { elementId: "", timer: 0 },
      editor: { elementId: "", timer: 0 },
    };
    viewerRef.current = null;
    modelerRef.current = null;
    viewerReadyRef.current = false;
    modelerReadyRef.current = false;
    userViewportTouchedRef.current = false;
    lastModelerXmlHashRef.current = "";
    modelerInstanceMetaRef.current = { id: 0, containerKey: "" };
    viewerInstanceMetaRef.current = { id: 0, containerKey: "" };
    suppressViewboxEventRef.current = 0;
    ensureVisiblePromiseRef.current = null;
    ensureVisibleCycleRef.current = 0;
    ensureEpochRef.current += 1;
    modelerImportInFlightRef.current = { sid: "", xmlHash: "", promise: null };
    runtimeTokenRef.current += 1;
    logRuntimeTrace("destroy", {
      sid: sidBeforeDestroy,
      mode: "modeler",
      token: Number(runtimeTokenRef.current || 0),
      instanceId: Number(prevModelerMeta.id || 0),
      containerKey: String(prevModelerMeta.containerKey || "-"),
    });
    logRuntimeTrace("destroy", {
      sid: sidBeforeDestroy,
      mode: "viewer",
      token: Number(runtimeTokenRef.current || 0),
      instanceId: Number(prevViewerMeta.id || 0),
      containerKey: String(prevViewerMeta.containerKey || "-"),
    });
    trackRuntimeStatus(
      {
        token: runtimeTokenRef.current,
        ready: false,
        defs: false,
        destroyed: true,
        reason: "destroyRuntime",
      },
      "destroyRuntime",
    );
    viewerInitPromiseRef.current = null;
    modelerInitPromiseRef.current = null;
    try {
      if (viewerEl.current) viewerEl.current.innerHTML = "";
    } catch {
    }
    try {
      if (editorEl.current) editorEl.current.innerHTML = "";
    } catch {
    }
    try {
      if (typeof window !== "undefined" && window.__FPC_E2E_MODELER__ === prevModeler) {
        window.__FPC_E2E_MODELER__ = null;
      }
    } catch {
    }
    try {
      if (typeof window !== "undefined" && window.__FPC_E2E_RUNTIME__ === modelerRuntime) {
        window.__FPC_E2E_RUNTIME__ = null;
      }
    } catch {
    }
  }

  async function loadFromBackend(sid, token = 0, options = {}) {
    const s = String(sid || "");
    if (token && token !== loadTokenRef.current) return;
    if (s !== activeSessionRef.current) return;
    if (!s) {
      applyXmlSnapshot("");
      setSrcHint("");
      setErr("");
      return;
    }

    const coordinator = ensureBpmnCoordinator();
    const loaded = await coordinator.reload({
      reason: options?.reason || "stage_load",
      preferStore: options?.forceRemote !== true,
      rev: Number(bpmnStoreRef.current?.getState?.()?.rev || 0),
    });

    if (token && token !== loadTokenRef.current) return;
    if (s !== activeSessionRef.current) return;

    if (!loaded?.ok) {
      if (Number(loaded?.status) === 404) {
        applyXmlSnapshot("");
        setSrcHint("");
        setErr(`Сессия ${s} не найдена. Обновите список сессий или создайте новую API-сессию.`);
      } else {
        setErr(String(loaded?.error || "failed to load bpmn"));
      }
      return;
    }

    if (!loaded.applied) {
      const reason = String(loaded.reason || "");
      if (reason === "store_priority" || reason === "older_rev" || reason === "dirty_local_newer") {
        if (loaded.source) setSrcHint(String(loaded.source));
        setErr("");
        return;
      }
    }

    const xmlText = String(loaded.xml || "");
    const source = String(loaded.source || "backend");
    setErr("");
    if (source) setSrcHint(source);
    logBpmnTrace(`loadSnapshot.${source}`, xmlText, {
      sid: s,
      status: Number(loaded.status || 200),
      rev: Number(loaded.loadedRev || loaded.rev || 0),
    });
  }

  async function ensureViewer() {
    if (viewerRef.current) return viewerRef.current;
    if (viewerInitPromiseRef.current) return viewerInitPromiseRef.current;
    viewerInitPromiseRef.current = (async () => {
      try {
        if (viewerEl.current) viewerEl.current.innerHTML = "";
      } catch {
      }
      const mod = await import("bpmn-js/lib/NavigatedViewer");
      const Viewer = mod.default || mod;
      const v = new Viewer({ container: viewerEl.current });
      runtimeInstanceSeq += 1;
      viewerInstanceMetaRef.current = {
        id: runtimeInstanceSeq,
        containerKey: ensureContainerKey(viewerEl.current),
      };
      logRuntimeTrace("init", {
        sid: String(activeSessionRef.current || sessionId || "-"),
        mode: "viewer",
        token: Number(runtimeTokenRef.current || 0),
        instanceId: Number(viewerInstanceMetaRef.current.id || 0),
        containerKey: String(viewerInstanceMetaRef.current.containerKey || "-"),
      });
      viewerReadyRef.current = false;
      try {
        const eventBus = v.get("eventBus");
        eventBus.on("element.click", 2000, (ev) => {
          const el = ev?.element;
          if (!isSelectableElement(el)) return;
          setSelectedDecor(v, "viewer", el.id);
          emitElementSelection(el, "viewer.element_click");
          syncAiQuestionPanelWithSelection(v, "viewer", el, "viewer.element_click");
        });
        eventBus.on("canvas.click", 2000, () => {
          clearSelectedDecor(v, "viewer");
          emitElementSelectionChange(null);
          clearAiQuestionPanel(v, "viewer");
        });
        eventBus.on("selection.changed", 2000, (ev) => {
          const selected = asArray(ev?.newSelection)[0];
          if (!isSelectableElement(selected)) {
            clearSelectedDecor(v, "viewer");
            emitElementSelectionChange(null);
            clearAiQuestionPanel(v, "viewer");
            return;
          }
          setSelectedDecor(v, "viewer", selected.id);
          emitElementSelection(selected, "viewer.selection_changed");
          syncAiQuestionPanelWithSelection(v, "viewer", selected, "viewer.selection_changed");
        });
        eventBus.on("canvas.viewbox.changed", 1200, () => {
          const suppressed = Number(suppressViewboxEventRef.current || 0) > 0;
          if (!suppressed) userViewportTouchedRef.current = true;
          const snap = getCanvasSnapshot(v);
          logViewAction(
            "viewbox.changed",
            snap,
            snap,
            {
              reason: suppressed ? "programmatic" : "user",
              tab: view === "xml" ? "xml" : "diagram",
              sid: String(sessionId || "-"),
              token: Number(runtimeTokenRef.current || 0),
            },
          );
        });
      } catch {
      }
      viewerRef.current = v;
      return v;
    })();
    try {
      return await viewerInitPromiseRef.current;
    } finally {
      viewerInitPromiseRef.current = null;
    }
  }

  async function ensureModeler() {
    if (modelerRef.current) {
      try {
        if (typeof window !== "undefined") {
          window.__FPC_E2E_MODELER__ = modelerRef.current;
        }
      } catch {
      }
      return modelerRef.current;
    }
    if (modelerInitPromiseRef.current) return modelerInitPromiseRef.current;
    modelerInitPromiseRef.current = (async () => {
      const runtime = ensureModelerRuntime();
      const layoutReady = await waitForNonZeroRect(() => editorEl.current, {
        sid: String(activeSessionRef.current || sessionId || "-"),
        token: Number(runtimeTokenRef.current || 0),
        reason: "ensure_modeler_init",
        timeoutMs: 5000,
      });
      if (!layoutReady.ok) {
        throw new Error("layout_not_ready_before_modeler_init");
      }
      try {
        if (editorEl.current) editorEl.current.innerHTML = "";
      } catch {
      }
      const m = await runtime.init(editorEl.current, { mode: "modeler" });
      runtimeInstanceSeq += 1;
      modelerInstanceMetaRef.current = {
        id: runtimeInstanceSeq,
        containerKey: ensureContainerKey(editorEl.current),
      };
      logRuntimeTrace("init", {
        sid: String(activeSessionRef.current || sessionId || "-"),
        mode: "modeler",
        token: Number(runtimeTokenRef.current || 0),
        instanceId: Number(modelerInstanceMetaRef.current.id || 0),
        containerKey: String(modelerInstanceMetaRef.current.containerKey || "-"),
      });
      const runtimeStatus = runtime.getStatus();
      runtimeTokenRef.current = Number(runtimeStatus?.token || runtimeTokenRef.current || 0);
      modelerReadyRef.current = !!runtimeStatus?.ready && !!runtimeStatus?.defs;
      try {
        if (m && modelerDecorBoundInstanceRef.current !== m) {
          const eventBus = m.get("eventBus");
          eventBus.on("commandStack.shape.replace.preExecute", 2200, (ev) => {
            captureShapeReplacePre(ev, "commandStack.shape.replace.preExecute");
          });
          eventBus.on("commandStack.shape.replace.postExecute", 2200, (ev) => {
            applyShapeReplacePost(m, ev, "commandStack.shape.replace.postExecute");
          });
          eventBus.on("element.click", 2000, (ev) => {
            const el = ev?.element;
            if (!isSelectableElement(el)) return;
            setSelectedDecor(m, "editor", el.id);
            emitElementSelection(el, "editor.element_click");
            syncAiQuestionPanelWithSelection(m, "editor", el, "editor.element_click");
          });
          eventBus.on("canvas.click", 2000, () => {
            clearSelectedDecor(m, "editor");
            emitElementSelectionChange(null);
            clearAiQuestionPanel(m, "editor");
          });
          eventBus.on("selection.changed", 2000, (ev) => {
            const selected = asArray(ev?.newSelection)[0];
            if (!isSelectableElement(selected)) {
              clearSelectedDecor(m, "editor");
              emitElementSelectionChange(null);
              clearAiQuestionPanel(m, "editor");
              return;
            }
            setSelectedDecor(m, "editor", selected.id);
            emitElementSelection(selected, "editor.selection_changed");
            syncAiQuestionPanelWithSelection(m, "editor", selected, "editor.selection_changed");
          });
          eventBus.on("canvas.viewbox.changed", 1200, () => {
            const suppressed = Number(suppressViewboxEventRef.current || 0) > 0;
            if (!suppressed) userViewportTouchedRef.current = true;
            const snap = getCanvasSnapshot(m);
            logViewAction(
              "viewbox.changed",
              snap,
              snap,
              {
                reason: suppressed ? "programmatic" : "user",
                tab: view === "xml" ? "xml" : "diagram",
                sid: String(sessionId || "-"),
                token: Number(runtimeTokenRef.current || 0),
              },
            );
          });
          modelerDecorBoundInstanceRef.current = m;
        }
      } catch {
      }
      modelerRef.current = m;
      try {
        if (typeof window !== "undefined") {
          window.__FPC_E2E_MODELER__ = m;
        }
      } catch {
      }
      return m;
    })();
    try {
      return await modelerInitPromiseRef.current;
    } finally {
      modelerInitPromiseRef.current = null;
    }
  }

  async function renderViewer(nextXml) {
    const v = await ensureViewer();
    const token = runtimeTokenRef.current + 1;
    runtimeTokenRef.current = token;
    viewerReadyRef.current = false;
    logRuntimeTrace("import.start", {
      sid: String(activeSessionRef.current || sessionId || "-"),
      mode: "viewer",
      token,
      instanceId: Number(viewerInstanceMetaRef.current.id || 0),
      containerKey: String(viewerInstanceMetaRef.current.containerKey || "-"),
      xmlHash: fnv1aHex(String(nextXml || "")),
      xmlLen: String(nextXml || "").length,
    });
    logImportTrace("start", {
      sid: String(activeSessionRef.current || sessionId || "-"),
      mode: "viewer",
      token,
      instanceId: Number(viewerInstanceMetaRef.current.id || 0),
      containerKey: String(viewerInstanceMetaRef.current.containerKey || "-"),
      xmlHash: fnv1aHex(String(nextXml || "")),
    });
    logBpmnTrace("importXML.viewer.before", nextXml, { sid: String(sessionId || "") });
    await v.importXML(String(nextXml || ""));
    if (token !== runtimeTokenRef.current || v !== viewerRef.current) return;
    viewerReadyRef.current = true;
    const registryCount = Array.isArray(v?.get?.("elementRegistry")?.getAll?.())
      ? v.get("elementRegistry").getAll().length
      : 0;
    logRuntimeTrace("import.done", {
      sid: String(activeSessionRef.current || sessionId || "-"),
      mode: "viewer",
      token: Number(runtimeTokenRef.current || 0),
      instanceId: Number(viewerInstanceMetaRef.current.id || 0),
      containerKey: String(viewerInstanceMetaRef.current.containerKey || "-"),
      xmlHash: fnv1aHex(String(nextXml || "")),
      xmlLen: String(nextXml || "").length,
      registryCount,
    });
    logImportTrace("done", {
      sid: String(activeSessionRef.current || sessionId || "-"),
      mode: "viewer",
      token: Number(runtimeTokenRef.current || 0),
      instanceId: Number(viewerInstanceMetaRef.current.id || 0),
      containerKey: String(viewerInstanceMetaRef.current.containerKey || "-"),
      xmlHash: fnv1aHex(String(nextXml || "")),
      registryCount,
    });
    clearSelectedDecor(v, "viewer");
    emitElementSelectionChange(null);
    await ensureCanvasVisibleAndFit(v, "renderViewer", String(sessionId || ""), {
      reason: "render_viewer_import",
      tab: "diagram",
      token: runtimeTokenRef.current,
      allowFit: true,
      fitIfInvisible: true,
      suppressViewbox: suppressViewboxEvents,
    });
    const importProbe = probeCanvas(v, "after_import", {
      sid: String(sessionId || ""),
      tab: "diagram",
      token: runtimeTokenRef.current,
      reason: "viewer_import",
      expectElements: String(nextXml || "").trim().length > 0,
    });
    if (importProbe.invisible) {
      await ensureVisibleOnInstance(v, {
        reason: "viewer_import_invisible",
        tab: "diagram",
        expectElements: String(nextXml || "").trim().length > 0,
      });
    }
    applyTaskTypeDecor(v, "viewer");
    applyBottleneckDecor(v, "viewer");
    applyInterviewDecor(v, "viewer");
    applyUserNotesDecor(v, "viewer");
  }

  async function renderModeler(nextXml) {
    const sidNow = String(activeSessionRef.current || sessionId || "-");
    const xmlText = String(nextXml || "");
    const xmlHash = fnv1aHex(xmlText);
    const inFlight = modelerImportInFlightRef.current;
    if (
      inFlight
      && inFlight.promise
      && inFlight.sid === sidNow
      && inFlight.xmlHash === xmlHash
    ) {
      logRuntimeTrace("import.reuse_inflight", {
        sid: sidNow,
        mode: "modeler",
        token: Number(runtimeTokenRef.current || 0),
        instanceId: Number(modelerInstanceMetaRef.current.id || 0),
        containerKey: String(modelerInstanceMetaRef.current.containerKey || "-"),
        xmlHash,
      });
      await inFlight.promise;
      return;
    }

    const importPromise = (async () => {
      const runtime = ensureModelerRuntime();
      const m = await ensureModeler();
      const layoutReady = await waitForNonZeroRect(
        () => m?.get?.("canvas")?._container || editorEl.current,
        {
          sid: String(activeSessionRef.current || sessionId || "-"),
          token: Number(runtimeTokenRef.current || 0),
          reason: "render_modeler_before_import",
          timeoutMs: 5000,
        },
      );
      if (!layoutReady.ok) {
        throw new Error("layout_not_ready_before_modeler_import");
      }
      const beforeStatus = runtime.getStatus();
      runtimeTokenRef.current = Number(beforeStatus?.token || runtimeTokenRef.current || 0);
      modelerReadyRef.current = false;
      logRuntimeTrace("import.start", {
        sid: String(activeSessionRef.current || sessionId || "-"),
        mode: "modeler",
        token: Number(runtimeTokenRef.current || 0),
        instanceId: Number(modelerInstanceMetaRef.current.id || 0),
        containerKey: String(modelerInstanceMetaRef.current.containerKey || "-"),
        xmlHash: fnv1aHex(String(nextXml || "")),
        xmlLen: String(nextXml || "").length,
      });
      logImportTrace("start", {
        sid: String(activeSessionRef.current || sessionId || "-"),
        mode: "modeler",
        token: Number(runtimeTokenRef.current || 0),
        instanceId: Number(modelerInstanceMetaRef.current.id || 0),
        containerKey: String(modelerInstanceMetaRef.current.containerKey || "-"),
        xmlHash: fnv1aHex(String(nextXml || "")),
      });
      logBpmnTrace("importXML.modeler.before", nextXml, { sid: String(sessionId || "") });
      const loaded = await runtime.load(String(nextXml || ""), { source: "renderModeler" });
      const afterStatus = runtime.getStatus();
      runtimeTokenRef.current = Number(afterStatus?.token || runtimeTokenRef.current || 0);
      modelerReadyRef.current = !!afterStatus?.ready && !!afterStatus?.defs;
      if (shouldLogBpmnTrace()) {
        // eslint-disable-next-line no-console
        console.debug(
          `[READY] sid=${String(activeSessionRef.current || sessionId || "-")} token=${Number(runtimeTokenRef.current || 0)} `
          + `ready=${modelerReadyRef.current ? 1 : 0} defs=${afterStatus?.defs ? 1 : 0} reason=import_done`,
        );
      }
      if (!loaded.ok) {
        if (loaded.reason === "stale") return;
        throw new Error(String(loaded.error || loaded.reason || "importXML failed"));
      }
      if (!m || m !== modelerRef.current) return;
      try {
        const canvas = m.get("canvas");
        await waitAnimationFrame();
        suppressViewboxEvents(1);
        try {
          canvas?.resized?.();
        } finally {
          suppressViewboxEvents(-1);
        }
      } catch {
      }
      const registryCount = Array.isArray(m?.get?.("elementRegistry")?.getAll?.())
        ? m.get("elementRegistry").getAll().length
        : 0;
      logRuntimeTrace("import.done", {
        sid: String(activeSessionRef.current || sessionId || "-"),
        mode: "modeler",
        token: Number(runtimeTokenRef.current || 0),
        instanceId: Number(modelerInstanceMetaRef.current.id || 0),
        containerKey: String(modelerInstanceMetaRef.current.containerKey || "-"),
        xmlHash: fnv1aHex(String(nextXml || "")),
        xmlLen: String(nextXml || "").length,
        registryCount,
      });
      logImportTrace("done", {
        sid: String(activeSessionRef.current || sessionId || "-"),
        mode: "modeler",
        token: Number(runtimeTokenRef.current || 0),
        instanceId: Number(modelerInstanceMetaRef.current.id || 0),
        containerKey: String(modelerInstanceMetaRef.current.containerKey || "-"),
        xmlHash: fnv1aHex(String(nextXml || "")),
        registryCount,
      });
      lastModelerXmlHashRef.current = fnv1aHex(String(nextXml || ""));
      try {
        if (typeof window !== "undefined") {
          window.__FPC_E2E_MODELER__ = m;
        }
      } catch {
      }
      clearSelectedDecor(m, "editor");
      emitElementSelectionChange(null);
      await ensureCanvasVisibleAndFit(m, "renderModeler", String(sessionId || ""), {
        reason: "render_modeler_import",
        tab: "diagram",
        token: runtimeTokenRef.current,
        allowFit: true,
        fitIfInvisible: true,
        suppressViewbox: suppressViewboxEvents,
      });
      const importProbe = probeCanvas(m, "after_import", {
        sid: String(sessionId || ""),
        tab: "diagram",
        token: runtimeTokenRef.current,
        reason: "modeler_import",
        expectElements: String(nextXml || "").trim().length > 0,
      });
      if (importProbe.invisible) {
        await ensureVisibleOnInstance(m, {
          reason: "modeler_import_invisible",
          tab: "diagram",
          expectElements: String(nextXml || "").trim().length > 0,
        });
      }
      applyTaskTypeDecor(m, "editor");
      applyBottleneckDecor(m, "editor");
      applyInterviewDecor(m, "editor");
      applyUserNotesDecor(m, "editor");
    })();

    modelerImportInFlightRef.current = { sid: sidNow, xmlHash, promise: importPromise };
    try {
      await importPromise;
    } finally {
      const current = modelerImportInFlightRef.current;
      if (current && current.promise === importPromise) {
        modelerImportInFlightRef.current = { sid: "", xmlHash: "", promise: null };
      }
    }
  }

  async function renderNewDiagramInModeler() {
    const runtime = ensureModelerRuntime();
    const m = await ensureModeler();
    const layoutReady = await waitForNonZeroRect(
      () => m?.get?.("canvas")?._container || editorEl.current,
      {
        sid: String(activeSessionRef.current || sessionId || "-"),
        token: Number(runtimeTokenRef.current || 0),
        reason: "render_new_diagram_before_create",
        timeoutMs: 5000,
      },
    );
    if (!layoutReady.ok) {
      throw new Error("layout_not_ready_before_create_diagram");
    }
    const sidNow = String(activeSessionRef.current || sessionId || "");
    if (shouldLogBpmnTrace()) {
      // eslint-disable-next-line no-console
      console.debug(
        `[CREATE_DIAGRAM] start sid=${sidNow || "-"} token=${Number(runtimeTokenRef.current || 0)}`,
      );
    }
    const created = await runtime.createDiagram({ source: "renderNewDiagramInModeler" });
    const status = runtime.getStatus();
    runtimeTokenRef.current = Number(status?.token || runtimeTokenRef.current || 0);
    modelerReadyRef.current = !!status?.ready && !!status?.defs;
    if (shouldLogBpmnTrace()) {
      const probe = probeCanvas(m, "create_diagram_done", {
        sid: sidNow || "-",
        tab: "diagram",
        token: runtimeTokenRef.current,
        reason: "createDiagram_done",
      });
      // eslint-disable-next-line no-console
      console.debug(
        `[CREATE_DIAGRAM] done sid=${sidNow || "-"} token=${Number(runtimeTokenRef.current || 0)} `
        + `defs=${status?.defs ? 1 : 0} ready=${modelerReadyRef.current ? 1 : 0} registryCount=${Number(probe?.registryCount || 0)} `
        + `svgRect=${Math.round(Number(probe?.svgWidth || 0))}x${Math.round(Number(probe?.svgHeight || 0))}`,
      );
      // eslint-disable-next-line no-console
      console.debug(
        `[READY] sid=${sidNow || "-"} token=${Number(runtimeTokenRef.current || 0)} `
        + `ready=${modelerReadyRef.current ? 1 : 0} defs=${status?.defs ? 1 : 0} reason=createDiagram_done`,
      );
    }
    if (!created.ok) {
      if (created.reason === "stale") return;
      throw new Error(String(created.error || created.reason || "createDiagram failed"));
    }
    if (!m || m !== modelerRef.current) return;
    try {
      const xmlRes = await runtime.getXml({ format: true });
      if (xmlRes?.ok) {
        const seededXml = String(xmlRes.xml || "");
        lastModelerXmlHashRef.current = fnv1aHex(seededXml);
        if (seededXml.trim() && sidNow && sidNow === String(activeSessionRef.current || "")) {
          applyXmlSnapshot(seededXml, "create_diagram_seed");
        }
      }
    } catch {
    }
    try {
      if (typeof window !== "undefined") {
        window.__FPC_E2E_MODELER__ = m;
      }
    } catch {
    }
    clearSelectedDecor(m, "editor");
    emitElementSelectionChange(null);
    await ensureCanvasVisibleAndFit(m, "renderNewDiagramInModeler", String(sessionId || ""), {
      reason: "render_new_diagram",
      tab: "diagram",
      token: runtimeTokenRef.current,
      allowFit: true,
      fitIfInvisible: true,
      suppressViewbox: suppressViewboxEvents,
    });
    const importProbe = probeCanvas(m, "after_import", {
      sid: String(sessionId || ""),
      tab: "diagram",
      token: runtimeTokenRef.current,
      reason: "modeler_create_diagram",
    });
    if (importProbe.invisible) {
      await ensureVisibleOnInstance(m, {
        reason: "modeler_create_invisible",
        tab: "diagram",
      });
    }
    applyTaskTypeDecor(m, "editor");
    applyBottleneckDecor(m, "editor");
    applyInterviewDecor(m, "editor");
    applyUserNotesDecor(m, "editor");
  }

  function getRecoveryXmlCandidate() {
    return String(
      bpmnStoreRef.current?.getState?.()?.xml
      || xml
      || xmlDraft
      || draftRef.current?.bpmn_xml
      || "",
    );
  }

  async function recoverByReimport(inst, xmlText, reason, cycleIndex = 0, guard = null) {
    const raw = String(xmlText || "");
    if (!raw.trim()) return false;
    const sid = String(sessionId || "");
    if (guard && !guard("recover2.start", inst)) return false;
    if (inst === modelerRef.current) {
      if (guard && !guard("recover2.modeler.before_load", inst)) return false;
      const runtime = ensureModelerRuntime();
      const loaded = await runtime.load(raw, { source: `${reason}:recover2` });
      if (guard && !guard("recover2.modeler.after_load", inst, { allowTokenDrift: true, syncToken: true })) {
        return false;
      }
      const status = runtime.getStatus();
      runtimeTokenRef.current = Number(status?.token || runtimeTokenRef.current || 0);
      modelerReadyRef.current = !!status?.ready && !!status?.defs;
      if (!loaded?.ok || loaded?.reason === "stale" || inst !== modelerRef.current) return false;
      lastModelerXmlHashRef.current = fnv1aHex(raw);
      await ensureCanvasVisibleAndFit(inst, "recover2.modeler", sid, {
        reason,
        tab: "diagram",
        token: runtimeTokenRef.current,
        allowFit: true,
        fitIfInvisible: true,
        suppressViewbox: suppressViewboxEvents,
        cycleIndex,
      });
      applyTaskTypeDecor(inst, "editor");
      applyBottleneckDecor(inst, "editor");
      applyInterviewDecor(inst, "editor");
      applyUserNotesDecor(inst, "editor");
      return true;
    }

    if (inst === viewerRef.current) {
      if (guard && !guard("recover2.viewer.before_load", inst)) return false;
      const token = runtimeTokenRef.current + 1;
      runtimeTokenRef.current = token;
      viewerReadyRef.current = false;
      await inst.importXML(raw);
      if (guard && !guard("recover2.viewer.after_load", inst, { allowTokenDrift: true, syncToken: true })) {
        return false;
      }
      if (token !== runtimeTokenRef.current || inst !== viewerRef.current) return false;
      viewerReadyRef.current = true;
      await ensureCanvasVisibleAndFit(inst, "recover2.viewer", sid, {
        reason,
        tab: "diagram",
        token: runtimeTokenRef.current,
        allowFit: true,
        fitIfInvisible: true,
        suppressViewbox: suppressViewboxEvents,
        cycleIndex,
      });
      applyTaskTypeDecor(inst, "viewer");
      applyBottleneckDecor(inst, "viewer");
      applyInterviewDecor(inst, "viewer");
      applyUserNotesDecor(inst, "viewer");
      return true;
    }

    return false;
  }

  async function recoverByHardReset(inst, xmlText, reason, cycleIndex = 0, guard = null) {
    const raw = String(xmlText || "");
    const sid = String(sessionId || "");
    if (guard && !guard("recover3.start", inst, { allowTokenDrift: true })) return false;
    if (inst === modelerRef.current) {
      if (guard && !guard("recover3.modeler.before_destroy", inst, { allowTokenDrift: true })) return false;
      try {
        modelerRuntimeRef.current?.destroy?.();
      } catch {
      }
      modelerRuntimeRef.current = null;
      modelerRef.current = null;
      modelerInitPromiseRef.current = null;
      modelerDecorBoundInstanceRef.current = null;
      modelerReadyRef.current = false;
      userViewportTouchedRef.current = false;
      try {
        if (editorEl.current) editorEl.current.innerHTML = "";
      } catch {
      }
      if (!raw.trim()) return false;
      const runtime = ensureModelerRuntime();
      const m = await ensureModeler();
      if (guard && !guard("recover3.modeler.after_init", m, { allowTokenDrift: true, syncToken: true })) return false;
      const loaded = await runtime.load(raw, { source: `${reason}:recover3` });
      if (guard && !guard("recover3.modeler.after_load", m, { allowTokenDrift: true, syncToken: true })) return false;
      const status = runtime.getStatus();
      runtimeTokenRef.current = Number(status?.token || runtimeTokenRef.current || 0);
      modelerReadyRef.current = !!status?.ready && !!status?.defs;
      if (!loaded?.ok || !m || m !== modelerRef.current) return false;
      lastModelerXmlHashRef.current = fnv1aHex(raw);
      await ensureCanvasVisibleAndFit(m, "recover3.modeler", sid, {
        reason,
        tab: "diagram",
        token: runtimeTokenRef.current,
        allowFit: true,
        fitIfInvisible: true,
        suppressViewbox: suppressViewboxEvents,
        cycleIndex,
      });
      applyTaskTypeDecor(m, "editor");
      applyBottleneckDecor(m, "editor");
      applyInterviewDecor(m, "editor");
      applyUserNotesDecor(m, "editor");
      return true;
    }

    if (inst === viewerRef.current) {
      if (guard && !guard("recover3.viewer.before_destroy", inst, { allowTokenDrift: true })) return false;
      try {
        viewerRef.current?.destroy?.();
      } catch {
      }
      viewerRef.current = null;
      viewerInitPromiseRef.current = null;
      viewerReadyRef.current = false;
      try {
        if (viewerEl.current) viewerEl.current.innerHTML = "";
      } catch {
      }
      if (!raw.trim()) return false;
      const v = await ensureViewer();
      if (guard && !guard("recover3.viewer.after_init", v, { allowTokenDrift: true, syncToken: true })) return false;
      const token = runtimeTokenRef.current + 1;
      runtimeTokenRef.current = token;
      await v.importXML(raw);
      if (guard && !guard("recover3.viewer.after_load", v, { allowTokenDrift: true, syncToken: true })) return false;
      if (token !== runtimeTokenRef.current || v !== viewerRef.current) return false;
      viewerReadyRef.current = true;
      await ensureCanvasVisibleAndFit(v, "recover3.viewer", sid, {
        reason,
        tab: "diagram",
        token: runtimeTokenRef.current,
        allowFit: true,
        fitIfInvisible: true,
        suppressViewbox: suppressViewboxEvents,
        cycleIndex,
      });
      applyTaskTypeDecor(v, "viewer");
      applyBottleneckDecor(v, "viewer");
      applyInterviewDecor(v, "viewer");
      applyUserNotesDecor(v, "viewer");
      return true;
    }

    return false;
  }

  async function ensureVisibleOnInstance(inst, options = {}) {
    if (!inst) return { ok: false, reason: "missing_instance" };
    const sid = String(activeSessionRef.current || sessionId || "");
    const tabName = String(options?.tab || (view === "xml" ? "xml" : "diagram"));
    const reason = String(options?.reason || "ensure_visible").trim() || "ensure_visible";
    const cycleIndex = Number(options?.cycleIndex || (++ensureVisibleCycleRef.current));
    const tokenState = { value: Number(runtimeTokenRef.current || 0) };
    const expectedSid = String(options?.expectedSid || sid || "").trim();
    const expectedEpoch = Number(options?.expectedEpoch || ensureEpochRef.current || 0);
    const expectedContainerKey = String(
      options?.containerKey
      || getInstanceMeta(inst)?.containerKey
      || "",
    ).trim();
    const instanceMeta = getInstanceMeta(inst);
    const requestedSid = String(sid || "-");
    const expectElements = options?.expectElements === true
      || String(getRecoveryXmlCandidate() || "").trim().length > 0;

    logEnsureTrace("start", {
      sid: requestedSid,
      requestedSid,
      expectedSid: expectedSid || "-",
      tab: tabName,
      reason,
      cycle: cycleIndex,
      token: Number(tokenState.value || 0),
      instanceId: Number(instanceMeta.id || 0),
      containerKey: String(instanceMeta.containerKey || "-"),
    });

    const guard = (phase, candidateInst, guardOptions = {}) => {
      const currentSid = String(activeSessionRef.current || "");
      const currentEpoch = Number(ensureEpochRef.current || 0);
      const activeInst = candidateInst || inst;
      const activeMeta = getInstanceMeta(activeInst);
      const currentToken = Number(runtimeTokenRef.current || 0);
      const allowTokenDrift = guardOptions?.allowTokenDrift === true;

      if (expectedEpoch && currentEpoch !== expectedEpoch) {
        logStaleGuard("epoch_mismatch", {
          phase,
          expectedEpoch,
          currentEpoch,
          expectedSid: expectedSid || "-",
          currentSid: currentSid || "-",
        });
        return false;
      }
      if (expectedSid && currentSid && expectedSid !== currentSid) {
        logStaleGuard("sid_mismatch", {
          phase,
          expectedSid,
          currentSid,
          expectedToken: Number(tokenState.value || 0),
          currentToken,
        });
        return false;
      }
      if (activeInst && activeInst !== modelerRef.current && activeInst !== viewerRef.current) {
        logStaleGuard("instance_mismatch", {
          phase,
          expectedSid: expectedSid || "-",
          currentSid: currentSid || "-",
          expectedInstanceId: Number(instanceMeta.id || 0),
          currentInstanceId: Number(activeMeta.id || 0),
        });
        return false;
      }
      if (expectedContainerKey && activeMeta.containerKey && expectedContainerKey !== activeMeta.containerKey) {
        logStaleGuard("container_mismatch", {
          phase,
          expectedContainerKey,
          currentContainerKey: String(activeMeta.containerKey || "-"),
          expectedSid: expectedSid || "-",
          currentSid: currentSid || "-",
        });
        return false;
      }
      if (!allowTokenDrift && Number(tokenState.value || 0) !== currentToken) {
        logStaleGuard("token_mismatch", {
          phase,
          expectedToken: Number(tokenState.value || 0),
          currentToken,
          expectedSid: expectedSid || "-",
          currentSid: currentSid || "-",
        });
        return false;
      }
      if (guardOptions?.syncToken === true) {
        tokenState.value = currentToken;
      }
      return true;
    };

    const existingPromise = ensureVisiblePromiseRef.current;
    if (existingPromise && options?.force !== true) {
      return await existingPromise;
    }

    const run = (async () => {
      if (!guard("ensure.enter", inst)) {
        return { ok: false, reason: "skip_stale", step: 0 };
      }
      const enter = probeCanvas(inst, "after_tab_show", {
        sid,
        tab: tabName,
        token: Number(tokenState.value || 0),
        reason,
        cycleIndex,
        expectElements,
      });
      if (!enter.invisible) {
        logEnsureTrace("done", {
          sid: requestedSid,
          expectedSid: expectedSid || "-",
          tab: tabName,
          step: 0,
          result: "ok",
          cycle: cycleIndex,
        });
        return { ok: true, recovered: false, step: 0, probe: enter };
      }

      const layoutReady = await waitForNonZeroRect(
        () => inst?.get?.("canvas")?._container || null,
        {
          sid: requestedSid,
          token: Number(tokenState.value || 0),
          reason: `${reason}:ensure_visible_layout_gate`,
          timeoutMs: 3000,
        },
      );
      if (!layoutReady.ok) {
        return { ok: false, reason: "layout_not_ready", step: 0, probe: enter };
      }

      try {
        if (!guard("recover1.before_resize", inst)) return { ok: false, reason: "skip_stale", step: 1 };
        const canvas = inst.get("canvas");
        await waitAnimationFrame();
        if (!guard("recover1.after_raf", inst)) return { ok: false, reason: "skip_stale", step: 1 };
        suppressViewboxEvents(1);
        try {
          canvas?.resized?.();
        } finally {
          suppressViewboxEvents(-1);
        }
        await waitAnimationFrame();
        if (!guard("recover1.after_resize", inst)) return { ok: false, reason: "skip_stale", step: 1 };
      } catch {
      }
      let probeAfterRecover1 = probeCanvas(inst, "after_recover1", {
        sid,
        tab: tabName,
        token: Number(tokenState.value || 0),
        reason,
        cycleIndex,
        expectElements,
      });
      if (probeAfterRecover1.invisible) {
        if (!guard("recover1.before_fit", inst)) return { ok: false, reason: "skip_stale", step: 1 };
        await safeFit(inst, {
          reason: `${reason}:recover1_fit`,
          tab: tabName,
          sid,
          token: Number(tokenState.value || 0),
          suppressViewbox: suppressViewboxEvents,
        });
        await waitAnimationFrame();
        if (!guard("recover1.after_fit", inst)) return { ok: false, reason: "skip_stale", step: 1 };
        probeAfterRecover1 = probeCanvas(inst, "after_recover1_fit", {
          sid,
          tab: tabName,
          token: Number(tokenState.value || 0),
          reason,
          cycleIndex,
          expectElements,
        });
      }
      if (!probeAfterRecover1.invisible) {
        logEnsureTrace("done", {
          sid: requestedSid,
          expectedSid: expectedSid || "-",
          tab: tabName,
          step: 1,
          result: "ok",
          cycle: cycleIndex,
        });
        return { ok: true, recovered: true, step: 1, probe: probeAfterRecover1 };
      }

      const xmlForRecovery = getRecoveryXmlCandidate();
      if (xmlForRecovery.trim()) {
        const reimported = await recoverByReimport(inst, xmlForRecovery, reason, cycleIndex, guard);
        if (reimported) {
          const currentInst = inst === modelerRef.current ? modelerRef.current : viewerRef.current;
          const probeAfterRecover2 = probeCanvas(currentInst || inst, "after_recover2", {
            sid,
            tab: tabName,
            token: Number(runtimeTokenRef.current || tokenState.value || 0),
            reason,
            cycleIndex,
            expectElements,
          });
          if (!probeAfterRecover2.invisible) {
            logEnsureTrace("done", {
              sid: requestedSid,
              expectedSid: expectedSid || "-",
              tab: tabName,
              step: 2,
              result: "ok",
              cycle: cycleIndex,
            });
            return { ok: true, recovered: true, step: 2, probe: probeAfterRecover2 };
          }
        }
      }

      const hardResetOk = await recoverByHardReset(inst, xmlForRecovery, reason, cycleIndex, guard);
      const currentInst = inst === modelerRef.current ? modelerRef.current : viewerRef.current;
      const probeAfterRecover3 = probeCanvas(currentInst || inst, "after_recover3", {
        sid,
        tab: tabName,
        token: Number(runtimeTokenRef.current || tokenState.value || 0),
        reason,
        cycleIndex,
        expectElements,
      });
      if (hardResetOk && !probeAfterRecover3.invisible) {
        logEnsureTrace("done", {
          sid: requestedSid,
          expectedSid: expectedSid || "-",
          tab: tabName,
          step: 3,
          result: "ok",
          cycle: cycleIndex,
        });
        return { ok: true, recovered: true, step: 3, probe: probeAfterRecover3 };
      }
      logEnsureTrace("done", {
        sid: requestedSid,
        expectedSid: expectedSid || "-",
        tab: tabName,
        step: 3,
        result: hardResetOk ? "failed_visible" : "failed_reset",
        cycle: cycleIndex,
      });
      return {
        ok: false,
        recovered: hardResetOk,
        step: 3,
        reason: "still_invisible",
        probe: probeAfterRecover3,
      };
    })();

    ensureVisiblePromiseRef.current = run;
    try {
      const result = await run;
      if (result?.reason === "skip_stale") {
        logEnsureTrace("done", {
          sid: requestedSid,
          expectedSid: expectedSid || "-",
          tab: tabName,
          step: Number(result?.step || 0),
          result: "skip_stale",
          cycle: cycleIndex,
        });
      }
      return result;
    } finally {
      if (ensureVisiblePromiseRef.current === run) {
        ensureVisiblePromiseRef.current = null;
      }
    }
  }

  async function persistXmlSnapshot(rawXml, hintBase = "backend") {
    const sid = String(sessionId || "");
    if (!sid) return { ok: false, error: "missing session id" };
    const out = String(rawXml || "");
    const rev = Number(bpmnStoreRef.current?.getState?.()?.rev || 0);
    const startedAt = Date.now();
    const persistStartCount = bumpSaveCounter("persist_started");
    traceProcess("bpmn.persist_xml_snapshot_start", {
      sid,
      hint: hintBase,
      rev,
      xml_len: out.length,
    });
    logBpmnTrace("SAVE_PERSIST_STARTED", out, {
      sid,
      source: hintBase,
      rev,
      count: persistStartCount,
    });
    logBpmnTrace("persist.put.before", out, { sid, hint: hintBase, rev });
    const r = await ensureBpmnPersistence().saveRaw(sid, out, rev, hintBase);
    traceProcess("bpmn.persist_xml_snapshot_backend", {
      sid,
      hint: hintBase,
      ok: !!r.ok,
      rev,
      xml_len: out.length,
    });
    if (!r.ok) {
      const msg = String(r.error || "Не удалось сохранить BPMN на backend");
      setErr(msg);
      const persistFailCount = bumpSaveCounter("persist_fail");
      logBpmnTrace("SAVE_PERSIST_FAIL", out, {
        sid,
        source: hintBase,
        status: Number(r.status || 0),
        rev,
        ms: Date.now() - startedAt,
        count: persistFailCount,
      });
      return { ok: false, error: msg };
    }
    setErr("");
    logBpmnTrace("persist.put.done", out, { sid, hint: hintBase, status: r.status || 200 });
    const persistDoneCount = bumpSaveCounter("persist_done");
    logBpmnTrace("SAVE_PERSIST_DONE", out, {
      sid,
      source: hintBase,
      status: Number(r.status || 200),
      rev: Number(r.storedRev || rev),
      ms: Date.now() - startedAt,
      count: persistDoneCount,
    });
    applyXmlSnapshot(out, `${hintBase}(saved)`);
    return { ok: true, xml: out, source: `${hintBase}(saved)` };
  }

  async function saveLocalFromModeler(options = {}) {
    const force = options?.force === true;
    const source = String(options?.source || (force ? "tab_switch" : "autosave")).trim() || "autosave";
    const trigger = String(options?.trigger || "").trim() || "manual";
    const sid = String(sessionId || "");
    if (!sid) return { ok: false, error: "missing session id" };
    ensureBpmnStore();
    const runtime = ensureModelerRuntime();
    const coordinator = ensureBpmnCoordinator();
    const fallbackXml = String(
      bpmnStoreRef.current?.getState?.()?.xml
      || xml
      || xmlDraft
      || draft?.bpmn_xml
      || "",
    );

    try {
      if (force) {
        await ensureModeler();
      } else {
        const status = runtime.getStatus();
        runtimeTokenRef.current = Number(status?.token || runtimeTokenRef.current || 0);
      }

      const flushed = await coordinator.flushSave(source, { force, trigger });
      const nextState = bpmnStoreRef.current?.getState?.() || {};
      const out = String(nextState.xml || fallbackXml || "");

      if (!flushed?.ok) {
        if (force && out.trim()) {
          return { ok: true, xml: out, source: "fallback" };
        }
        return { ok: false, error: String(flushed?.error || "saveXML failed"), xml: out };
      }

      if (flushed.pending) {
        return { ok: true, pending: true, xml: out, source: "pending" };
      }

      traceProcess("bpmn.save_modeler_xml", {
        sid,
        xml_len: out.length,
      });
      const hint = isLocalSessionId(sid) ? "local(saved)" : "backend(saved)";
      applyXmlSnapshot(out, hint);
      logBpmnTrace("saveXML.modeler.after", out, { sid, trigger });
      return { ok: true, xml: out, source: hint };
    } catch (e) {
      const msg = String(e?.message || e || "saveXML failed");
      if (shouldLogBpmnTrace()) {
        // eslint-disable-next-line no-console
        console.error(`[BPMN] saveXML.modeler.error ${msg}\n${String(e?.stack || "")}`);
      }
      if (fallbackXml.trim()) {
        if (force) {
          const rev = Number(bpmnStoreRef.current?.getState?.()?.rev || 0);
          const persisted = await ensureBpmnPersistence().saveRaw(sid, fallbackXml, rev, `${source}:catch_fallback`);
          if (!persisted.ok) return { ok: false, error: String(persisted.error || msg), xml: fallbackXml };
        }
        return { ok: true, xml: fallbackXml, source: "fallback" };
      }
      return { ok: false, error: msg || "saveXML failed" };
    }
  }

  async function saveXmlDraftText() {
    const raw = String(xmlDraft || "");
    const vErr = validateBpmnXmlText(raw);
    if (vErr) {
      setErr(vErr);
      logBpmnTrace("VALIDATION_FAIL", raw, {
        sid: String(sessionId || ""),
        source: "xml_save",
        error: vErr,
      });
      return { ok: false, error: vErr };
    }
    setXmlSaveBusy(true);
    try {
      return await persistXmlSnapshot(raw, "backend");
    } finally {
      setXmlSaveBusy(false);
    }
  }

  async function seedNew() {
    await renderNewDiagramInModeler();
    const runtime = ensureModelerRuntime();
    const xmlRes = await runtime.getXml({ format: true });
    if (xmlRes?.ok) {
      const seeded = String(xmlRes.xml || "");
      if (seeded.trim()) {
        applyXmlSnapshot(seeded, "local");
      }
    }
  }

  function clearLocalOnly() {
    const sid = String(sessionId || "");
    if (!sid) return;
    if (isLocalSessionId(sid)) {
      localStorage.removeItem(localKey(sid));
      setSrcHint("backend");
    }
  }

  useEffect(() => {
    const sid = String(sessionId || "");
    const prevSid = String(activeSessionRef.current || "");
    prevSessionRef.current = prevSid;
    if (shouldLogBpmnTrace()) {
      // eslint-disable-next-line no-console
      console.debug(`[SESSION] activate sid=${sid || "-"} prevSid=${prevSid || "-"} tab=${view === "xml" ? "xml" : "diagram"}`);
    }
    activeSessionRef.current = sid;
    ensureEpochRef.current += 1;
    destroyRuntime();
    setErr("");
    const draftNow = asObject(draftRef.current);
    const draftSid = String(draftNow?.session_id || draftNow?.id || "").trim();
    const draftXml = sid && draftSid === sid ? String(draftNow?.bpmn_xml || "") : "";
    if (draftXml.trim()) {
      applyXmlSnapshot(draftXml, "draft_bootstrap");
      if (shouldLogBpmnTrace()) {
        // eslint-disable-next-line no-console
        console.debug(
          `[SESSION] bootstrap sid=${sid || "-"} source=draft_bootstrap len=${draftXml.length} hash=${fnv1aHex(draftXml)}`,
        );
      }
    } else {
      setSrcHint("");
      applyXmlSnapshot("");
      if (shouldLogBpmnTrace()) {
        // eslint-disable-next-line no-console
        console.debug(`[SESSION] bootstrap sid=${sid || "-"} source=empty len=0 hash=${fnv1aHex("")}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const sid = String(sessionId || "");
    activeSessionRef.current = sid;
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    if (!sid) return;
    loadFromBackend(sid, token, { reason: "session_reload" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    const runId = renderRunRef.current + 1;
    renderRunRef.current = runId;
    const expectedSid = String(sessionId || "");
    let staleLogged = false;

    const isStale = (phase = "") => {
      const sidNow = String(activeSessionRef.current || "");
      const sidMismatch = !!expectedSid && !!sidNow && sidNow !== expectedSid;
      const stale = cancelled || renderRunRef.current !== runId || sidMismatch;
      if (stale && !staleLogged && shouldLogBpmnTrace()) {
        staleLogged = true;
        // eslint-disable-next-line no-console
        console.debug(
          `[RENDER] stale_skip sid=${expectedSid || "-"} currentSid=${sidNow || "-"} runId=${runId} activeRun=${Number(renderRunRef.current || 0)} phase=${String(phase || "-")}`,
        );
      }
      return stale;
    };

    async function run() {
      if (!sessionId || isStale("start")) return;
      const sid = String(sessionId || "");
      const draftXml = String(draft?.bpmn_xml || "");
      const resolvedXml = (xml && xml.trim()) ? xml : draftXml;
      const resolvedHash = fnv1aHex(resolvedXml);
      const storeEvent = lastStoreEventRef.current || {};
      try {
        if (view === "diagram") {
          if (!resolvedXml || !resolvedXml.trim() || isStale("diagram.no_xml")) return;
          if ((!xml || !xml.trim()) && draftXml.trim()) {
            applyXmlSnapshot(draftXml, srcHint || "draft");
          }
          if (isStale("diagram.before_render")) return;
          await renderViewer(resolvedXml);
          if (isStale("diagram.after_render")) return;
        }
        if (view === "editor") {
          const localSession = isLocalSessionId(sid);
          if (!resolvedXml || !resolvedXml.trim()) {
            // Wait until load source is resolved to avoid creating a transient empty diagram
            // before backend/draft XML arrives.
            if (!srcHint || isStale("editor.no_xml")) return;
            if (localSession) {
              if (isStale("editor.create_local.before")) return;
              await renderNewDiagramInModeler();
              if (isStale("editor.create_local.after")) return;
              return;
            }
            if (isStale("editor.create_remote.before")) return;
            await renderNewDiagramInModeler();
            if (isStale("editor.create_remote.after")) return;
            return;
          }
          if ((!xml || !xml.trim()) && draftXml.trim()) {
            applyXmlSnapshot(draftXml, srcHint || "draft");
          }
          const modelerReady = !!modelerRef.current && !!modelerReadyRef.current && hasDefinitionsLoaded(modelerRef.current);
          const source = String(storeEvent.source || "");
          const reason = String(storeEvent.reason || "");
          const isInternalModelerUpdate = reason === "setXml"
            && (
              source === "runtime_change"
              || source === "flush_save"
              || source === "backend(saved)"
              || source === "local(saved)"
            );
          if (modelerReady && isInternalModelerUpdate) {
            lastModelerXmlHashRef.current = resolvedHash;
            if (isStale("editor.keep_view.before")) return;
            await ensureCanvasVisibleAndFit(modelerRef.current, "renderModeler.keep_view", sid, {
              reason: "editor_internal_update",
              tab: "diagram",
              token: runtimeTokenRef.current,
              allowFit: false,
              suppressViewbox: suppressViewboxEvents,
            });
            if (isStale("editor.keep_view.after")) return;
            return;
          }
          if (modelerReady && lastModelerXmlHashRef.current === resolvedHash) {
            if (isStale("editor.same_hash.before")) return;
            await ensureCanvasVisibleAndFit(modelerRef.current, "renderModeler.same_hash", sid, {
              reason: "editor_same_hash",
              tab: "diagram",
              token: runtimeTokenRef.current,
              allowFit: false,
              suppressViewbox: suppressViewboxEvents,
            });
            if (isStale("editor.same_hash.after")) return;
            return;
          }
          userViewportTouchedRef.current = false;
          if (isStale("editor.render.before")) return;
          await renderModeler(resolvedXml);
          if (isStale("editor.render.after")) return;
        }
      } catch (e) {
        if (isStale("catch")) return;
        if (shouldLogBpmnTrace()) {
          // eslint-disable-next-line no-console
          console.error(`[BPMN] render.error ${String(e?.message || e)}\n${String(e?.stack || "")}`);
        }
        if (!cancelled) setErr(String(e?.message || e));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, xml, sessionId, draft?.bpmn_xml, draft?.title, srcHint]);

  useEffect(() => {
    const fromDraft = String(draft?.bpmn_xml || "");
    if (xmlDirty) return;
    if ((xml && xml.trim()) || !fromDraft.trim()) return;
    applyXmlSnapshot(fromDraft, srcHint || "draft");
  }, [draft?.bpmn_xml, xml, srcHint, xmlDirty]);

  useEffect(() => {
    const prev = String(prevViewRef.current || "");
    prevViewRef.current = view;
    if ((view === "editor" || view === "diagram") && prev !== "editor" && prev !== "diagram") {
      const storeXml = String(bpmnStoreRef.current?.getState?.()?.xml || "");
      const draftXml = String(draftRef.current?.bpmn_xml || "");
      const runtimeStatus = modelerRuntimeRef.current?.getStatus?.() || {};
      const xmlShown = storeXml.trim() ? storeXml : draftXml;
      const inst = modelerRef.current || modelerRuntimeRef.current?.getInstance?.() || null;
      const registryCount = Array.isArray(inst?.get?.("elementRegistry")?.getAll?.())
        ? inst.get("elementRegistry").getAll().length
        : 0;
      if (shouldLogBpmnTrace()) {
        // eslint-disable-next-line no-console
        console.debug(
          `[DIAGRAM_ENTER] sid=${String(sessionId || "-")} source=view_enter `
          + `bpmnLen=${xmlShown.length} bpmnHash=${fnv1aHex(xmlShown)} regCount=${registryCount} `
          + `runtimeReadyAtEnter=${runtimeStatus?.ready && runtimeStatus?.defs ? 1 : 0}`,
        );
      }
    }
    if (view !== "xml" || prev === "xml") return;

    const storeXml = String(bpmnStoreRef.current?.getState?.()?.xml || "");
    const draftXml = String(draftRef.current?.bpmn_xml || "");
    const currentXmlDraft = String(xmlDraft || "");
    const fallbackXml = currentXmlDraft.trim()
      ? currentXmlDraft
      : (storeXml.trim() ? storeXml : (xml.trim() ? xml : draftXml));
    const runtimeStatus = modelerRuntimeRef.current?.getStatus?.() || {};

    let didInit = 0;
    if (!currentXmlDraft.trim() && fallbackXml.trim()) {
      didInit = 1;
      setXmlDraft(fallbackXml);
      setXmlDirty(false);
      if (shouldLogBpmnTrace()) {
        // eslint-disable-next-line no-console
        console.debug(
          `[XMLDRAFT_SET] sid=${String(sessionId || "-")} source=enter_xml_init len=${fallbackXml.length} hash=${fnv1aHex(fallbackXml)} dirty=0`,
        );
      }
    }

    if (shouldLogBpmnTrace()) {
      const shownXml = currentXmlDraft.trim() ? currentXmlDraft : fallbackXml;
      const shownSource = currentXmlDraft.trim()
        ? "xmlDraft"
        : (storeXml.trim() ? "store" : (xml.trim() ? "xml_state" : (draftXml.trim() ? "draft" : "empty")));
      // eslint-disable-next-line no-console
      console.debug(
        `[XML_TAB_ENTER] sid=${String(sessionId || "-")} xmlShownSource=${shownSource} xmlShownLen=${shownXml.length} `
        + `xmlShownHash=${fnv1aHex(shownXml)} didWeInitXmlDraftFromDraft=${didInit} didWeCallSaveFromModelerBeforeShow=1 `
        + `runtimeReadyAtEnter=${runtimeStatus?.ready && runtimeStatus?.defs ? 1 : 0}`,
      );
    }
  }, [view, xmlDraft, xml, sessionId]);

  useEffect(() => {
    applyInterviewDecor(viewerRef.current, "viewer");
    applyInterviewDecor(modelerRef.current, "editor");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.interview, draft?.nodes]);

  useEffect(() => {
    applyUserNotesDecor(viewerRef.current, "viewer");
    applyUserNotesDecor(modelerRef.current, "editor");
    const kind = view === "editor" ? "editor" : "viewer";
    const inst = kind === "editor" ? modelerRef.current : viewerRef.current;
    const selectedId = String(selectedMarkerStateRef.current[kind] || "");
    if (!inst || !selectedId) return;
    try {
      const registry = inst.get("elementRegistry");
      const el = registry.get(selectedId);
      emitElementSelection(el, `${kind}.notes_refresh`);
      syncAiQuestionPanelWithSelection(inst, kind, el, `${kind}.notes_refresh`);
    } catch {
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.notes_by_element, draft?.notesByElementId, view]);

  useEffect(() => {
    return () => {
      destroyRuntime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => {
    const getActiveInstance = () => (view === "editor" ? modelerRef.current : viewerRef.current);
    const getActiveLoader = () => (view === "editor" ? ensureModeler() : ensureViewer());
    const isInstanceReady = (inst) => {
      if (!inst) return false;
      if (inst === modelerRef.current) {
        return !!modelerReadyRef.current && hasDefinitionsLoaded(inst);
      }
      if (inst === viewerRef.current) {
        return !!viewerReadyRef.current && hasDefinitionsLoaded(inst);
      }
      return hasDefinitionsLoaded(inst);
    };
    const runOnActiveInstance = (fn) => {
      const inst = getActiveInstance();
      if (inst && isInstanceReady(inst)) {
        fn(inst);
        return;
      }
      if (inst && !isInstanceReady(inst)) return;
      const loader = getActiveLoader();
      loader
        .then((ready) => {
          if (ready && isInstanceReady(ready)) fn(ready);
        })
        .catch(() => {
          // skip
        });
    };

    return {
      zoomIn: () => {
        if (view === "editor" && modelerRuntimeRef.current?.zoomIn?.()) return;
        runOnActiveInstance((inst) => {
          const canvas = inst.get("canvas");
          const z = canvas.zoom();
          canvas.zoom(Number.isFinite(z) ? z + 0.2 : 1.2);
        });
      },
      zoomOut: () => {
        if (view === "editor" && modelerRuntimeRef.current?.zoomOut?.()) return;
        runOnActiveInstance((inst) => {
          const canvas = inst.get("canvas");
          const z = canvas.zoom();
          canvas.zoom(Number.isFinite(z) ? Math.max(z - 0.2, 0.2) : 0.8);
        });
      },
      fit: () => {
        if (view === "editor" && modelerRuntimeRef.current?.fit?.()) {
          userViewportTouchedRef.current = false;
          return;
        }
        runOnActiveInstance((inst) => {
          userViewportTouchedRef.current = false;
          void safeFit(inst, {
            reason: "manual_fit",
            tab: view === "xml" ? "xml" : "diagram",
            sid: String(sessionId || ""),
            token: runtimeTokenRef.current,
            suppressViewbox: suppressViewboxEvents,
          });
        });
      },
      refreshViewport: (options = {}) => {
        runOnActiveInstance((inst) => {
          void ensureVisibleOnInstance(inst, {
            reason: String(options?.reason || "tab_switch"),
            tab: view === "xml" ? "xml" : "diagram",
            cycleIndex: Number(options?.cycleIndex || 0),
            expectedSid: String(options?.expectedSid || activeSessionRef.current || ""),
          });
        });
      },
      ensureVisible: (options = {}) => {
        const reason = String(options?.reason || "ensure_visible");
        const tabName = view === "xml" ? "xml" : "diagram";
        const cycleIndex = Number(options?.cycleIndex || 0);
        const force = options?.force === true;
        return (async () => {
          const activeInst = getActiveInstance();
          if (activeInst && isInstanceReady(activeInst)) {
            return await ensureVisibleOnInstance(activeInst, {
              reason,
              tab: tabName,
              cycleIndex,
              force,
              expectedSid: String(options?.expectedSid || activeSessionRef.current || ""),
            });
          }
          let loaded = null;
          try {
            loaded = await getActiveLoader();
          } catch {
            loaded = null;
          }
          if (!loaded || !isInstanceReady(loaded)) {
            return { ok: false, reason: "not_ready" };
          }
          return await ensureVisibleOnInstance(loaded, {
            reason,
            tab: tabName,
            cycleIndex,
            force,
            expectedSid: String(options?.expectedSid || activeSessionRef.current || ""),
          });
        })();
      },
      whenReady: async (options = {}) => {
        const timeoutMsRaw = Number(options?.timeoutMs ?? 1800);
        const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 1800;
        const expectedSid = String(options?.expectedSid || "").trim();
        const sidNow = String(activeSessionRef.current || sessionId || "");
        const expectedToken = Number(runtimeTokenRef.current || 0);
        if (shouldLogBpmnTrace()) {
          // eslint-disable-next-line no-console
          console.debug(
            `[WHEN_READY] wait sid=${sidNow || "-"} expectedSid=${expectedSid || "-"} token=${expectedToken} expectedToken=${expectedToken} timeoutMs=${timeoutMs}`,
          );
        }
        const started = Date.now();
        while (Date.now() - started <= timeoutMs) {
          if (expectedSid && expectedSid !== String(activeSessionRef.current || "")) {
            return false;
          }
          const runtime = modelerRuntimeRef.current;
          const status = runtime?.getStatus?.() || {};
          const inst = modelerRef.current;
          if (inst && status?.ready && status?.defs) {
            if (shouldLogBpmnTrace()) {
              // eslint-disable-next-line no-console
              console.debug(
                `[WHEN_READY] resolve sid=${String(activeSessionRef.current || sessionId || "-")} token=${Number(status?.token || 0)} `
                + `reason=${status?.reason === "create.done" ? "createDiagram" : "import"}`,
              );
            }
            return true;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 40));
        }
        if (shouldLogBpmnTrace()) {
          const status = modelerRuntimeRef.current?.getStatus?.() || {};
          const inst = modelerRef.current;
          const rect = inst?.get?.("canvas")?._container?.getBoundingClientRect?.() || { width: 0, height: 0 };
          // eslint-disable-next-line no-console
          console.debug(
            `[WHEN_READY] timeout sid=${String(sessionId || "-")} token=${Number(status?.token || 0)} expectedSid=${expectedSid || "-"} `
            + `state ready=${status?.ready ? 1 : 0} defs=${status?.defs ? 1 : 0} hasInstance=${inst ? 1 : 0} `
            + `rect=${Math.round(Number(rect.width || 0))}x${Math.round(Number(rect.height || 0))}`,
          );
        }
        return false;
      },
      seedFromActors: () => seedNew(),
      saveLocal: (options) => saveLocalFromModeler(options),
      isFlushing: () => !!bpmnCoordinatorRef.current?.isFlushing?.(),
      saveXmlDraft: () => saveXmlDraftText(),
      hasXmlDraftChanges: () => !!xmlDirty,
      getXmlDraft: () => String(xmlDraft || ""),
      resetBackend: () => {
        const sid = String(sessionId || "");
        if (!sid) return;
        const token = loadTokenRef.current + 1;
        loadTokenRef.current = token;
        loadFromBackend(sid, token, { forceRemote: true, reason: "manual_reset_backend" });
      },
      clearLocal: () => {
        const sid = String(sessionId || "");
        if (!sid) return;
        if (isLocalSessionId(sid)) {
          clearLocalOnly();
          const token = loadTokenRef.current + 1;
          loadTokenRef.current = token;
          loadFromBackend(sid, token, { forceRemote: true, reason: "clear_local" });
          return;
        }
        (async () => {
          const r = await apiDeleteBpmnXml(sid);
          if (!r.ok) {
            setErr(String(r.error || "Не удалось очистить BPMN на backend"));
            return;
          }
          setErr("");
          const token = loadTokenRef.current + 1;
          loadTokenRef.current = token;
          loadFromBackend(sid, token, { forceRemote: true, reason: "clear_backend" });
        })();
      },
      setBottlenecks: (items) => {
        bottlenecksRef.current = asArray(items);
        applyBottleneckDecor(viewerRef.current, "viewer");
        applyBottleneckDecor(modelerRef.current, "editor");
      },
      clearBottlenecks: () => {
        bottlenecksRef.current = [];
        clearBottleneckDecor(viewerRef.current, "viewer");
        clearBottleneckDecor(modelerRef.current, "editor");
      },
      focusNode: (nodeId) => {
        const nid = String(nodeId || "").trim();
        if (!nid) return false;
        if (view === "editor") {
          const direct = modelerRuntimeRef.current?.focus?.(nid);
          if (direct) return true;
        }
        const viewerOk = focusNodeOnInstance(viewerRef.current, "viewer", nid);
        const editorOk = focusNodeOnInstance(modelerRef.current, "editor", nid);
        return viewerOk || editorOk;
      },
      importXmlText: async (xmlText) => {
        const raw = String(xmlText || "");
        if (!raw.trim()) return false;
        const vErr = validateBpmnXmlText(raw);
        if (vErr) {
          setErr(`Импорт BPMN не удался: ${vErr}`);
          logBpmnTrace("VALIDATION_FAIL", raw, {
            sid: String(sessionId || ""),
            source: "xml_import",
            error: vErr,
          });
          return false;
        }

        const saved = await persistXmlSnapshot(raw, "backend");
        if (!saved.ok) {
          setErr(`Импорт BPMN не удался: ${String(saved.error || "не удалось сохранить на backend")}`);
          return false;
        }

        try {
          if (view === "editor") {
            await renderModeler(raw);
          }
          if (view === "diagram") {
            await renderViewer(raw);
          }
          return true;
        } catch (e) {
          setErr(`Импорт BPMN не удался: ${String(e?.message || e)}`);
          return false;
        }
      },
    };
  });

  return (
    <div className="bpmnStage">
      {err ? (
        <div className="badge err" style={{ marginBottom: 10 }}>
          {err}
        </div>
      ) : null}

      <div className={view === "xml" ? "h-full min-h-0" : "hidden"}>
        <XmlView
          xmlDraft={xmlDraft}
          xmlDirty={xmlDirty}
          saveBusy={xmlSaveBusy}
          onChange={updateXmlDraft}
          onSave={saveXmlDraftText}
          onReset={() => applyXmlSnapshot(xml, srcHint || "backend")}
        />
      </div>

      <div className={view === "xml" ? "bpmnStack hidden" : "bpmnStack"}>
        <div
          className={"bpmnLayer bpmnLayer--diagram " + (view === "diagram" ? "on" : "off")}
          style={{ position: "absolute", inset: 0, display: view === "diagram" ? "block" : "none" }}
        >
          <div className="bpmnCanvas" ref={viewerEl} style={{ width: "100%", height: "100%" }} />
        </div>
        <div
          className={"bpmnLayer bpmnLayer--editor " + (view === "editor" ? "on" : "off")}
          style={{ position: "absolute", inset: 0, display: view === "editor" ? "block" : "none" }}
        >
          <div className="bpmnCanvas" ref={editorEl} style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
    </div>
  );
});

export default BpmnStage;
