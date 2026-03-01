function asText(value) {
  return String(value || "");
}

function normalizeText(value) {
  return asText(value).replace(/\s+/g, " ").trim();
}

function parseAttributes(raw = "") {
  const out = {};
  const src = asText(raw);
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m = re.exec(src);
  while (m) {
    const name = asText(m[1]).trim();
    if (name) out[name] = asText(m[2] ?? m[3]).trim();
    m = re.exec(src);
  }
  return out;
}

function localName(raw) {
  const src = asText(raw).trim();
  if (!src) return "";
  const idx = src.indexOf(":");
  const name = idx >= 0 ? src.slice(idx + 1) : src;
  return name.toLowerCase();
}

function extractOpenTags(xml, tagNames = []) {
  const names = tagNames
    .map((name) => asText(name).trim())
    .filter(Boolean);
  if (!names.length) return [];
  const re = new RegExp(`<\\s*(?!/)(?:[\\w.-]+:)?(${names.join("|")})\\b([^>]*)>`, "gi");
  const out = [];
  let m = re.exec(xml);
  while (m) {
    out.push({
      tag: localName(m[1]),
      attrs: parseAttributes(m[2]),
    });
    m = re.exec(xml);
  }
  return out;
}

function extractLaneInfo(xml) {
  const lanes = [];
  const laneByNodeId = {};
  const re = /<\s*(?!\/)(?:[\w.-]+:)?lane\b([^>]*)>([\s\S]*?)<\s*\/\s*(?:[\w.-]+:)?lane\s*>/gi;
  let m = re.exec(xml);
  let order = 0;
  while (m) {
    const attrs = parseAttributes(m[1]);
    const body = asText(m[2]);
    const id = normalizeText(attrs.id);
    const name = normalizeText(attrs.name || attrs.id);
    if (id || name) {
      lanes.push({
        id: id || `lane_${order + 1}`,
        name: name || id || `Lane ${order + 1}`,
        order,
      });
      order += 1;
    }
    const refsRe = /<\s*(?!\/)(?:[\w.-]+:)?flowNodeRef\b[^>]*>([^<]+)<\s*\/\s*(?:[\w.-]+:)?flowNodeRef\s*>/gi;
    let ref = refsRe.exec(body);
    while (ref) {
      const nodeId = normalizeText(ref[1]);
      if (nodeId) laneByNodeId[nodeId] = id || name;
      ref = refsRe.exec(body);
    }
    m = re.exec(xml);
  }
  return { lanes, laneByNodeId };
}

function mapBy(list = [], keyFn) {
  const out = {};
  list.forEach((item) => {
    const key = asText(keyFn(item)).trim();
    if (!key) return;
    out[key] = item;
  });
  return out;
}

function toEdgeKey(fromId, toId) {
  const from = normalizeText(fromId);
  const to = normalizeText(toId);
  if (!from || !to) return "";
  return `${from}__${to}`;
}

function buildBpmnGraphModel(xmlText) {
  const xml = asText(xmlText);
  if (!xml.trim()) {
    return {
      ok: false,
      error: "empty_xml",
      nodes: [],
      edges: [],
      lanes: [],
      pools: [],
    };
  }

  const { lanes, laneByNodeId } = extractLaneInfo(xml);
  const laneById = mapBy(lanes, (lane) => lane.id);

  const taskTags = [
    "task",
    "userTask",
    "serviceTask",
    "manualTask",
    "scriptTask",
    "businessRuleTask",
    "sendTask",
    "receiveTask",
  ];
  const subprocessTags = ["subProcess", "adhocSubProcess", "adHocSubProcess", "callActivity"];

  const rawTaskNodes = extractOpenTags(xml, taskTags).map((item) => {
    const id = normalizeText(item?.attrs?.id);
    if (!id) return null;
    const laneId = normalizeText(laneByNodeId[id]);
    const lane = laneById[laneId];
    return {
      id,
      type: localName(item?.tag),
      entity: "task",
      name: normalizeText(item?.attrs?.name || id),
      laneId: laneId || "",
      laneName: normalizeText(lane?.name || laneId),
    };
  }).filter(Boolean);

  const rawSubprocessNodes = extractOpenTags(xml, subprocessTags).map((item) => {
    const id = normalizeText(item?.attrs?.id);
    if (!id) return null;
    const laneId = normalizeText(laneByNodeId[id]);
    const lane = laneById[laneId];
    return {
      id,
      type: localName(item?.tag),
      entity: "subprocess",
      name: normalizeText(item?.attrs?.name || id),
      laneId: laneId || "",
      laneName: normalizeText(lane?.name || laneId),
    };
  }).filter(Boolean);

  const edges = extractOpenTags(xml, ["sequenceFlow"])
    .map((item) => {
      const from = normalizeText(item?.attrs?.sourceRef);
      const to = normalizeText(item?.attrs?.targetRef);
      const key = toEdgeKey(from, to);
      if (!key) return null;
      return {
        id: normalizeText(item?.attrs?.id || key),
        key,
        from,
        to,
        when: normalizeText(item?.attrs?.name || ""),
      };
    })
    .filter(Boolean);

  const pools = extractOpenTags(xml, ["participant"])
    .map((item, idx) => {
      const id = normalizeText(item?.attrs?.id) || `pool_${idx + 1}`;
      return {
        id,
        name: normalizeText(item?.attrs?.name || id),
      };
    });

  return {
    ok: true,
    error: "",
    nodes: [...rawTaskNodes, ...rawSubprocessNodes],
    edges,
    lanes,
    pools,
  };
}

function diffEntityById(prevList = [], nextList = [], fields = []) {
  const prevById = mapBy(prevList, (item) => item.id);
  const nextById = mapBy(nextList, (item) => item.id);
  const prevIds = new Set(Object.keys(prevById));
  const nextIds = new Set(Object.keys(nextById));

  const added = [];
  const removed = [];
  const changed = [];

  nextIds.forEach((id) => {
    if (!prevIds.has(id)) added.push(nextById[id]);
  });
  prevIds.forEach((id) => {
    if (!nextIds.has(id)) removed.push(prevById[id]);
  });
  prevIds.forEach((id) => {
    if (!nextIds.has(id)) return;
    const a = prevById[id];
    const b = nextById[id];
    const changedFields = fields.filter((field) => normalizeText(a?.[field]) !== normalizeText(b?.[field]));
    if (!changedFields.length) return;
    changed.push({
      id,
      before: a,
      after: b,
      changes: changedFields,
    });
  });

  return { added, removed, changed };
}

function summarizeSemanticDiff(diff = {}) {
  const addedTasks = diff?.tasks?.added?.length || 0;
  const removedTasks = diff?.tasks?.removed?.length || 0;
  const changedTasks = diff?.tasks?.changed?.length || 0;
  const addedFlows = diff?.flows?.added?.length || 0;
  const removedFlows = diff?.flows?.removed?.length || 0;
  const changedFlows = diff?.flows?.changed?.length || 0;
  const addedLanes = diff?.lanes?.added?.length || 0;
  const removedLanes = diff?.lanes?.removed?.length || 0;
  const changedLanes = diff?.lanes?.changed?.length || 0;
  const addedSubprocess = diff?.subprocess?.added?.length || 0;
  const removedSubprocess = diff?.subprocess?.removed?.length || 0;
  const changedSubprocess = diff?.subprocess?.changed?.length || 0;
  const changedConditions = diff?.conditions?.changed?.length || 0;

  return {
    added: {
      tasks: addedTasks,
      flows: addedFlows,
      lanes: addedLanes,
      subprocess: addedSubprocess,
      conditions: 0,
    },
    removed: {
      tasks: removedTasks,
      flows: removedFlows,
      lanes: removedLanes,
      subprocess: removedSubprocess,
      conditions: 0,
    },
    changed: {
      tasks: changedTasks,
      flows: changedFlows,
      lanes: changedLanes,
      subprocess: changedSubprocess,
      conditions: changedConditions,
    },
  };
}

function buildSemanticBpmnDiff(previousXml, nextXml) {
  const previous = buildBpmnGraphModel(previousXml);
  const next = buildBpmnGraphModel(nextXml);
  if (!previous.ok || !next.ok) {
    return {
      ok: false,
      error: !previous.ok ? previous.error : next.error,
      previous,
      next,
    };
  }

  const prevTasks = previous.nodes.filter((node) => node.entity === "task");
  const nextTasks = next.nodes.filter((node) => node.entity === "task");
  const prevSubprocess = previous.nodes.filter((node) => node.entity === "subprocess");
  const nextSubprocess = next.nodes.filter((node) => node.entity === "subprocess");

  const tasks = diffEntityById(prevTasks, nextTasks, ["name", "laneId", "type"]);
  const lanes = diffEntityById(previous.lanes, next.lanes, ["name", "order"]);
  const subprocess = diffEntityById(prevSubprocess, nextSubprocess, ["name", "laneId", "type"]);

  const prevEdges = mapBy(previous.edges, (edge) => edge.key);
  const nextEdges = mapBy(next.edges, (edge) => edge.key);
  const edgeKeys = new Set([...Object.keys(prevEdges), ...Object.keys(nextEdges)]);
  const flows = {
    added: [],
    removed: [],
    changed: [],
  };
  const conditions = {
    changed: [],
  };
  edgeKeys.forEach((key) => {
    const a = prevEdges[key];
    const b = nextEdges[key];
    if (!a && b) {
      flows.added.push(b);
      return;
    }
    if (a && !b) {
      flows.removed.push(a);
      return;
    }
    if (!a || !b) return;
    const changedFields = [];
    if (normalizeText(a.when) !== normalizeText(b.when)) changedFields.push("when");
    if (changedFields.length) {
      flows.changed.push({
        key,
        before: a,
        after: b,
        changes: changedFields,
      });
      conditions.changed.push({
        key,
        from: a.from,
        to: a.to,
        before: normalizeText(a.when),
        after: normalizeText(b.when),
      });
    }
  });

  const details = {
    tasks,
    lanes,
    subprocess,
    flows,
    conditions,
  };
  return {
    ok: true,
    error: "",
    previous,
    next,
    details,
    summary: summarizeSemanticDiff(details),
  };
}

export {
  buildBpmnGraphModel,
  buildSemanticBpmnDiff,
  summarizeSemanticDiff,
};
