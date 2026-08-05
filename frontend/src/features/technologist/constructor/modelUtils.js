// Pure ui_model helpers for the E4 process constructor.
// All mutating helpers return NEW model objects (no in-place mutation).

export const ENTITY_CATEGORIES = ["containers", "equipment", "zones"];

export const ENTITY_CATEGORY_LABELS = {
  containers: "Тара",
  equipment: "Оборудование",
  zones: "Зоны",
};

export const DICTIONARY_BY_CATEGORY = {
  containers: "container-types",
  equipment: "equipment-types",
  zones: "zone-types",
};

// T3#3 — чип «＋ в справочник» в BlockForm: категория сущности по имени ref-параметра.
export const REF_CATEGORY_BY_PARAM = {
  container_ref: "containers",
  equipment_ref: "equipment",
  zone_ref: "zones",
};

export function categoryForRefParam(paramKey) {
  return REF_CATEGORY_BY_PARAM[String(paramKey || "").trim()] || "";
}

// Валидация нового ref перед upsertEntity: "" = ok, "empty" | "exists".
export function validateEntityRef(model, ref) {
  const value = String(ref || "").trim();
  if (!value) return "empty";
  if (listDeclaredRefs(model).includes(value)) return "exists";
  return "";
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function emptyUiModel() {
  return {
    process_template_id: "",
    recipe_context: {},
    process_entities: { containers: {}, equipment: {}, zones: {} },
    nodes: [],
    flows: [],
    lanes: [],
    participant: null,
  };
}

export function normalizeUiModel(raw) {
  const src = asObject(raw);
  const entitiesRaw = asObject(src.process_entities);
  const processEntities = {};
  ENTITY_CATEGORIES.forEach((cat) => {
    processEntities[cat] = asObject(entitiesRaw[cat]);
  });
  // keep unknown categories too (forward compatible)
  Object.keys(entitiesRaw).forEach((cat) => {
    if (!processEntities[cat]) processEntities[cat] = asObject(entitiesRaw[cat]);
  });
  return {
    ...src,
    recipe_context: asObject(src.recipe_context),
    process_entities: processEntities,
    nodes: asArray(src.nodes).map((n) => ({
      params: {},
      outputs: {},
      recipe_params: [],
      ...asObject(n),
    })),
    flows: asArray(src.flows),
    lanes: asArray(src.lanes),
  };
}

// ---- ids -----------------------------------------------------------------

export function nextId(model, prefix) {
  const base = String(prefix || "Node");
  let max = 0;
  const scan = (id) => {
    const s = String(id || "");
    if (!s.startsWith(base)) return;
    const rest = s.slice(base.length).replace(/^_/, "");
    const num = Number.parseInt(rest, 10);
    if (Number.isFinite(num)) max = Math.max(max, num);
  };
  asArray(model?.nodes).forEach((n) => scan(n?.id));
  asArray(model?.flows).forEach((f) => scan(f?.id));
  asArray(model?.lanes).forEach((l) => scan(l?.id));
  return `${base}_${max + 1}`;
}

// ---- nodes / flows ---------------------------------------------------------

export function addNode(model, node) {
  return { ...model, nodes: [...asArray(model.nodes), node] };
}

// T3#1 — вынос дубля handleAddOperation (Constructor/Workspace ×2) в shared-хелпер.
// Чистая функция: создаёт node из операции каталога в позиции pos (точка клика
// или дефолт «в хвост справа» — решает вызывающий).
export function buildOperationNode(model, op, pos) {
  return {
    id: nextId(model, "Task"),
    bpmn_type: "task",
    name: String(op?.name_ru || op?.name || op?.code || ""),
    operation_code: String(op?.code || ""),
    // display_name — на языке UI (name_ru), переименовывается в блоке
    display_name: String(op?.name_ru || op?.name || op?.code || ""),
    params: {},
    outputs: {},
    recipe_params: [],
    x: Number(pos?.x) || 0,
    y: Number(pos?.y) || 0,
    width: 140,
    height: 70,
  };
}

// T3#2 — дублирование блока: копия node с nextId, смещение x/y, БЕЗ потоков.
// Чистая функция (как addNode/addFlow) — будущий undo/redo wrapper останется тривиальным.
export function duplicateNode(model, nodeId, { dx = 40, dy = 40, nameSuffix = "" } = {}) {
  const id = String(nodeId || "");
  const src = asArray(model?.nodes).find((n) => String(n?.id || "") === id);
  if (!src) return { model, node: null };
  const prefix = String(src.id || "").replace(/_?\d+$/, "") || "Node";
  const node = {
    ...src,
    id: nextId(model, prefix),
    x: (Number(src.x) || 0) + dx,
    y: (Number(src.y) || 0) + dy,
  };
  if (nameSuffix) {
    if (src.display_name) node.display_name = `${src.display_name}${nameSuffix}`;
    if (src.name) node.name = `${src.name}${nameSuffix}`;
  }
  return { model: addNode(model, node), node };
}

export function updateNode(model, nodeId, patch) {
  const id = String(nodeId || "");
  return {
    ...model,
    nodes: asArray(model.nodes).map((n) => (String(n?.id || "") === id ? { ...n, ...patch } : n)),
  };
}

export function deleteNode(model, nodeId) {
  const id = String(nodeId || "");
  return {
    ...model,
    nodes: asArray(model.nodes).filter((n) => String(n?.id || "") !== id),
    flows: asArray(model.flows).filter(
      (f) => String(f?.source_ref || "") !== id && String(f?.target_ref || "") !== id,
    ),
    lanes: asArray(model.lanes).map((lane) => ({
      ...lane,
      flow_node_refs: asArray(lane?.flow_node_refs).filter((ref) => String(ref) !== id),
    })),
  };
}

export function addFlow(model, sourceRef, targetRef, extra = {}) {
  const flow = {
    id: nextId(model, "Flow"),
    source_ref: String(sourceRef || ""),
    target_ref: String(targetRef || ""),
    name: "",
    condition: "",
    ...extra,
  };
  return { model: { ...model, flows: [...asArray(model.flows), flow] }, flow };
}

export function updateFlow(model, flowId, patch) {
  const id = String(flowId || "");
  return {
    ...model,
    flows: asArray(model.flows).map((f) => (String(f?.id || "") === id ? { ...f, ...patch } : f)),
  };
}

export function deleteFlow(model, flowId) {
  const id = String(flowId || "");
  return { ...model, flows: asArray(model.flows).filter((f) => String(f?.id || "") !== id) };
}

export function findNode(model, nodeId) {
  const id = String(nodeId || "");
  return asArray(model?.nodes).find((n) => String(n?.id || "") === id) || null;
}

export function findFlow(model, flowId) {
  const id = String(flowId || "");
  return asArray(model?.flows).find((f) => String(f?.id || "") === id) || null;
}

export function isGatewayNode(node) {
  return String(node?.bpmn_type || "").endsWith("Gateway");
}

// ---- entities --------------------------------------------------------------

export function listEntityRefs(model) {
  const out = [];
  const entities = asObject(model?.process_entities);
  Object.keys(entities).forEach((category) => {
    Object.keys(asObject(entities[category])).forEach((ref) => {
      out.push({ ref, category, entry: asObject(entities[category][ref]) });
    });
  });
  return out;
}

// Declared refs available for *_ref param dropdowns: entity refs + recipe_context keys.
export function listDeclaredRefs(model) {
  const refs = listEntityRefs(model).map(({ ref }) => ref);
  Object.keys(asObject(model?.recipe_context)).forEach((key) => refs.push(key));
  return Array.from(new Set(refs));
}

export function getEntityEntry(model, category, ref) {
  return asObject(asObject(model?.process_entities)[category])[ref] || null;
}

export function upsertEntity(model, category, ref, entry) {
  const entities = { ...asObject(model.process_entities) };
  const bucket = { ...asObject(entities[category]) };
  bucket[ref] = { ...asObject(bucket[ref]), ...asObject(entry) };
  entities[category] = bucket;
  return { ...model, process_entities: entities };
}

export function removeEntity(model, category, ref) {
  const entities = { ...asObject(model.process_entities) };
  const bucket = { ...asObject(entities[category]) };
  delete bucket[ref];
  entities[category] = bucket;
  return { ...model, process_entities: entities };
}

// Blocks whose params reference the entity ref (camunda-style *_ref params).
export function findRefUsages(model, ref) {
  const target = String(ref || "");
  const usages = [];
  asArray(model?.nodes).forEach((node) => {
    const params = asObject(node?.params);
    Object.keys(params).forEach((key) => {
      if (String(params[key]) === target) {
        usages.push({
          nodeId: String(node?.id || ""),
          nodeName: String(node?.display_name || node?.name || node?.id || ""),
          paramKey: key,
        });
      }
    });
  });
  return usages;
}

// Rename entity ref: renames the key in its category bucket AND updates all
// referencing node params. Returns new model.
export function renameEntityRef(model, category, oldRef, newRef) {
  const from = String(oldRef || "");
  const to = String(newRef || "").trim();
  if (!from || !to || from === to) return model;
  const entities = { ...asObject(model.process_entities) };
  const bucket = { ...asObject(entities[category]) };
  if (!(from in bucket) || to in bucket) return model;
  bucket[to] = bucket[from];
  delete bucket[from];
  entities[category] = bucket;
  const nodes = asArray(model.nodes).map((node) => {
    const params = asObject(node.params);
    let changed = false;
    const nextParams = {};
    Object.keys(params).forEach((key) => {
      if (String(params[key]) === from) {
        nextParams[key] = to;
        changed = true;
      } else {
        nextParams[key] = params[key];
      }
    });
    return changed ? { ...node, params: nextParams } : node;
  });
  return { ...model, process_entities: entities, nodes };
}

// Merge E3 import draft_entities into process_entities as source=draft entries.
export function mergeDraftEntities(model, draftEntities) {
  let next = model;
  asArray(draftEntities).forEach((draft) => {
    const ref = String(draft?.ref || "").trim();
    if (!ref) return;
    let category = String(draft?.guessed_category || "").trim();
    if (!ENTITY_CATEGORIES.includes(category)) category = "zones";
    if (getEntityEntry(next, category, ref)) return;
    next = upsertEntity(next, category, ref, { type_id: "", source: "draft" });
  });
  return next;
}

// ---- validation ------------------------------------------------------------

export function computeReachable(model) {
  const nodes = asArray(model?.nodes);
  const flows = asArray(model?.flows);
  const hasIncoming = new Set(flows.map((f) => String(f?.target_ref || "")));
  const starts = nodes.filter((n) => String(n?.bpmn_type || "") === "startEvent");
  let roots = starts;
  if (roots.length === 0) {
    roots = nodes.filter((n) => !hasIncoming.has(String(n?.id || "")));
  }
  // E6: link-catch события — дополнительные корни (та же семантика, что R6 на
  // сервере: linkEventDefinition в event_definitions, либо catch без входящих
  // потоков для моделей без event_definitions).
  const isLinkCatch = (n) => {
    if (String(n?.bpmn_type || "") !== "intermediateCatchEvent") return false;
    const defs = asArray(n?.event_definitions);
    if (defs.length > 0) return defs.includes("linkEventDefinition");
    return !hasIncoming.has(String(n?.id || ""));
  };
  const rootIds = new Set(roots.map((n) => String(n?.id || "")));
  nodes.forEach((n) => {
    const id = String(n?.id || "");
    if (id && !rootIds.has(id) && isLinkCatch(n)) {
      roots = [...roots, n];
      rootIds.add(id);
    }
  });
  const outgoing = new Map();
  flows.forEach((f) => {
    const src = String(f?.source_ref || "");
    if (!outgoing.has(src)) outgoing.set(src, []);
    outgoing.get(src).push(String(f?.target_ref || ""));
  });
  const reachable = new Set();
  const queue = roots.map((n) => String(n?.id || ""));
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    (outgoing.get(id) || []).forEach((next) => {
      if (!reachable.has(next)) queue.push(next);
    });
  }
  const unreachable = nodes
    .map((n) => String(n?.id || ""))
    .filter((id) => id && !reachable.has(id));
  return { reachable, unreachable };
}

// Declared outputs of tasks that can reach the given node (BFS backwards).
export function precedingTaskOutputs(model, nodeId) {
  const target = String(nodeId || "");
  const flows = asArray(model?.flows);
  const incoming = new Map();
  flows.forEach((f) => {
    const tgt = String(f?.target_ref || "");
    if (!incoming.has(tgt)) incoming.set(tgt, []);
    incoming.get(tgt).push(String(f?.source_ref || ""));
  });
  const byId = new Map();
  asArray(model?.nodes).forEach((n) => byId.set(String(n?.id || ""), n));
  const visited = new Set();
  const queue = [target];
  const outputs = new Set();
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    (incoming.get(id) || []).forEach((srcId) => {
      const srcNode = byId.get(srcId);
      if (srcNode && String(srcNode?.bpmn_type || "") === "task") {
        Object.entries(asObject(srcNode.outputs)).forEach(([key, value]) => {
          if (key) outputs.add(String(key));
          if (typeof value === "string" && value) outputs.add(value);
        });
      }
      if (!visited.has(srcId)) queue.push(srcId);
    });
  }
  return Array.from(outputs).sort();
}

export const GATEWAY_CONDITION_UNKNOWN_OUTPUT = "GATEWAY_CONDITION_UNKNOWN_OUTPUT";

// Returns "" when ok, or GATEWAY_CONDITION_UNKNOWN_OUTPUT when the flow leaves
// a gateway with a condition that is not among preceding tasks' declared outputs.
export function gatewayConditionError(model, flow) {
  if (!flow) return "";
  const condition = String(flow?.condition || "").trim();
  if (!condition) return "";
  const source = findNode(model, flow?.source_ref);
  if (!isGatewayNode(source)) return "";
  const allowed = precedingTaskOutputs(model, flow?.source_ref);
  return allowed.includes(condition) ? "" : GATEWAY_CONDITION_UNKNOWN_OUTPUT;
}

// Required params missing per operation parameter_schema.
export function missingRequiredParams(opDetail, params) {
  const schema = asObject(opDetail?.parameter_schema);
  const values = asObject(params);
  const missing = [];
  Object.keys(schema).forEach((key) => {
    const spec = asObject(schema[key]);
    if (!spec.required) return;
    const raw = values[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") missing.push(key);
  });
  return missing;
}
