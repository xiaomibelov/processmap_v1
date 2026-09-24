// Персистентный элементный provenance TO BE (fix/tobe-element-provenance-persistence-v1).
//
// Канал 1 (этот модуль, BPMN XML): pm:Trace в extensionElements элемента —
//   <bpmn:extensionElements>
//     <pm:trace fate="transformed_to" rule_id="R01_move">
//       <pm:derived_from>AsIs_1</pm:derived_from>
//       <pm:derived_from>AsIs_2</pm:derived_from>
//     </pm:trace>
//   </bpmn:extensionElements>
// derived_from — массив id AS IS (consolidated N→1: один TO BE-элемент из
// нескольких AS IS). pm:* дескриптор зарегистрирован в wiring (bpmnWiring.js),
// поэтому pm:Trace переживает save/reload моделлером (как pm:RobotMeta).
//
// Канал 2 (sidecar): buildProvenanceSidecar — полный снапшот trace_map
// (класс removed: удалённых элементов нет в XML по определении) в meta сессии.
import { BpmnModdle } from "bpmn-moddle";

import pmModdleDescriptor from "../../process/robotmeta/pmModdleDescriptor.js";
import camundaModdleDescriptor from "../../process/camunda/camundaModdleDescriptor.js";
import zeebeModdleDescriptor from "../../process/camunda/zeebeModdleDescriptor.js";

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value[Symbol.iterator] === "function") {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }
  return [];
}

function asText(value) {
  return String(value ?? "").trim();
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
}

// trace_map (transformation/pipeline.py): element_id = AS IS-элемент,
// draft_node_ids = TO BE-узлы, произведённые из него. Инверсия: TO BE id ->
// { derivedFrom: [AS IS ids] (порядок следования в trace_map),
//   sources: [decision_sources parallel к derivedFrom; "" если source нет],
//   fate, ruleId }.
export function buildProvenanceByTobeId(traceMapRaw) {
  const out = {};
  for (const tr of asArray(traceMapRaw)) {
    const asIsId = asText(tr?.element_id);
    if (!asIsId) continue;
    const draftNodeIds = Array.isArray(tr?.draft_node_ids) ? tr.draft_node_ids : [];
    const tobeIds = draftNodeIds.map(asText).filter(Boolean);
    for (const tobeId of tobeIds) {
      const entry = out[tobeId] || (out[tobeId] = { derivedFrom: [], sources: [], fate: "", ruleId: "" });
      if (!entry.derivedFrom.includes(asIsId)) {
        entry.derivedFrom.push(asIsId);
        entry.sources.push(asText(tr?.source));
      }
      // consolidated N→1: судьбу/правило берём от первого непустого источника
      if (!entry.fate) entry.fate = asText(tr?.fate);
      if (!entry.ruleId) entry.ruleId = asText(tr?.rule_id);
    }
  }
  return out;
}

// Sidecar-снапшот полного trace_map для bpmn_meta сессии (канал 2).
export function buildProvenanceSidecar(traceMapRaw) {
  const traceMap = cloneJson(asArray(traceMapRaw)) || [];
  return { source: "transform_asis", trace_map: traceMap };
}

function createModdle() {
  return new BpmnModdle({
    pm: pmModdleDescriptor,
    camunda: camundaModdleDescriptor,
    zeebe: zeebeModdleDescriptor,
  });
}

function eachFlowElement(container, visit) {
  for (const el of asArray(container?.get?.("flowElements"))) {
    if (!el) continue;
    visit(el);
    if (String(el.$type || "") === "bpmn:SubProcess") eachFlowElement(el, visit);
  }
}

function eachProcessElement(definitions, visit) {
  for (const root of asArray(definitions?.get?.("rootElements"))) {
    if (String(root?.$type || "") === "bpmn:Process") eachFlowElement(root, visit);
  }
}

// Заменяет существующий pm:Trace элемента (идемпотентность повторного встраивания),
// чужие extensionElements (camunda:properties, pm:RobotMeta и т.п.) не трогает.
function upsertTraceExtension(moddle, bo, prov) {
  const ext = bo.get("extensionElements") || moddle.create("bpmn:ExtensionElements", { values: [] });
  const values = asArray(ext.get("values")).filter((v) => String(v?.$type || "") !== "pm:Trace");
  const attrs = { derived_from: prov.derivedFrom.slice() };
  if (Array.isArray(prov.sources) && prov.sources.some(Boolean)) {
    attrs.derived_from_source = prov.sources.slice();
  }
  if (prov.fate) attrs.fate = prov.fate;
  if (prov.ruleId) attrs.rule_id = prov.ruleId;
  values.push(moddle.create("pm:Trace", attrs));
  ext.set("values", values);
  bo.set("extensionElements", ext);
}

// Встраивает provenance в XML до отправки на backend (канал 1).
export async function embedProvenanceIntoBpmnXml(xml, traceMapRaw) {
  const raw = String(xml || "").trim();
  if (!raw) return raw;
  const provenance = buildProvenanceByTobeId(traceMapRaw);
  if (!Object.keys(provenance).length) return raw;
  const moddle = createModdle();
  const { rootElement } = await moddle.fromXML(raw, "bpmn:Definitions");
  eachProcessElement(rootElement, (bo) => {
    const prov = provenance[String(bo?.id || "")];
    if (prov) upsertTraceExtension(moddle, bo, prov);
  });
  const result = await moddle.toXML(rootElement, { format: true });
  return result.xml;
}

// Чтение provenance из XML (reload-сценарий).
export async function extractProvenanceFromBpmnXml(xml) {
  const out = {};
  const raw = String(xml || "").trim();
  if (!raw) return out;
  const moddle = createModdle();
  const { rootElement } = await moddle.fromXML(raw, "bpmn:Definitions");
  eachProcessElement(rootElement, (bo) => {
    const id = String(bo?.id || "");
    if (!id) return;
    const values = asArray(bo.get?.("extensionElements")?.get?.("values"));
    const trace = values.find((v) => String(v?.$type || "") === "pm:Trace");
    if (!trace) return;
    const derivedFrom = asArray(trace.get?.("derived_from")).map(String);
    out[id] = {
      derived_from: derivedFrom,
      // старые XML без derived_from_source: выравниваем пустыми строками
      derived_from_source: derivedFrom.length
        ? derivedFrom.map((_, i) => String(asArray(trace.get?.("derived_from_source"))[i] ?? ""))
        : [],
      fate: String(trace.get?.("fate") || ""),
      rule_id: String(trace.get?.("rule_id") || ""),
    };
  });
  return out;
}
