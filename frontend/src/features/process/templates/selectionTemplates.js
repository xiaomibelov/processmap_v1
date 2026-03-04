function toText(value) {
  return String(value || "").trim();
}

function toToken(value) {
  return toText(value).toLowerCase().replace(/\s+/g, " ");
}

export function normalizeTemplateScope(raw) {
  const scope = toText(raw).toLowerCase();
  if (scope === "org") return "org";
  return "personal";
}

export function normalizeTemplateElementIds(rawList) {
  const seen = new Set();
  const out = [];
  const list = Array.isArray(rawList) ? rawList : [];
  for (let i = 0; i < list.length; i += 1) {
    const value = toText(list[i]);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function normalizeTemplateElementRefs(rawList, allowedIdsRaw = []) {
  const allowedIds = normalizeTemplateElementIds(allowedIdsRaw);
  const allowed = allowedIds.length ? new Set(allowedIds) : null;
  const seen = new Set();
  const out = [];
  const list = Array.isArray(rawList) ? rawList : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i] && typeof list[i] === "object" ? list[i] : {};
    const id = toText(item.id);
    if (!id || seen.has(id)) continue;
    if (allowed && !allowed.has(id)) continue;
    seen.add(id);
    const kindRaw = toText(item.kind).toLowerCase();
    const kind = kindRaw === "edge" ? "edge" : "node";
    out.push({
      id,
      kind,
      name: toText(item.name),
      type: toText(item.type),
      lane_name: toText(item.lane_name || item.laneName || item.lane),
    });
  }
  return out;
}

export function buildSelectionTemplatePayload(options = {}) {
  const ids = normalizeTemplateElementIds(options?.selectedElementIds);
  const refs = normalizeTemplateElementRefs(options?.selectedElementRefs, ids);
  return {
    bpmn_element_ids: ids,
    bpmn_element_refs: refs,
    bpmn_fingerprint: toText(options?.bpmnFingerprint),
  };
}

export function readTemplateElementIds(templateRaw) {
  const template = templateRaw && typeof templateRaw === "object" ? templateRaw : {};
  const payload = template.payload && typeof template.payload === "object" ? template.payload : {};
  return normalizeTemplateElementIds(payload.bpmn_element_ids);
}

export function readTemplateElementRefs(templateRaw) {
  const template = templateRaw && typeof templateRaw === "object" ? templateRaw : {};
  const payload = template.payload && typeof template.payload === "object" ? template.payload : {};
  const ids = normalizeTemplateElementIds(payload.bpmn_element_ids);
  return normalizeTemplateElementRefs(payload.bpmn_element_refs, ids);
}

export function remapTemplateNodeIdsByRefs(options = {}) {
  const ids = normalizeTemplateElementIds(options?.ids);
  const refs = normalizeTemplateElementRefs(options?.elementRefs, ids);
  const selectedSet = new Set(normalizeTemplateElementIds(options?.selectedIds));
  const refById = new Map(refs.map((ref) => [ref.id, ref]));
  const nodesRaw = options?.currentNodesById && typeof options.currentNodesById === "object"
    ? options.currentNodesById
    : {};
  const nodeEntries = Object.entries(nodesRaw).map(([id, nodeRaw]) => {
    const node = nodeRaw && typeof nodeRaw === "object" ? nodeRaw : {};
    return {
      id: toText(id),
      nameToken: toToken(node.name),
      typeToken: toToken(node.type),
      laneToken: toToken(node.lane_name || node.laneName || node.lane),
    };
  }).filter((entry) => entry.id && entry.nameToken);

  const mappedIds = [];
  const missingIds = [];
  let ambiguousCount = 0;
  let noMatchCount = 0;

  for (let i = 0; i < ids.length; i += 1) {
    const sourceId = ids[i];
    const ref = refById.get(sourceId);
    if (!ref || ref.kind !== "node") {
      missingIds.push(sourceId);
      continue;
    }
    const nameToken = toToken(ref.name);
    if (!nameToken) {
      missingIds.push(sourceId);
      noMatchCount += 1;
      continue;
    }
    let candidates = nodeEntries.filter((entry) => entry.nameToken === nameToken && !selectedSet.has(entry.id));
    if (!candidates.length) {
      missingIds.push(sourceId);
      noMatchCount += 1;
      continue;
    }
    const refType = toToken(ref.type);
    if (refType) {
      const typed = candidates.filter((entry) => entry.typeToken === refType);
      if (typed.length) candidates = typed;
    }
    const refLane = toToken(ref.lane_name);
    if (refLane) {
      const laneScoped = candidates.filter((entry) => entry.laneToken === refLane);
      if (laneScoped.length) candidates = laneScoped;
    }
    if (candidates.length !== 1) {
      missingIds.push(sourceId);
      ambiguousCount += 1;
      continue;
    }
    const targetId = candidates[0].id;
    selectedSet.add(targetId);
    mappedIds.push(targetId);
  }

  return {
    mappedIds,
    missingIds,
    remappedCount: mappedIds.length,
    ambiguousCount,
    noMatchCount,
  };
}

export function canCreateOrgTemplate(roleRaw, isAdminRaw = false) {
  if (Boolean(isAdminRaw)) return true;
  const role = toText(roleRaw).toLowerCase();
  return role === "org_owner" || role === "org_admin" || role === "project_manager";
}

export function canManageOrgTemplate(roleRaw, isAdminRaw = false) {
  if (Boolean(isAdminRaw)) return true;
  const role = toText(roleRaw).toLowerCase();
  return role === "org_owner" || role === "org_admin";
}
