// Двухканальный индекс происхождения TO BE (feature/tobe-overlay-visibility-provenance-v1, T6).
//
// Канал 1 (XML): pm:Trace в extensionElements TO BE-элемента —
//   extractProvenanceFromBpmnXml(xml) даёт { toBeId: { derived_from[],
//   derived_from_source[]?, fate, rule_id } }, derived_from = id AS IS
//   (consolidated N→1: один TO BE из нескольких AS IS = N записей в asIsIds).
// Канал 2 (sidecar): meta.provenance.sidecar — снапшот trace_map,
//   { source, trace_map: [{ element_id, fate, rule_id, draft_node_ids[] }] };
//   element_id здесь = toBeId (draft-узлы), draft_node_ids = AS IS id.
//   Покрывает класс removed (удалённых элементов нет в XML по определению).
//
// Merge: XML wins — если toBeId уже в индексе из XML, sidecar-запись
// пропускается. Входные объекты не мутируются. Потребители: T8–T11.

// Приводит значение к непустой строке; мусор (не строка/пусто) -> null.
function asCleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

// Строковый массив с очисткой: только непустые строки, дедуп с сохранением
// порядка (защита от мусора в XML/sidecar).
function asCleanIdArray(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const id = asCleanString(item);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

// Нормализует одну XML-запись provenance; вернуть null, если запись бесполезна
// (нет ни id-ключа, ни состава). fate/ruleId -> string | null.
function normalizeXmlEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    asIsIds: asCleanIdArray(entry.derived_from),
    fate: asCleanString(entry.fate),
    ruleId: asCleanString(entry.rule_id),
  };
}

// Нормализует одну sidecar-запись trace_map; element_id обязан быть
// непустой строкой (правило D8: записи с пустым element_id пропускаются).
function normalizeSidecarEntry(entry) {
  const toBeId = asCleanString(entry?.element_id);
  if (!toBeId) return null;
  return {
    toBeId,
    asIsIds: asCleanIdArray(entry.draft_node_ids),
    fate: asCleanString(entry.fate),
    ruleId: asCleanString(entry.rule_id),
  };
}

// Строит двухканальный индекс provenance.
//
// inputs:
//   xmlProvenance — результат extractProvenanceFromBpmnXml(xml)
//     (может быть null/пустой объект);
//   sidecar — meta.provenance.sidecar-форма
//     { source, trace_map: [{ element_id, fate, rule_id, draft_node_ids[] }] } | null.
// output: null | {
//   forward: Map<toBeId, { asIsIds: string[], fate: string|null, ruleId: string|null }>,
//   reverse: Map<asIsId, Array<{ toBeId, fate, ruleId }>>,
//   source: "xml" | "sidecar" | "both"   // какие каналы дали валидные данные
// }
export function buildProvenanceIndex(xmlProvenance, sidecar) {
  const forward = new Map();
  let xmlUsed = false;
  let sidecarUsed = false;

  // Канал 1 (XML): ключ — toBeId, XML wins над sidecar.
  if (xmlProvenance && typeof xmlProvenance === "object") {
    for (const [toBeId, rawEntry] of Object.entries(xmlProvenance)) {
      const id = asCleanString(toBeId);
      if (!id) continue;
      const entry = normalizeXmlEntry(rawEntry);
      if (!entry) continue;
      forward.set(id, entry);
      xmlUsed = true;
    }
  }

  // Канал 2 (sidecar): конфликтующие записи пропускаются (XML wins).
  const traceMap = Array.isArray(sidecar?.trace_map) ? sidecar.trace_map : [];
  for (const rawEntry of traceMap) {
    const entry = normalizeSidecarEntry(rawEntry);
    if (!entry) continue;
    sidecarUsed = true;
    if (forward.has(entry.toBeId)) continue;
    forward.set(entry.toBeId, {
      asIsIds: entry.asIsIds,
      fate: entry.fate,
      ruleId: entry.ruleId,
    });
  }

  if (!xmlUsed && !sidecarUsed) return null;

  // reverse из итогового forward: порядок обхода forward сохраняется.
  const reverse = new Map();
  for (const [toBeId, entry] of forward) {
    for (const asIsId of entry.asIsIds) {
      const list = reverse.get(asIsId) || [];
      list.push({ toBeId, fate: entry.fate, ruleId: entry.ruleId });
      reverse.set(asIsId, list);
    }
  }

  return {
    forward,
    reverse,
    source: xmlUsed && sidecarUsed ? "both" : xmlUsed ? "xml" : "sidecar",
  };
}
