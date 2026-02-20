/* ProcessStage domain helpers (extracted) */
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((x) => canonicalize(x));
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value)
      .sort()
      .forEach((k) => {
        out[k] = canonicalize(value[k]);
      });
    return out;
  }
  return value;
}

function safeJson(x) {
  try {
    return JSON.stringify(canonicalize(asObject(x)));
  } catch {
    return "{}";
  }
}

function projectInterviewNodes(nodesRaw) {
  return asArray(nodesRaw)
    .map((n) => {
      const id = String(n?.id || "").trim();
      if (!id) return null;
      const params = asObject(n?.parameters);
      return {
        id,
        type: String(n?.type || ""),
        title: String(n?.title || n?.name || ""),
        actor_role: String(n?.actor_role || ""),
        duration_min: n?.duration_min ?? null,
        interview_comment: String(params.interview_comment || ""),
        interview_subprocess: String(params.interview_subprocess || ""),
        interview_step_type: String(params.interview_step_type || ""),
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
}

function interviewNodesFingerprint(nodesRaw) {
  return safeJson({ nodes: projectInterviewNodes(nodesRaw) });
}

function projectEdges(edgesRaw) {
  return asArray(edgesRaw)
    .map((e) => {
      const from_id = String(e?.from_id || e?.from || "").trim();
      const to_id = String(e?.to_id || e?.to || "").trim();
      if (!from_id || !to_id) return null;
      return {
        from_id,
        to_id,
        when: String(e?.when || "").trim(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ak = `${a.from_id}\u0000${a.to_id}\u0000${a.when}`;
      const bk = `${b.from_id}\u0000${b.to_id}\u0000${b.when}`;
      return ak.localeCompare(bk);
    });
}

function interviewEdgesFingerprint(edgesRaw) {
  return safeJson({ edges: projectEdges(edgesRaw) });
}

function buildInterviewPatchPayload(nextInterview, nextNodes, baseNodes, nextEdges, baseEdges) {
  const nextNodesHash = interviewNodesFingerprint(nextNodes);
  const baseNodesHash = interviewNodesFingerprint(baseNodes);
  const nodesChanged = nextNodesHash !== baseNodesHash;
  const nextEdgesHash = interviewEdgesFingerprint(nextEdges);
  const baseEdgesHash = interviewEdgesFingerprint(baseEdges);
  const edgesChanged = nextEdgesHash !== baseEdgesHash;
  const patch = { interview: nextInterview };
  if (nodesChanged) patch.nodes = nextNodes;
  if (edgesChanged) patch.edges = nextEdges;
  return { patch, nodesChanged, edgesChanged, nextNodesHash, nextEdgesHash };
}

function normalizeLoose(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isBpmnEventShadowNode(node) {
  const kind = normalizeLoose(node?.parameters?.bpmn_kind);
  return kind === "startevent" || kind === "endevent";
}

function sanitizeGraphNodes(nodesRaw) {
  return asArray(nodesRaw).filter((n) => !isBpmnEventShadowNode(n));
}

function isBpmnEventRefId(nodeIdRaw) {
  const id = String(nodeIdRaw || "").trim().toLowerCase();
  if (!id) return false;
  return id.startsWith("startevent") || id.startsWith("endevent") || id.startsWith("intermediate") || id.startsWith("boundaryevent");
}

function isNativeSubprocessStepType(v) {
  const t = String(v || "").toLowerCase();
  return t === "subprocess_collapsed" || t === "subprocess_expanded" || t === "adhoc_subprocess_collapsed" || t === "adhoc_subprocess_expanded";
}

function mapInterviewStepTypeToNodeType(stepType) {
  const t = String(stepType || "").toLowerCase();
  if (t === "waiting") return "timer";
  if (t === "movement") return "message";
  return "step";
}

function safeNodeGraphId(raw, fallback = "iv_step") {
  let s = String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!s) s = fallback;
  if (!/^[A-Za-z_]/.test(s)) s = `n_${s}`;
  return s;
}

function enrichInterviewWithNodeBindings(interviewRaw, nodesRaw) {
  const interview = asObject(interviewRaw);
  const steps = asArray(interview.steps).map((s) => ({ ...asObject(s) }));
  const nodes = asArray(nodesRaw).map((n) => ({ ...asObject(n), parameters: { ...asObject(n?.parameters) } }));

  const byId = {};
  const titleBuckets = {};
  const usedIds = new Set();

  function indexNode(node) {
    const nid = toNodeId(node?.id);
    if (!nid) return;
    byId[nid] = node;
    usedIds.add(nid);
    const key = normalizeLoose(node?.title || node?.name || "");
    if (!key) return;
    if (!titleBuckets[key]) titleBuckets[key] = [];
    titleBuckets[key].push(node);
  }

  nodes.forEach(indexNode);

  const nextSteps = steps.map((step, idx) => {
    const action = String(step?.action || "").trim();
    const role = String(step?.role || step?.area || "").trim();
    const subprocess = String(step?.subprocess || "").trim();
    const comment = String(step?.comment || "").trim();
    const stepType = String(step?.type || "").trim().toLowerCase();

    let resolvedNode = null;
    const explicitNodeId = toNodeId(step?.node_id || step?.nodeId);
    const stepId = toNodeId(step?.id);

    if (explicitNodeId && byId[explicitNodeId]) {
      resolvedNode = byId[explicitNodeId];
    } else if (stepId && byId[stepId]) {
      resolvedNode = byId[stepId];
    } else if (action) {
      const key = normalizeLoose(action);
      const hits = asArray(titleBuckets[key]);
      if (hits.length === 1) {
        resolvedNode = hits[0];
      }
    }

    const boundaryTriggerKey = normalizeLoose(interview?.boundaries?.trigger);
    const actionKey = normalizeLoose(action);
    const isSystemStartStep = idx === 0 && !!boundaryTriggerKey && actionKey === boundaryTriggerKey;
    if (!resolvedNode && (isBpmnEventRefId(explicitNodeId) || isSystemStartStep)) {
      return {
        ...step,
        node_id: explicitNodeId || "",
      };
    }

    if (!resolvedNode && action) {
      const preferredId = explicitNodeId || stepId || `iv_step_${idx + 1}`;
      let nid = safeNodeGraphId(preferredId, `iv_step_${idx + 1}`);
      let k = 2;
      while (usedIds.has(nid)) {
        nid = `${safeNodeGraphId(preferredId, `iv_step_${idx + 1}`)}_${k}`;
        k += 1;
      }
      const durationNum = Number(step?.duration_min);
      resolvedNode = {
        id: nid,
        type: mapInterviewStepTypeToNodeType(step?.type),
        title: action || nid,
        actor_role: role || null,
        equipment: [],
        parameters: {},
        duration_min: Number.isFinite(durationNum) && durationNum > 0 ? Math.round(durationNum) : null,
        qc: [],
        exceptions: [],
        disposition: {},
        evidence: [],
        confidence: 0.0,
      };
      nodes.push(resolvedNode);
      indexNode(resolvedNode);
    }

    if (!resolvedNode) {
      return step;
    }

    resolvedNode.type = mapInterviewStepTypeToNodeType(stepType);
    if (action) resolvedNode.title = action;
    if (role) resolvedNode.actor_role = role;
    const params = { ...asObject(resolvedNode.parameters) };
    if (comment) params.interview_comment = comment;
    else delete params.interview_comment;
    if (subprocess) params.interview_subprocess = subprocess;
    else delete params.interview_subprocess;
    if (isNativeSubprocessStepType(stepType)) params.interview_step_type = stepType;
    else delete params.interview_step_type;
    resolvedNode.parameters = params;

    return {
      ...step,
      node_id: String(resolvedNode.id || ""),
    };
  });

  const transitions = asArray(interview.transitions)
    .map((tr, idx) => {
      const fromId = toNodeId(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId);
      const toId = toNodeId(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId);
      if (!fromId || !toId) return null;
      if (!byId[fromId] || !byId[toId]) return null;
      return {
        id: String(tr?.id || `tr_${idx + 1}`),
        from_node_id: fromId,
        to_node_id: toId,
        when: String(tr?.when || tr?.label || "").trim(),
      };
    })
    .filter(Boolean);

  const subprocesses = [];
  const seenSub = new Set();
  function addSub(v) {
    const txt = String(v || "").trim();
    if (!txt) return;
    const key = normalizeLoose(txt);
    if (!key || seenSub.has(key)) return;
    seenSub.add(key);
    subprocesses.push(txt);
  }
  asArray(interview.subprocesses).forEach(addSub);
  nextSteps.forEach((s) => addSub(s?.subprocess));

  return {
    interview: { ...interview, steps: nextSteps, subprocesses, transitions },
    nodes,
  };
}

function interviewHasContent(v) {
  const iv = asObject(v);
  const boundaries = asObject(iv.boundaries);
  const steps = asArray(iv.steps);
  const exceptions = asArray(iv.exceptions);
  const ai = asObject(iv.ai_questions);
  const hasBoundaryText = Object.values(boundaries).some((x) => String(x || "").trim().length > 0);
  const hasAi = Object.keys(ai).length > 0;
  return hasBoundaryText || steps.length > 0 || exceptions.length > 0 || hasAi;
}

function interviewHasTimeline(v) {
  const iv = asObject(v);
  return asArray(iv.steps).length > 0;
}

function isLikelySeedBpmnXml(xmlText) {
  const xml = String(xmlText || "");
  if (!xml.trim()) return false;
  const hasSeedTaskTitle = xml.includes("Опишите первый шаг процесса");
  const hasSeedIds = xml.includes("StartEvent_1") && xml.includes("Task_1") && xml.includes("EndEvent_1");
  const low = xml.toLowerCase();
  const count = (re) => (low.match(re) || []).length;
  const startN = count(/<[^>]*:?startevent\b/g);
  const endN = count(/<[^>]*:?endevent\b/g);
  const flowN = count(/<[^>]*:?sequenceflow\b/g);
  const taskN = count(/<[^>]*:(task|usertask|servicetask|manualtask|scripttask|businessruletask|sendtask|receivetask)\b/g);
  const gwN = count(/<[^>]*:(exclusivegateway|parallelgateway|inclusivegateway|eventbasedgateway)\b/g);
  const subN = count(/<[^>]*:(subprocess|callactivity)\b/g);
  const hasStartEndOnly = startN === 1 && endN === 1 && flowN <= 1 && taskN === 0 && gwN === 0 && subN === 0;
  return hasSeedTaskTitle || hasSeedIds || hasStartEndOnly;
}

function mergeInterviewData(baseRaw, extraRaw, options = {}) {
  const preferBpmn = !!options?.preferBpmn;
  const base = asObject(baseRaw);
  const extra = asObject(extraRaw);
  const normName = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  const isBlank = (v) => v == null || (typeof v === "string" && !v.trim());

  const baseBoundaries = asObject(base.boundaries);
  const extraBoundaries = asObject(extra.boundaries);
  const boundaries = { ...baseBoundaries };
  Object.keys(extraBoundaries).forEach((k) => {
    const incoming = String(extraBoundaries[k] || "").trim();
    if (!incoming) return;
    if (preferBpmn && (k === "trigger" || k === "start_shop" || k === "finish_state" || k === "finish_shop")) {
      boundaries[k] = incoming;
      return;
    }
    if (!String(boundaries[k] || "").trim() && incoming) {
      boundaries[k] = extraBoundaries[k];
    }
  });

  const baseSteps = asArray(base.steps).map((s) => ({ ...s }));
  const extraStepsRaw = asArray(extra.steps).map((s) => ({ ...s }));
  const usedStepIds = new Set(baseSteps.map((s) => String(s?.id || "").trim()).filter(Boolean));
  const stepIdMap = {};
  const extraSteps = [];
  const orderFromExtra = [];
  extraStepsRaw.forEach((s, i) => {
    const oldId = String(s?.id || "").trim() || `step_ext_${i + 1}`;
    const extraNodeId = toNodeId(s?.node_id || s?.nodeId);

    let matchedIdx = -1;
    if (extraNodeId) {
      matchedIdx = baseSteps.findIndex((x) => toNodeId(x?.node_id || x?.nodeId) === extraNodeId);
    }
    if (matchedIdx < 0) {
      const extraActionKey = normName(s?.action);
      if (extraActionKey) {
        const hits = baseSteps
          .map((x, idx) => ({ idx, key: normName(x?.action) }))
          .filter((x) => x.key === extraActionKey);
        if (hits.length === 1) matchedIdx = hits[0].idx;
      }
    }

    if (matchedIdx >= 0) {
      const merged = { ...baseSteps[matchedIdx] };
      const keysFillIfMissing = ["area", "type", "action", "subprocess", "comment", "role", "duration_min", "wait_min", "output"];
      keysFillIfMissing.forEach((k) => {
        if (isBlank(merged[k]) && !isBlank(s[k])) merged[k] = s[k];
      });
      if (preferBpmn) {
        ["node_id", "action", "area", "role", "type"].forEach((k) => {
          if (!isBlank(s[k])) merged[k] = s[k];
        });
      }
      const mergedNodeId = toNodeId(merged?.node_id || merged?.nodeId);
      if (!mergedNodeId && extraNodeId) merged.node_id = extraNodeId;
      baseSteps[matchedIdx] = merged;
      stepIdMap[oldId] = String(merged?.id || oldId).trim() || oldId;
      if (preferBpmn) orderFromExtra.push(stepIdMap[oldId]);
      return;
    }

    let nextId = oldId;
    let n = 2;
    while (!nextId || usedStepIds.has(nextId)) {
      nextId = `${oldId}_${n}`;
      n += 1;
    }
    usedStepIds.add(nextId);
    stepIdMap[oldId] = nextId;
    extraSteps.push({ ...s, id: nextId });
    if (preferBpmn) orderFromExtra.push(nextId);
  });
  let steps = [...baseSteps, ...extraSteps];
  if (preferBpmn && orderFromExtra.length) {
    const byId = {};
    steps.forEach((s) => {
      const sid = String(s?.id || "").trim();
      if (sid) byId[sid] = s;
    });
    const ordered = [];
    const seen = new Set();
    orderFromExtra.forEach((sid) => {
      if (!sid || seen.has(sid) || !byId[sid]) return;
      seen.add(sid);
      ordered.push(byId[sid]);
    });
    steps.forEach((s) => {
      const sid = String(s?.id || "").trim();
      if (!sid || seen.has(sid)) return;
      seen.add(sid);
      ordered.push(s);
    });
    steps = ordered;
  }

  const baseExceptions = asArray(base.exceptions).map((x) => ({ ...x }));
  const usedExcIds = new Set(baseExceptions.map((x) => String(x?.id || "").trim()).filter(Boolean));
  const extraExceptions = asArray(extra.exceptions).map((x, i) => {
    const oldId = String(x?.id || "").trim() || `exc_ext_${i + 1}`;
    let nextId = oldId;
    let n = 2;
    while (!nextId || usedExcIds.has(nextId)) {
      nextId = `${oldId}_${n}`;
      n += 1;
    }
    usedExcIds.add(nextId);
    return { ...x, id: nextId };
  });
  const exceptions = [...baseExceptions, ...extraExceptions];

  const subprocesses = [];
  const seenSub = new Set();
  const addSub = (v) => {
    const txt = String(v || "").trim();
    if (!txt) return;
    const k = normName(txt);
    if (!k || seenSub.has(k)) return;
    seenSub.add(k);
    subprocesses.push(txt);
  };
  asArray(base.subprocesses).forEach(addSub);
  asArray(extra.subprocesses).forEach(addSub);
  steps.forEach((s) => addSub(s?.subprocess));

  const aiQuestions = { ...asObject(base.ai_questions) };
  Object.keys(asObject(extra.ai_questions)).forEach((oldStepId) => {
    const mappedStepId = stepIdMap[oldStepId] || oldStepId;
    const existing = asArray(aiQuestions[mappedStepId]).map((q) => ({ ...q }));
    const existingKeys = new Set(existing.map((q) => `${String(q?.id || "")}::${String(q?.text || "")}`));
    const incoming = asArray(extra.ai_questions[oldStepId]).map((q) => ({ ...q }));
    incoming.forEach((q) => {
      const k = `${String(q?.id || "")}::${String(q?.text || "")}`;
      if (existingKeys.has(k)) return;
      existingKeys.add(k);
      existing.push(q);
    });
    aiQuestions[mappedStepId] = existing;
  });

  const aiQuestionsByElement = {};
  function mergeAiQuestionsByElement(rawMap) {
    const src = asObject(rawMap);
    Object.keys(src).forEach((rawElementId) => {
      const elementId = String(rawElementId || "").trim();
      if (!elementId) return;
      const rawEntry = src[rawElementId];
      const listRaw = Array.isArray(rawEntry)
        ? rawEntry
        : (Array.isArray(rawEntry?.items) ? rawEntry.items : []);
      if (!Array.isArray(listRaw) || !listRaw.length) return;

      const existing = asArray(aiQuestionsByElement[elementId]).map((item) => ({ ...item }));
      const byQid = {};
      const byText = {};
      existing.forEach((item) => {
        const qid = String(item?.qid || item?.id || "").trim();
        if (qid) byQid[qid] = item;
        const txtKey = normalizeLoose(item?.text);
        if (txtKey) byText[txtKey] = item;
      });

      listRaw.forEach((rawItem, idx) => {
        const item = asObject(rawItem);
        const text = String(item?.text || item?.question || "").trim();
        const qid = String(item?.qid || item?.id || item?.question_id || "").trim();
        if (!text && !qid) return;
        const fallbackId = `q_${idx + 1}_${normalizeLoose(text).slice(0, 24) || "untitled"}`;
        const key = qid || fallbackId;
        const txtKey = normalizeLoose(text);
        const found = byQid[key] || (txtKey ? byText[txtKey] : null);
        if (found) {
          if (text) found.text = text;
          if (!String(found?.comment || "").trim() && String(item?.comment || item?.answer || "").trim()) {
            found.comment = String(item?.comment || item?.answer || "").trim();
          }
          if (!String(found?.status || "").trim() && String(item?.status || "").trim()) {
            found.status = String(item?.status || "").trim();
          }
          if (!String(found?.stepId || "").trim() && String(item?.stepId || item?.step_id || "").trim()) {
            found.stepId = String(item?.stepId || item?.step_id || "").trim();
          }
          return;
        }
        const next = {
          qid: key,
          text: text || key,
          comment: String(item?.comment || item?.answer || "").trim(),
          status: String(item?.status || "open").trim() || "open",
          createdAt: Number(item?.createdAt || item?.created_at || item?.ts || Date.now()) || Date.now(),
          source: String(item?.source || "ai").trim() || "ai",
          stepId: String(item?.stepId || item?.step_id || "").trim(),
        };
        existing.push(next);
        byQid[key] = next;
        if (txtKey) byText[txtKey] = next;
      });

      aiQuestionsByElement[elementId] = existing
        .filter((item) => String(item?.qid || "").trim() && String(item?.text || "").trim())
        .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
    });
  }
  mergeAiQuestionsByElement(base.ai_questions_by_element || base.aiQuestionsByElementId);
  mergeAiQuestionsByElement(extra.ai_questions_by_element || extra.aiQuestionsByElementId);

  const transitionsByKey = {};
  function addTransition(raw, preferExisting) {
    const fromId = toNodeId(raw?.from_node_id || raw?.from || raw?.source_id || raw?.sourceId);
    const toId = toNodeId(raw?.to_node_id || raw?.to || raw?.target_id || raw?.targetId);
    if (!fromId || !toId) return;
    const key = `${fromId}__${toId}`;
    const item = {
      id: String(raw?.id || `tr_${Object.keys(transitionsByKey).length + 1}`),
      from_node_id: fromId,
      to_node_id: toId,
      when: String(raw?.when || raw?.label || "").trim(),
    };
    const prev = transitionsByKey[key];
    if (!prev) {
      transitionsByKey[key] = item;
      return;
    }
    if (!preferExisting) {
      transitionsByKey[key] = item;
      return;
    }
    if (!String(prev.when || "").trim() && item.when) {
      transitionsByKey[key] = { ...prev, when: item.when };
    }
  }
  asArray(base.transitions).forEach((x) => addTransition(x, true));
  asArray(extra.transitions).forEach((x) => addTransition(x, true));
  const transitions = Object.values(transitionsByKey);

  return {
    boundaries,
    steps,
    subprocesses,
    exceptions,
    ai_questions: aiQuestions,
    ai_questions_by_element: aiQuestionsByElement,
    transitions,
  };
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toNodeId(v) {
  return String(v || "").trim();
}

function applyInterviewTransitionsToEdges(interviewRaw, edgesRaw) {
  const interview = asObject(interviewRaw);
  const edgeList = asArray(edgesRaw).map((e) => ({ ...e }));
  if (!edgeList.length) return edgeList;

  const transitionByKey = {};
  asArray(interview.transitions).forEach((tr) => {
    const fromId = toNodeId(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId);
    const toId = toNodeId(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId);
    if (!fromId || !toId) return;
    const key = `${fromId}__${toId}`;
    transitionByKey[key] = String(tr?.when || tr?.label || "").trim();
  });

  return edgeList.map((e) => {
    const fromId = toNodeId(e?.from_id || e?.from);
    const toId = toNodeId(e?.to_id || e?.to);
    if (!fromId || !toId) return e;
    const key = `${fromId}__${toId}`;
    if (!Object.prototype.hasOwnProperty.call(transitionByKey, key)) {
      return {
        ...e,
        from_id: fromId,
        to_id: toId,
      };
    }
    const when = transitionByKey[key];
    return {
      ...e,
      from_id: fromId,
      to_id: toId,
      when: when || null,
    };
  });
}

function mergeNodesById(baseNodesRaw, parsedNodesRaw) {
  const out = [];
  const byId = new Map();

  asArray(baseNodesRaw).forEach((raw) => {
    const node = { ...asObject(raw), parameters: { ...asObject(raw?.parameters) } };
    const id = toNodeId(node?.id);
    if (!id || byId.has(id)) return;
    node.id = id;
    byId.set(id, node);
    out.push(node);
  });

  asArray(parsedNodesRaw).forEach((raw) => {
    const parsed = { ...asObject(raw), parameters: { ...asObject(raw?.parameters) } };
    const id = toNodeId(parsed?.id);
    if (!id) return;
    const cur = byId.get(id);
    if (!cur) {
      parsed.id = id;
      byId.set(id, parsed);
      out.push(parsed);
      return;
    }
    cur.type = cur.type || parsed.type;
    cur.title = cur.title || parsed.title;
    if (parsed.actor_role !== undefined && parsed.actor_role !== null && String(parsed.actor_role).trim()) {
      cur.actor_role = String(parsed.actor_role).trim();
    } else {
      cur.actor_role = cur.actor_role || null;
    }
    cur.duration_min = cur.duration_min ?? parsed.duration_min ?? null;
    cur.parameters = { ...asObject(parsed.parameters), ...asObject(cur.parameters) };
  });

  return out;
}

function mergeEdgesByKey(baseEdgesRaw, parsedEdgesRaw) {
  const map = new Map();
  const keyOf = (e) => `${toNodeId(e?.from_id || e?.from)}__${toNodeId(e?.to_id || e?.to)}`;

  asArray(parsedEdgesRaw).forEach((raw) => {
    const from_id = toNodeId(raw?.from_id || raw?.from);
    const to_id = toNodeId(raw?.to_id || raw?.to);
    if (!from_id || !to_id) return;
    const edge = {
      ...asObject(raw),
      from_id,
      to_id,
      when: String(raw?.when || "").trim() || null,
    };
    map.set(keyOf(edge), edge);
  });

  asArray(baseEdgesRaw).forEach((raw) => {
    const from_id = toNodeId(raw?.from_id || raw?.from);
    const to_id = toNodeId(raw?.to_id || raw?.to);
    if (!from_id || !to_id) return;
    const edge = {
      ...asObject(raw),
      from_id,
      to_id,
      when: String(raw?.when || "").trim() || null,
    };
    const key = keyOf(edge);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, edge);
      return;
    }
    if (!cur.when && edge.when) {
      map.set(key, { ...cur, when: edge.when });
    }
  });

  return Array.from(map.values());
}

function safeBpmnId(raw) {
  let s = String(raw || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!s) s = "id";
  if (!/^[A-Za-z_]/.test(s)) s = `id_${s}`;
  return s;
}

function nodeDurationMin(node) {
  const direct = toInt(node?.duration_min);
  if (direct !== null) return Math.max(direct, 0);
  const sched = node?.parameters?._sched || {};
  const fromSched = toInt(sched.duration_min);
  return fromSched === null ? null : Math.max(fromSched, 0);
}

function buildBottleneckHints(nodesRaw, edgesRaw, questionsRaw) {
  const nodes = asArray(nodesRaw).filter((n) => toNodeId(n?.id));
  const edges = asArray(edgesRaw);
  const questions = asArray(questionsRaw);

  if (!nodes.length) return [];

  const roleByNode = {};
  nodes.forEach((n) => {
    roleByNode[toNodeId(n.id)] = String(n?.actor_role || "").trim() || "unassigned";
  });

  const handoffByNode = {};
  edges.forEach((e) => {
    const from = toNodeId(e?.from_id || e?.from);
    const to = toNodeId(e?.to_id || e?.to);
    if (!from || !to) return;
    const fr = roleByNode[from] || "unassigned";
    const tr = roleByNode[to] || "unassigned";
    if (fr !== tr) {
      handoffByNode[from] = (handoffByNode[from] || 0) + 1;
      handoffByNode[to] = (handoffByNode[to] || 0) + 1;
    }
  });

  const openByNode = {};
  const criticalByNode = {};
  questions.forEach((q) => {
    const nodeId = toNodeId(q?.node_id || q?.nodeId);
    if (!nodeId) return;
    const status = String(q?.status || "open").toLowerCase();
    if (status !== "open") return;
    openByNode[nodeId] = (openByNode[nodeId] || 0) + 1;
    if (String(q?.issue_type || "").toUpperCase() === "CRITICAL") {
      criticalByNode[nodeId] = (criticalByNode[nodeId] || 0) + 1;
    }
  });

  const scored = nodes
    .map((n) => {
      const nodeId = toNodeId(n.id);
      const reasons = [];
      let score = 0;

      const d = nodeDurationMin(n);
      if (d !== null && d >= 45) {
        score += 5;
        reasons.push(`длительность ${d} мин`);
      } else if (d !== null && d >= 30) {
        score += 4;
        reasons.push(`длительность ${d} мин`);
      } else if (d !== null && d >= 15) {
        score += 2;
        reasons.push(`длительность ${d} мин`);
      }

      const t = String(n?.type || "step").toLowerCase();
      if (t === "timer") {
        score += 4;
        reasons.push("узел ожидания/таймер");
      }

      const handoffs = Number(handoffByNode[nodeId] || 0);
      if (handoffs >= 2) {
        score += 3;
        reasons.push(`много передач между ролями (${handoffs})`);
      } else if (handoffs === 1) {
        score += 1;
        reasons.push("передача между ролями");
      }

      const open = Number(openByNode[nodeId] || 0);
      const critical = Number(criticalByNode[nodeId] || 0);
      if (critical > 0) {
        score += 4;
        reasons.push(`критические открытые вопросы (${critical})`);
      } else if (open > 0) {
        score += 1;
        reasons.push(`есть открытые вопросы (${open})`);
      }

      const exCount = asArray(n?.exceptions).length;
      if (exCount >= 3) {
        score += 2;
        reasons.push(`частые исключения (${exCount})`);
      }

      if (score < 3) return null;
      const severity = score >= 8 ? "high" : score >= 5 ? "medium" : "low";
      const title = String(n?.title || n?.name || nodeId).trim() || nodeId;
      return {
        nodeId,
        title,
        score,
        severity,
        reasons,
        elementIds: [nodeId, safeBpmnId(nodeId)],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  return scored.slice(0, 8);
}

function buildLogicAiHint(reason, severity = "medium") {
  const text = String(reason || "").toLowerCase();
  let hint = "";
  if (text.includes("отсутствует startevent")) hint = "Добавь стартовое событие процесса";
  else if (text.includes("отсутствует endevent")) hint = "Добавь финальное событие процесса";
  else if (text.includes("start event") || text.includes("startevent")) hint = "Поставь старт первым шагом";
  else if (text.includes("endevent")) hint = "Финиш перенеси в конец";
  else if (text.includes("gateway") && text.includes("вход") && text.includes("выход")) hint = "Добавь вход и выход gateway";
  else if (text.includes("gateway") && text.includes("услов")) hint = "Добавь условия перехода на ветках";
  else if (text.includes("недостижим")) hint = "Свяжи узел с предыдущим шагом";
  else if (text.includes("обрывает процесс")) hint = "Добавь исходящий sequence flow";
  else if (text.includes("неподдержанного") || text.includes("отсутствующего")) hint = "Проверь ссылку на BPMN узел";
  else if (text.includes("поряд") || text.includes("раньше")) hint = "Сверь порядок шагов с BPMN";
  else if (String(severity).toLowerCase() === "high") hint = "Исправь критичный разрыв в нотации";
  else hint = "Проверь корректность переходов в цепочке";
  return hint.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
}

function buildBpmnLogicHints(xmlText, interviewRaw = null, nodesRaw = null) {
  const raw = String(xmlText || "").trim();
  if (!raw || typeof DOMParser === "undefined") return [];

  let doc;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return [];
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return [];

  const allowed = new Set([
    "startevent",
    "endevent",
    "boundaryevent",
    "task",
    "usertask",
    "servicetask",
    "manualtask",
    "scripttask",
    "businessruletask",
    "sendtask",
    "receivetask",
    "callactivity",
    "subprocess",
    "adhocsubprocess",
    "exclusivegateway",
    "inclusivegateway",
    "eventbasedgateway",
    "parallelgateway",
    "intermediatecatchevent",
    "intermediatethrowevent",
    "intermediateevent",
  ]);

  const nodeTypeById = {};
  const nodeNameById = {};
  const laneNameByNodeId = {};
  const laneInfoByKey = {};
  const allNodeIds = [];
  Array.from(doc.getElementsByTagName("*")).forEach((el) => {
    const local = String(el.localName || "").toLowerCase();
    if (!allowed.has(local)) return;
    const id = toNodeId(el.getAttribute("id"));
    if (!id || nodeTypeById[id]) return;
    nodeTypeById[id] = local;
    nodeNameById[id] = String(el.getAttribute("name") || "").trim() || id;
    allNodeIds.push(id);
  });
  if (!allNodeIds.length) return [];

  getElementsByLocalNames(doc, ["lane"]).forEach((lane) => {
    const laneName =
      String(lane.getAttribute("name") || "").trim()
      || String(lane.getAttribute("id") || "").trim();
    if (!laneName) return;
    const laneKey = normalizeLoose(laneName);
    const refs = getElementsByLocalNames(lane, ["flowNodeRef"])
      .map((ref) => toNodeId(ref.textContent))
      .filter((id) => !!id && Object.prototype.hasOwnProperty.call(nodeTypeById, id));
    if (!laneInfoByKey[laneKey]) {
      laneInfoByKey[laneKey] = { name: laneName, refs: [] };
    }
    refs.forEach((id) => {
      laneNameByNodeId[id] = laneName;
      if (!laneInfoByKey[laneKey].refs.includes(id)) laneInfoByKey[laneKey].refs.push(id);
    });
  });

  const outDeg = {};
  const inDeg = {};
  const nextByNode = {};
  allNodeIds.forEach((id) => {
    outDeg[id] = 0;
    inDeg[id] = 0;
    nextByNode[id] = [];
  });

  const outgoingFlowsByNode = {};
  const defaultFlowByGateway = {};
  getElementsByLocalNames(doc, ["exclusivegateway", "inclusivegateway", "eventbasedgateway", "parallelgateway"]).forEach((el) => {
    const id = toNodeId(el.getAttribute("id"));
    if (!id) return;
    const def = toNodeId(el.getAttribute("default"));
    if (def) defaultFlowByGateway[id] = def;
  });

  const issues = [];
  const issueKey = new Set();
  const scoreBySeverity = { high: 10, medium: 6, low: 3 };
  const addIssue = (nodeId, severity, reason) => {
    const nid = toNodeId(nodeId);
    if (!nid) return;
    const sev = ["high", "medium", "low"].includes(String(severity || "")) ? severity : "medium";
    const text = String(reason || "").trim();
    if (!text) return;
    const key = `${nid}::${sev}::${text.toLowerCase()}`;
    if (issueKey.has(key)) return;
    issueKey.add(key);
    issues.push({
      nodeId: nid,
      title: String(nodeNameById[nid] || nid),
      score: scoreBySeverity[sev] || 6,
      severity: sev,
      aiHint: buildLogicAiHint(text, sev),
      reasons: [text],
      elementIds: [nid, safeBpmnId(nid)],
    });
  };

  getElementsByLocalNames(doc, ["sequenceflow"]).forEach((el) => {
    const fid = toNodeId(el.getAttribute("id"));
    const src = toNodeId(el.getAttribute("sourceRef"));
    const dst = toNodeId(el.getAttribute("targetRef"));
    if (!src || !dst) return;

    const srcKnown = Object.prototype.hasOwnProperty.call(nodeTypeById, src);
    const dstKnown = Object.prototype.hasOwnProperty.call(nodeTypeById, dst);
    if (!srcKnown && dstKnown) {
      addIssue(dst, "high", "Входящая связь приходит из отсутствующего/неподдержанного BPMN-узла.");
      return;
    }
    if (srcKnown && !dstKnown) {
      addIssue(src, "high", "Исходящая связь ведёт в отсутствующий/неподдержанный BPMN-узел.");
      return;
    }
    if (!srcKnown || !dstKnown) return;

    outDeg[src] += 1;
    inDeg[dst] += 1;
    nextByNode[src].push(dst);
    if (!outgoingFlowsByNode[src]) outgoingFlowsByNode[src] = [];
    outgoingFlowsByNode[src].push({
      id: fid,
      name: String(el.getAttribute("name") || "").trim(),
    });
  });

  const startIds = allNodeIds.filter((id) => nodeTypeById[id] === "startevent");
  const endIds = allNodeIds.filter((id) => nodeTypeById[id] === "endevent");

  if (startIds.length === 0) addIssue(allNodeIds[0], "high", "В процессе отсутствует startEvent.");
  if (endIds.length === 0) addIssue(allNodeIds[0], "high", "В процессе отсутствует endEvent.");

  allNodeIds.forEach((id) => {
    const type = String(nodeTypeById[id] || "");
    const indeg = Number(inDeg[id] || 0);
    const outdeg = Number(outDeg[id] || 0);

    if (type === "startevent") {
      if (indeg > 0) addIssue(id, "high", "У startEvent не должно быть входящих sequenceFlow.");
      if (outdeg === 0) addIssue(id, "high", "У startEvent отсутствует исходящий sequenceFlow.");
      return;
    }

    if (type === "endevent") {
      if (indeg === 0) addIssue(id, "high", "У endEvent отсутствует входящий sequenceFlow.");
      if (outdeg > 0) addIssue(id, "high", "У endEvent не должно быть исходящих sequenceFlow.");
      return;
    }

    if (type === "boundaryevent") {
      if (indeg > 0) addIssue(id, "high", "У boundaryEvent не должно быть входящих sequenceFlow.");
      return;
    }

    if (type.includes("gateway")) {
      if (indeg === 0 || outdeg === 0) addIssue(id, "high", "Gateway разрывает цепочку: требуется и вход, и выход.");
      if (type === "parallelgateway" && indeg <= 1 && outdeg <= 1) {
        addIssue(id, "medium", "Parallel gateway с 1 входом и 1 выходом обычно не нужен.");
      }
      if ((type === "exclusivegateway" || type === "inclusivegateway" || type === "eventbasedgateway") && indeg <= 1 && outdeg <= 1) {
        addIssue(id, "medium", "Gateway не выполняет развилку/слияние (только 1 вход и 1 выход).");
      }
      if ((type === "exclusivegateway" || type === "inclusivegateway") && outdeg > 1) {
        const outs = asArray(outgoingFlowsByNode[id]);
        const named = outs.filter((f) => String(f?.name || "").trim());
        const hasDefault = !!defaultFlowByGateway[id] && outs.some((f) => toNodeId(f?.id) === defaultFlowByGateway[id]);
        if (!named.length && !hasDefault) {
          addIssue(id, "medium", "У gateway с несколькими выходами нет условий на sequenceFlow и нет default-ветки.");
        }
      }
      return;
    }

    if (indeg === 0) addIssue(id, "high", "Узел недостижим: нет входящих sequenceFlow.");
    if (outdeg === 0) addIssue(id, "high", "Узел обрывает процесс: нет исходящих sequenceFlow.");
  });

  if (startIds.length > 0) {
    const reachable = new Set();
    const queue = [...startIds];
    while (queue.length) {
      const cur = queue.shift();
      if (!cur || reachable.has(cur)) continue;
      reachable.add(cur);
      asArray(nextByNode[cur]).forEach((nxt) => {
        if (!reachable.has(nxt)) queue.push(nxt);
      });
    }
    allNodeIds.forEach((id) => {
      if (reachable.has(id)) return;
      addIssue(id, "high", "Узел недостижим от startEvent по sequenceFlow.");
    });
  }

  const iv = interviewRaw && typeof interviewRaw === "object" && !Array.isArray(interviewRaw) ? interviewRaw : {};
  const interviewSteps = asArray(iv.steps);
  if (interviewSteps.length) {
    const rankByNodeId = {};
    allNodeIds.forEach((nid, idx) => {
      rankByNodeId[nid] = idx;
    });

    const titleToIds = {};
    allNodeIds.forEach((nid) => {
      const key = normalizeLoose(nodeNameById[nid]);
      if (!key) return;
      if (!titleToIds[key]) titleToIds[key] = [];
      titleToIds[key].push(nid);
    });
    asArray(nodesRaw).forEach((n) => {
      const nid = toNodeId(n?.id);
      const key = normalizeLoose(n?.title || n?.name || "");
      if (!nid || !key) return;
      if (!titleToIds[key]) titleToIds[key] = [];
      if (!titleToIds[key].includes(nid)) titleToIds[key].push(nid);
    });

    const mapped = interviewSteps
      .map((step, idx) => {
        const explicit = toNodeId(step?.node_id || step?.nodeId);
        if (explicit && Object.prototype.hasOwnProperty.call(rankByNodeId, explicit)) {
          return { seq: idx + 1, nodeId: explicit };
        }
        const actionKey = normalizeLoose(step?.action || "");
        const hits = asArray(titleToIds[actionKey]).filter((x) => Object.prototype.hasOwnProperty.call(rankByNodeId, x));
        if (hits.length === 1) return { seq: idx + 1, nodeId: hits[0] };
        return null;
      })
      .filter(Boolean);

    for (let i = 1; i < mapped.length; i += 1) {
      const prev = mapped[i - 1];
      const cur = mapped[i];
      if (Number(rankByNodeId[cur.nodeId]) < Number(rankByNodeId[prev.nodeId])) {
        addIssue(cur.nodeId, "medium", `Шаг ${cur.seq} в Interview стоит раньше шага ${prev.seq} относительно BPMN-порядка.`);
      }
    }

    const startAt = mapped.findIndex((x) => String(nodeTypeById[x.nodeId] || "") === "startevent");
    if (startIds.length > 0 && startAt < 0) {
      addIssue(startIds[0], "high", "StartEvent отсутствует в шагах Interview.");
    }
    if (startAt > 0) {
      addIssue(mapped[startAt].nodeId, "high", "StartEvent в Interview должен идти первым шагом.");
    }
    const endAt = mapped.findIndex((x) => String(nodeTypeById[x.nodeId] || "") === "endevent");
    if (endIds.length > 0 && endAt < 0) {
      addIssue(endIds[0], "high", "EndEvent отсутствует в шагах Interview.");
    }
    if (endAt >= 0 && endAt !== mapped.length - 1) {
      addIssue(mapped[endAt].nodeId, "medium", "EndEvent в Interview должен идти последним шагом.");
    }

    const coveredLaneKeys = new Set(
      mapped
        .map((x) => normalizeLoose(laneNameByNodeId[x.nodeId] || ""))
        .filter(Boolean),
    );
    Object.values(laneInfoByKey).forEach((laneInfo) => {
      const laneKey = normalizeLoose(laneInfo?.name);
      if (!laneKey || !asArray(laneInfo?.refs).length) return;
      if (coveredLaneKeys.has(laneKey)) return;
      const anchorNode = asArray(laneInfo.refs).find((id) => Object.prototype.hasOwnProperty.call(nodeTypeById, id))
        || asArray(laneInfo.refs)[0]
        || allNodeIds[0];
      addIssue(anchorNode, "medium", `В Interview нет шагов из лайна «${laneInfo.name}».`);
    });
  }

  return issues.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.title || "").localeCompare(String(b.title || ""), "ru"));
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsText(file);
  });
}

function getElementsByLocalNames(root, names) {
  const set = new Set(asArray(names).map((x) => String(x || "").toLowerCase()));
  return Array.from(root.getElementsByTagName("*")).filter((el) => set.has(String(el.localName || "").toLowerCase()));
}

function inferInterviewType(node) {
  const fromParams = String(node?.parameters?.interview_step_type || "").toLowerCase();
  if (isNativeSubprocessStepType(fromParams)) return fromParams;
  const nodeType = String(node?.type || "").toLowerCase();
  const title = String(node?.title || "").toLowerCase();
  if (nodeType === "timer") return "waiting";
  if (nodeType === "message") return "movement";
  if (nodeType === "decision" || nodeType === "fork" || nodeType === "join") return "operation";
  if (/qc|quality|контрол|проверк/.test(title)) return "qc";
  return "operation";
}

function isControlLikeTitle(v) {
  const s = String(v || "").toLowerCase().trim();
  if (!s) return false;
  if (s.startsWith("gateway_")) return true;
  if (s === "end" || s === "finish") return true;
  if (/\?$/.test(s)) return true;
  return /провер|контрол|qc|quality|audit|review|approve|validation|gate/.test(s);
}

function isNegativeOutcomeTitle(v) {
  const s = String(v || "").toLowerCase().trim();
  if (!s) return false;
  return /списани|утилиз|брак|reject|отклон|fail/.test(s);
}

function pickFinishBoundary(steps, endName) {
  const timeline = asArray(steps);
  const cleanEnd = String(endName || "").trim();

  const nonGateway = timeline.filter((s) => {
    const a = String(s?.action || "").trim();
    return a && !/^gateway_/i.test(a);
  });
  const positive = nonGateway.filter((s) => !isControlLikeTitle(s?.action) && !isNegativeOutcomeTitle(s?.action));
  const backup = nonGateway.filter((s) => !isNegativeOutcomeTitle(s?.action));
  const finishStep = positive[positive.length - 1] || backup[backup.length - 1] || nonGateway[nonGateway.length - 1] || timeline[timeline.length - 1] || {};

  if (cleanEnd && !isControlLikeTitle(cleanEnd) && !isNegativeOutcomeTitle(cleanEnd)) {
    return {
      state: cleanEnd,
      shop: String(finishStep?.area || ""),
    };
  }

  return {
    state: String(finishStep?.action || cleanEnd || ""),
    shop: String(finishStep?.area || ""),
  };
}

function sortNodesInFlowOrder(nodes, edges) {
  const list = asArray(nodes);
  const rel = asArray(edges);
  if (!list.length) return [];

  const idx = new Map();
  list.forEach((n, i) => idx.set(String(n?.id || ""), i));

  const indeg = {};
  const out = {};
  list.forEach((n) => {
    const id = String(n?.id || "");
    indeg[id] = 0;
    out[id] = [];
  });

  rel.forEach((e) => {
    const from = String(e?.from_id || e?.from || "");
    const to = String(e?.to_id || e?.to || "");
    if (!from || !to) return;
    if (!(from in indeg) || !(to in indeg)) return;
    indeg[to] += 1;
    out[from].push(to);
  });

  const queue = list
    .map((n) => String(n?.id || ""))
    .filter((id) => id && indeg[id] === 0)
    .sort((a, b) => (idx.get(a) || 0) - (idx.get(b) || 0));

  const orderedIds = [];
  while (queue.length) {
    const cur = queue.shift();
    orderedIds.push(cur);
    asArray(out[cur]).forEach((nextId) => {
      indeg[nextId] -= 1;
      if (indeg[nextId] === 0) queue.push(nextId);
    });
    queue.sort((a, b) => (idx.get(a) || 0) - (idx.get(b) || 0));
  }

  if (orderedIds.length < list.length) {
    list
      .map((n) => String(n?.id || ""))
      .filter((id) => id && !orderedIds.includes(id))
      .forEach((id) => orderedIds.push(id));
  }

  const byId = {};
  list.forEach((n) => {
    const id = String(n?.id || "");
    if (id) byId[id] = n;
  });

  return orderedIds.map((id) => byId[id]).filter(Boolean);
}

function buildInterviewFromGraph(nodes, edges, startEvents, endEvents, commentByNodeRaw = {}, laneByNodeRaw = {}, startRoleHint = "", endRoleHint = "") {
  const graphNodes = asArray(nodes);
  const graphEdges = asArray(edges);
  const starts = asArray(startEvents);
  const ends = asArray(endEvents);
  const commentByNode = asObject(commentByNodeRaw);
  const laneByNode = asObject(laneByNodeRaw);

  const timelineNodes = sortNodesInFlowOrder(graphNodes, graphEdges).filter((n) => String(n?.id || "").trim());

  let steps = timelineNodes.map((n, i) => {
    const type = inferInterviewType(n);
    const duration = Number(n?.duration_min);
    const actor = String(n?.actor_role || "").trim();
    const bpmnKind = String(n?.parameters?.bpmn_kind || "").toLowerCase();
    const isStartEvent = bpmnKind === "startevent";
    const baseDuration = Number.isFinite(duration) && duration > 0
      ? Math.round(duration)
      : isStartEvent
        ? 0
        : type === "movement"
          ? 5
          : type === "qc"
            ? 10
            : type === "waiting"
              ? 0
              : 15;
    const waitDuration = type === "waiting" ? (baseDuration > 0 ? baseDuration : 10) : 0;
    return {
      id: String(n?.id || `step_${i + 1}`),
      node_id: String(n?.id || `step_${i + 1}`),
      area: actor,
      type,
      action: String(n?.title || n?.id || `Шаг ${i + 1}`),
      subprocess: String(n?.parameters?.interview_subprocess || ""),
      comment: String(commentByNode[String(n?.id || "")] || n?.parameters?.interview_comment || "").trim(),
      role: actor,
      duration_min: String(type === "waiting" ? 0 : baseDuration),
      wait_min: String(waitDuration),
      output: "",
    };
  });

  const startEvent = starts[0] || {};
  const startEventName = String(startEvent?.name || "").trim();
  const hasStartStepAlready = !!startEventName && steps.some((s) => normalizeLoose(s?.action) === normalizeLoose(startEventName));
  if (startEventName && !hasStartStepAlready) {
    const startNodeId = toNodeId(startEvent?.id);
    const eventLane = String(laneByNode[startNodeId] || "").trim();
    const startLane = eventLane || String(startRoleHint || "");
    steps = [
      {
        id: `iv_start_${startNodeId || "event"}`,
        node_id: startNodeId || "",
        area: startLane,
        type: "operation",
        action: startEventName,
        subprocess: "",
        comment: String(commentByNode[startNodeId] || "").trim(),
        role: startLane,
        duration_min: "0",
        wait_min: "0",
        output: "",
      },
      ...steps,
    ];
  }

  asArray(ends).forEach((ev, idx) => {
    const endNodeId = toNodeId(ev?.id);
    const endEventName = String(ev?.name || "").trim() || endNodeId || `Финиш ${idx + 1}`;
    const eventLane = String(laneByNode[endNodeId] || "").trim();
    const endLane = eventLane || String(endRoleHint || "");
    const hasEndStepAlready =
      (!!endNodeId && steps.some((s) => toNodeId(s?.node_id || s?.nodeId) === endNodeId))
      || (!!endEventName && steps.some((s) => normalizeLoose(s?.action) === normalizeLoose(endEventName)));
    if (hasEndStepAlready) return;
    steps = [
      ...steps,
      {
        id: `iv_end_${endNodeId || `event_${idx + 1}`}`,
        node_id: endNodeId || "",
        area: endLane,
        type: "operation",
        action: endEventName,
        subprocess: "",
        comment: String(commentByNode[endNodeId] || "").trim(),
        role: endLane,
        duration_min: "0",
        wait_min: "0",
        output: "",
      },
    ];
  });

  const firstStep = steps[0] || {};
  const startName = String(starts[0]?.name || "").trim();
  const endName = String(ends[0]?.name || "").trim();
  const finish = pickFinishBoundary(steps, endName);
  const transitions = graphEdges
    .map((e, idx) => {
      const fromId = toNodeId(e?.from_id || e?.from);
      const toId = toNodeId(e?.to_id || e?.to);
      if (!fromId || !toId) return null;
      return {
        id: String(e?.id || `tr_${idx + 1}`),
        from_node_id: fromId,
        to_node_id: toId,
        when: String(e?.when || "").trim(),
      };
    })
    .filter(Boolean);

  return {
    boundaries: {
      trigger: startName || "",
      start_shop: String(firstStep.area || startRoleHint || ""),
      input_physical: "",
      finish_state: String(finish.state || ""),
      finish_shop: String(finish.shop || endRoleHint || ""),
      output_physical: "",
    },
    steps,
    transitions,
    exceptions: [],
    ai_questions: {},
    ai_questions_by_element: {},
  };
}

function parseBpmnToSessionGraph(xmlText) {
  const raw = String(xmlText || "").trim();
  if (!raw) return { ok: false, error: "BPMN XML пустой." };

  let doc;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return { ok: false, error: "Не удалось распарсить BPMN XML." };
  }

  if (!doc || doc.getElementsByTagName("parsererror").length > 0) {
    return { ok: false, error: "BPMN XML содержит ошибки." };
  }

  const processEl = getElementsByLocalNames(doc, ["process"])[0];
  const processName = String(processEl?.getAttribute("name") || "").trim();
  const startEvents = getElementsByLocalNames(doc, ["startevent"]).map((el) => ({
    id: toNodeId(el.getAttribute("id")),
    name: String(el.getAttribute("name") || "").trim() || "Стартовое событие",
  }));
  const endEvents = getElementsByLocalNames(doc, ["endevent"]).map((el) => ({
    id: toNodeId(el.getAttribute("id")),
    name: String(el.getAttribute("name") || "").trim() || "Процесс завершён",
  }));
  const annotationTextById = {};
  getElementsByLocalNames(doc, ["textannotation"]).forEach((el) => {
    const annId = toNodeId(el.getAttribute("id"));
    if (!annId) return;
    const textEl = getElementsByLocalNames(el, ["text"])[0];
    const txt = String(textEl?.textContent || "").replace(/\r\n/g, "\n").trim();
    if (!txt) return;
    annotationTextById[annId] = txt;
  });
  const commentByNode = {};
  const addCommentByNode = (nodeId, comment) => {
    const nid = toNodeId(nodeId);
    const txt = String(comment || "").replace(/\r\n/g, "\n").trim();
    if (!nid || !txt) return;
    if (!commentByNode[nid]) {
      commentByNode[nid] = txt;
      return;
    }
    if (commentByNode[nid] === txt || commentByNode[nid].includes(txt)) return;
    commentByNode[nid] = `${commentByNode[nid]}\n${txt}`;
  };
  getElementsByLocalNames(doc, ["association"]).forEach((el) => {
    const sourceRef = toNodeId(el.getAttribute("sourceRef"));
    const targetRef = toNodeId(el.getAttribute("targetRef"));
    if (!sourceRef || !targetRef) return;
    if (annotationTextById[targetRef]) addCommentByNode(sourceRef, annotationTextById[targetRef]);
    if (annotationTextById[sourceRef]) addCommentByNode(targetRef, annotationTextById[sourceRef]);
  });

  const laneByNode = {};
  const laneNameById = {};
  const laneOrder = [];
  const seenLaneOrder = new Set();
  const pushLaneOrder = (nameRaw) => {
    const name = String(nameRaw || "").trim();
    if (!name) return;
    const key = normalizeLoose(name);
    if (!key || seenLaneOrder.has(key)) return;
    seenLaneOrder.add(key);
    laneOrder.push(name);
  };
  getElementsByLocalNames(doc, ["lane"]).forEach((lane) => {
    const laneId = toNodeId(lane.getAttribute("id"));
    const laneName =
      String(lane.getAttribute("name") || "").trim() ||
      String(lane.getAttribute("id") || "").trim() ||
      "";
    if (laneId && laneName) laneNameById[laneId] = laneName;
    if (laneName) pushLaneOrder(laneName);
    if (!laneName) return;
    getElementsByLocalNames(lane, ["flowNodeRef"]).forEach((ref) => {
      const nodeId = toNodeId(ref.textContent);
      if (!nodeId) return;
      laneByNode[nodeId] = laneName;
    });
  });

  const laneBoundsById = {};
  const nodeCentersById = {};
  getElementsByLocalNames(doc, ["bpmnshape"]).forEach((shape) => {
    const bpmnElement = toNodeId(shape.getAttribute("bpmnElement") || shape.getAttribute("bpmnelement"));
    if (!bpmnElement) return;
    const bounds = getElementsByLocalNames(shape, ["bounds"])[0];
    if (!bounds) return;
    const x = Number(bounds.getAttribute("x"));
    const y = Number(bounds.getAttribute("y"));
    const w = Number(bounds.getAttribute("width"));
    const h = Number(bounds.getAttribute("height"));
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return;

    if (laneNameById[bpmnElement]) {
      laneBoundsById[bpmnElement] = { x, y, w, h, area: w * h };
      return;
    }
    nodeCentersById[bpmnElement] = { cx: x + w / 2, cy: y + h / 2 };
  });

  const laneIds = Object.keys(laneBoundsById);
  if (laneIds.length) {
    Object.keys(nodeCentersById).forEach((nid) => {
      if (laneByNode[nid]) return;
      const c = nodeCentersById[nid];
      const hits = laneIds
        .filter((lid) => {
          const b = laneBoundsById[lid];
          return c.cx >= b.x && c.cx <= b.x + b.w && c.cy >= b.y && c.cy <= b.y + b.h;
        })
        .map((lid) => ({ lid, area: laneBoundsById[lid].area }))
        .sort((a, b) => a.area - b.area);
      if (!hits.length) return;
      const laneName = String(laneNameById[hits[0].lid] || "").trim();
      if (laneName) {
        laneByNode[nid] = laneName;
        pushLaneOrder(laneName);
      }
    });
  }

  const nodes = [];
  const nodeById = new Map();
  const shapeExpandedByElement = {};
  getElementsByLocalNames(doc, ["bpmnshape"]).forEach((shape) => {
    const elRef = toNodeId(shape.getAttribute("bpmnElement") || shape.getAttribute("bpmnelement"));
    if (!elRef) return;
    const expandedRaw = String(shape.getAttribute("isExpanded") || shape.getAttribute("isexpanded") || "").trim().toLowerCase();
    if (!expandedRaw) return;
    shapeExpandedByElement[elRef] = expandedRaw !== "false" && expandedRaw !== "0" && expandedRaw !== "no";
  });
  const parentSubprocessName = (el) => {
    let cur = el?.parentNode || null;
    while (cur && cur.nodeType === 1) {
      const name = String(cur.localName || "").toLowerCase();
      if (name === "subprocess") {
        return String(cur.getAttribute?.("name") || cur.getAttribute?.("id") || "").trim();
      }
      cur = cur.parentNode || null;
    }
    return "";
  };
  const addNode = (el, mappedType, extraParams = {}) => {
    const nodeId = toNodeId(el.getAttribute("id"));
    if (!nodeId || nodeById.has(nodeId)) return;
    const title = String(el.getAttribute("name") || "").trim() || nodeId;
    const actorRole = String(laneByNode[nodeId] || "").trim() || null;
    const subprocess = parentSubprocessName(el);
    const params = { bpmn_kind: String(el?.localName || "").toLowerCase() };
    if (subprocess) params.interview_subprocess = subprocess;
    Object.keys(asObject(extraParams)).forEach((k) => {
      params[k] = extraParams[k];
    });
    const node = {
      id: nodeId,
      type: mappedType,
      title,
      actor_role: actorRole,
      equipment: [],
      parameters: params,
      duration_min: null,
      qc: [],
      exceptions: [],
      disposition: {},
      evidence: [],
      confidence: 0.6,
    };
    nodeById.set(nodeId, node);
    nodes.push(node);
  };

  const stepLikeNames = [
    "task",
    "usertask",
    "servicetask",
    "manualtask",
    "scripttask",
    "businessruletask",
    "sendtask",
    "receivetask",
    "callactivity",
    "subprocess",
    "adhocsubprocess",
  ];
  getElementsByLocalNames(doc, stepLikeNames).forEach((el) => {
    const local = String(el?.localName || "").toLowerCase();
    if (local === "subprocess") {
      const expanded = Object.prototype.hasOwnProperty.call(shapeExpandedByElement, toNodeId(el.getAttribute("id")))
        ? !!shapeExpandedByElement[toNodeId(el.getAttribute("id"))]
        : true;
      addNode(el, "step", { interview_step_type: expanded ? "subprocess_expanded" : "subprocess_collapsed" });
      return;
    }
    if (local === "adhocsubprocess") {
      const expanded = Object.prototype.hasOwnProperty.call(shapeExpandedByElement, toNodeId(el.getAttribute("id")))
        ? !!shapeExpandedByElement[toNodeId(el.getAttribute("id"))]
        : true;
      addNode(el, "step", { interview_step_type: expanded ? "adhoc_subprocess_expanded" : "adhoc_subprocess_collapsed" });
      return;
    }
    addNode(el, "step");
  });
  getElementsByLocalNames(doc, ["exclusivegateway", "inclusivegateway", "eventbasedgateway"]).forEach((el) => addNode(el, "decision"));
  getElementsByLocalNames(doc, ["parallelgateway"]).forEach((el) => addNode(el, "fork"));
  getElementsByLocalNames(doc, ["intermediatecatchevent"]).forEach((el) => {
    const hasTimer = getElementsByLocalNames(el, ["timerEventDefinition"]).length > 0;
    const hasMessage = getElementsByLocalNames(el, ["messageEventDefinition"]).length > 0;
    addNode(el, hasTimer ? "timer" : hasMessage ? "message" : "step");
  });
  getElementsByLocalNames(doc, ["intermediatethrowevent"]).forEach((el) => {
    const hasTimer = getElementsByLocalNames(el, ["timerEventDefinition"]).length > 0;
    const hasMessage = getElementsByLocalNames(el, ["messageEventDefinition"]).length > 0;
    addNode(el, hasTimer ? "timer" : hasMessage ? "message" : "step");
  });

  const edges = [];
  getElementsByLocalNames(doc, ["sequenceflow"]).forEach((el) => {
    const from = toNodeId(el.getAttribute("sourceRef"));
    const to = toNodeId(el.getAttribute("targetRef"));
    if (!from || !to) return;
    if (!nodeById.has(from) || !nodeById.has(to)) return;
    edges.push({
      from_id: from,
      to_id: to,
      when: String(el.getAttribute("name") || "").trim() || null,
    });
  });

  nodes.forEach((n) => {
    const actor = String(n?.actor_role || "").trim();
    if (actor) pushLaneOrder(actor);
  });
  const startRoleByEvent = startEvents
    .map((ev) => String(laneByNode[toNodeId(ev?.id)] || "").trim())
    .find(Boolean);
  const endRoleByEvent = endEvents
    .map((ev) => String(laneByNode[toNodeId(ev?.id)] || "").trim())
    .find(Boolean);
  const fallbackNodeRole = nodes.map((n) => String(n?.actor_role || "").trim()).find(Boolean);
  const roles = laneOrder.filter(Boolean);
  const start_role = (startRoleByEvent || roles[0] || fallbackNodeRole || "").trim();
  const end_role = (endRoleByEvent || roles[roles.length - 1] || fallbackNodeRole || "").trim();

  const interview = buildInterviewFromGraph(nodes, edges, startEvents, endEvents, commentByNode, laneByNode, start_role, end_role);
  return { ok: true, title: processName, nodes, edges, interview, roles, start_role };
}

function buildClarificationHints(questionsRaw, nodesRaw) {
  const questions = asArray(questionsRaw);
  const nodes = asArray(nodesRaw);
  const openQuestions = questions.filter((q) => String(q?.status || "open").toLowerCase() === "open");
  const llmQuestions = openQuestions.filter((q) => String(q?.id || "").startsWith("llm_"));
  const validatorQuestions = openQuestions.filter((q) => !String(q?.id || "").startsWith("llm_"));
  const titleByNode = {};
  nodes.forEach((n) => {
    const nid = toNodeId(n?.id);
    if (!nid) return;
    titleByNode[nid] = String(n?.title || n?.name || nid).trim() || nid;
  });

  const byNode = {};
  openQuestions.forEach((q) => {
    const status = String(q?.status || "open").toLowerCase();
    if (status !== "open") return;
    const nodeId = toNodeId(q?.node_id || q?.nodeId);
    if (!nodeId) return;
    if (!byNode[nodeId]) {
      byNode[nodeId] = {
        nodeId,
        title: titleByNode[nodeId] || nodeId,
        total: 0,
        critical: 0,
        questions: [],
      };
    }
    byNode[nodeId].total += 1;
    if (String(q?.issue_type || "").toUpperCase() === "CRITICAL") {
      byNode[nodeId].critical += 1;
    }
    const text = String(q?.question || q?.text || "").trim();
    if (text) byNode[nodeId].questions.push(text);
  });

  const issueStats = {};
  let hasLlm = false;
  openQuestions.forEach((q) => {
    const issue = String(q?.issue_type || "UNKNOWN").toUpperCase();
    issueStats[issue] = (issueStats[issue] || 0) + 1;
    if (String(q?.id || "").startsWith("llm_")) hasLlm = true;
  });

  const hints = Object.values(byNode)
    .map((it) => {
      const severity = it.critical > 0 ? "high" : it.total >= 3 ? "medium" : "low";
      const score = it.critical > 0 ? 9 + it.critical : 4 + it.total;
      const reasons = [`открытых вопросов: ${it.total}`];
      if (it.critical > 0) reasons.push(`критических: ${it.critical}`);
      if (it.questions[0]) reasons.push(`пример: ${it.questions[0]}`);
      return {
        nodeId: it.nodeId,
        title: it.title,
        score,
        severity,
        reasons,
        elementIds: [it.nodeId, safeBpmnId(it.nodeId)],
      };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 12);

  const byNodeValidators = {};
  validatorQuestions.forEach((q) => {
    const nodeId = toNodeId(q?.node_id || q?.nodeId);
    if (!nodeId) return;
    if (!byNodeValidators[nodeId]) {
      byNodeValidators[nodeId] = {
        nodeId,
        title: titleByNode[nodeId] || nodeId,
        total: 0,
        critical: 0,
        questions: [],
      };
    }
    byNodeValidators[nodeId].total += 1;
    if (String(q?.issue_type || "").toUpperCase() === "CRITICAL") {
      byNodeValidators[nodeId].critical += 1;
    }
    const text = String(q?.question || q?.text || "").trim();
    if (text) byNodeValidators[nodeId].questions.push(text);
  });

  const byNodeLlm = {};
  llmQuestions.forEach((q) => {
    const nodeId = toNodeId(q?.node_id || q?.nodeId);
    if (!nodeId) return;
    if (!byNodeLlm[nodeId]) {
      byNodeLlm[nodeId] = {
        nodeId,
        title: titleByNode[nodeId] || nodeId,
        total: 0,
        questions: [],
      };
    }
    byNodeLlm[nodeId].total += 1;
    const text = String(q?.question || q?.text || "").trim();
    if (text) byNodeLlm[nodeId].questions.push(text);
  });

  const list = Object.values(byNodeValidators)
    .map((it) => ({
      nodeId: it.nodeId,
      title: it.title,
      total: it.total,
      critical: it.critical,
      questions: it.questions.slice(0, 3),
    }))
    .sort((a, b) => b.critical - a.critical || b.total - a.total || a.title.localeCompare(b.title));

  const llmList = Object.values(byNodeLlm)
    .map((it) => ({
      nodeId: it.nodeId,
      title: it.title,
      total: it.total,
      questions: it.questions.slice(0, 4),
    }))
    .sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));

  const criticalTotal = openQuestions.filter((q) => String(q?.issue_type || "").toUpperCase() === "CRITICAL").length;
  return {
    hints,
    list,
    openTotal: openQuestions.length,
    validatorOpenTotal: validatorQuestions.length,
    criticalTotal,
    hasLlm,
    llmOpenTotal: llmQuestions.length,
    issueStats,
    llmList,
  };
}

export {
  asArray,
  asObject,
  safeJson,
  interviewNodesFingerprint,
  interviewEdgesFingerprint,
  buildInterviewPatchPayload,
  normalizeLoose,
  sanitizeGraphNodes,
  interviewHasContent,
  interviewHasTimeline,
  isLikelySeedBpmnXml,
  mergeInterviewData,
  enrichInterviewWithNodeBindings,
  toNodeId,
  applyInterviewTransitionsToEdges,
  mergeNodesById,
  mergeEdgesByKey,
  buildBottleneckHints,
  buildBpmnLogicHints,
  readFileText,
  parseBpmnToSessionGraph,
  buildClarificationHints,
};
