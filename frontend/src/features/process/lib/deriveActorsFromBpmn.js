function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function getElementsByLocalNames(root, names) {
  const set = new Set(toArray(names).map((x) => toText(x).toLowerCase()).filter(Boolean));
  if (!set.size || !root?.getElementsByTagName) return [];
  return Array.from(root.getElementsByTagName("*")).filter((el) => set.has(String(el?.localName || "").toLowerCase()));
}

function parseBpmnXml(rawXml) {
  const raw = String(rawXml || "").trim();
  if (!raw || typeof DOMParser === "undefined") return null;
  try {
    const doc = new DOMParser().parseFromString(raw, "application/xml");
    if (!doc || doc.getElementsByTagName("parsererror").length > 0) return null;
    return doc;
  } catch {
    return null;
  }
}

export function deriveActorsFromBpmn(xmlText) {
  const doc = parseBpmnXml(xmlText);
  if (!doc) return [];

  const processMetaById = {};
  let processCursor = 0;
  getElementsByLocalNames(doc, ["process"]).forEach((processEl) => {
    const processId = toText(processEl.getAttribute("id")) || `process_${processCursor + 1}`;
    const processName = toText(processEl.getAttribute("name")) || processId;
    processCursor += 1;
    processMetaById[processId] = {
      processId,
      processName,
      poolId: processId,
      poolName: processName,
      poolOrder: processCursor,
    };
  });

  let poolCursor = processCursor;
  getElementsByLocalNames(doc, ["participant"]).forEach((participantEl) => {
    const processRef = toText(participantEl.getAttribute("processRef"));
    if (!processRef) return;
    const poolId = toText(participantEl.getAttribute("id")) || processRef;
    const poolName = toText(participantEl.getAttribute("name")) || poolId;
    const base = processMetaById[processRef] || {
      processId: processRef,
      processName: processRef,
      poolOrder: 0,
    };
    poolCursor += 1;
    processMetaById[processRef] = {
      ...base,
      processId: processRef,
      poolId,
      poolName,
      poolOrder: base.poolOrder || poolCursor,
    };
  });

  const actors = [];
  const seen = new Set();
  let orderCursor = 0;

  getElementsByLocalNames(doc, ["process"]).forEach((processEl) => {
    const processId = toText(processEl.getAttribute("id"));
    const processMeta = processMetaById[processId] || {
      processId: processId || "process",
      poolId: processId || "pool",
      poolName: processId || "pool",
      poolOrder: 0,
    };
    let laneOrder = 0;
    getElementsByLocalNames(processEl, ["lane"]).forEach((laneEl) => {
      const laneId = toText(laneEl.getAttribute("id"));
      const laneName = toText(laneEl.getAttribute("name")) || laneId;
      if (!laneId || !laneName) return;
      laneOrder += 1;
      const actorId = `${processMeta.poolId}::${laneId}`;
      if (seen.has(actorId)) return;
      seen.add(actorId);
      orderCursor += 1;
      actors.push({
        actorId,
        name: laneName,
        poolId: processMeta.poolId,
        poolName: processMeta.poolName,
        laneId,
        order: orderCursor,
        poolOrder: Number(processMeta.poolOrder || 0),
        laneOrder,
        source: "diagram",
      });
    });
  });

  actors.sort((a, b) => {
    if (a.poolOrder !== b.poolOrder) return a.poolOrder - b.poolOrder;
    if (a.laneOrder !== b.laneOrder) return a.laneOrder - b.laneOrder;
    return String(a.actorId).localeCompare(String(b.actorId));
  });

  return actors.map((actor, idx) => ({
    actorId: actor.actorId,
    name: actor.name,
    poolId: actor.poolId,
    poolName: actor.poolName,
    laneId: actor.laneId,
    order: idx + 1,
    source: "diagram",
  }));
}

export function sameDerivedActors(a, b) {
  const left = toArray(a);
  const right = toArray(b);
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const la = left[i] || {};
    const rb = right[i] || {};
    if (
      toText(la.actorId) !== toText(rb.actorId)
      || toText(la.name) !== toText(rb.name)
      || toText(la.poolId) !== toText(rb.poolId)
      || toText(la.poolName) !== toText(rb.poolName)
      || toText(la.laneId) !== toText(rb.laneId)
      || Number(la.order || 0) !== Number(rb.order || 0)
    ) {
      return false;
    }
  }
  return true;
}
