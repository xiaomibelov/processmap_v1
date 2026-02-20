
export const STORAGE_PREFIX = "fpc_interview_v1_";
export const UI_PREFS_PREFIX = "fpc_interview_ui_v1_";

export const STEP_TYPES = [
  { value: "operation", label: "операция" },
  { value: "movement", label: "перемещение" },
  { value: "waiting", label: "ожидание" },
  { value: "qc", label: "QC" },
  { value: "subprocess_collapsed", label: "подпроцесс (свернутый)" },
  { value: "subprocess_expanded", label: "подпроцесс (развернутый)" },
  { value: "adhoc_subprocess_collapsed", label: "ad-hoc подпроцесс (свернутый)" },
  { value: "adhoc_subprocess_expanded", label: "ad-hoc подпроцесс (развернутый)" },
];

export const AI_STATUS = ["неизвестно", "уточнить", "подтверждено"];
export const AI_ATTACH_STATUS = ["open", "done"];
export const AI_ANNOTATION_START = "[AI_QUESTIONS]";
export const AI_ANNOTATION_END = "[/AI_QUESTIONS]";
export const SHOW_AI_QUESTIONS_BLOCK = false;
export const DEFAULT_TIMELINE_FILTERS = {
  query: "",
  lane: "all",
  type: "all",
  subprocess: "all",
  bind: "all", // all|bound|missing
  annotation: "all", // all|with|without
};
export const TIMELINE_OPTIONAL_COLUMNS = [
  { key: "t_plus", label: "T+" },
  { key: "area", label: "Цех/участок" },
  { key: "lane", label: "Лайн" },
  { key: "subprocess", label: "Подпроцесс" },
  { key: "type", label: "Тип шага" },
  { key: "node", label: "Узел BPMN" },
  { key: "comment", label: "Аннотация BPMN" },
  { key: "role", label: "Роль" },
  { key: "duration", label: "Длительность (мин)" },
  { key: "wait", label: "Ожидание (мин)" },
  { key: "output", label: "Выход шага (физически)" },
];
export const DEFAULT_HIDDEN_TIMELINE_COLUMNS = {
  // By default keep only BPMN-direct columns visible in Interview:
  // `lane` (lane/actor binding), `node` (BPMN node binding)
  // and `comment` (BPMN text annotation).
  // All other columns are hidden and can be enabled from "Фильтр".
  t_plus: true,
  area: true,
  lane: false,
  subprocess: true,
  type: true,
  node: false,
  comment: false,
  role: true,
  duration: true,
  wait: true,
  output: true,
};

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function toArray(x) {
  return Array.isArray(x) ? x : [];
}

export function toText(v) {
  return String(v || "").trim();
}

export function shortErr(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return s.length > 180 ? `${s.slice(0, 180)}…` : s;
}

export function mapBackendQuestionStatus(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "answered") return "подтверждено";
  if (s === "open") return "уточнить";
  return "неизвестно";
}

export function mapLlmQuestionToInterview(q) {
  const text = toText(q?.question || q?.text);
  if (!text) return null;
  return {
    id: toText(q?.id) || uid("q"),
    text,
    status: mapBackendQuestionStatus(q?.status),
    on_diagram: false,
  };
}

function normalizeAiAttachStatus(statusRaw) {
  const status = toText(statusRaw).toLowerCase();
  return AI_ATTACH_STATUS.includes(status) ? status : "open";
}

export function normalizeAiQuestionsByElementMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).forEach((rawElementId) => {
    const elementId = toText(rawElementId);
    if (!elementId) return;
    const rawEntry = value[rawElementId];
    const rawList = Array.isArray(rawEntry)
      ? rawEntry
      : (Array.isArray(rawEntry?.items) ? rawEntry.items : []);
    const byQid = {};
    rawList.forEach((rawItem, idx) => {
      const item = rawItem && typeof rawItem === "object" ? rawItem : {};
      const text = toText(item?.text || item?.question || item?.label);
      const qid = toText(item?.qid || item?.id || item?.question_id || item?.questionId);
      if (!text && !qid) return;
      const key = qid || `q_${idx + 1}_${normalizeLoose(text).slice(0, 36) || "untitled"}`;
      const prev = byQid[key] || null;
      const createdAtRaw = item?.createdAt ?? item?.created_at ?? item?.ts ?? Date.now();
      const createdAtNum = Number(createdAtRaw);
      byQid[key] = {
        qid: key,
        text: text || toText(prev?.text),
        comment: toText(item?.comment || item?.answer || prev?.comment),
        status: normalizeAiAttachStatus(item?.status || prev?.status),
        createdAt: Number.isFinite(createdAtNum) && createdAtNum > 0 ? createdAtNum : Number(prev?.createdAt || Date.now()),
        source: toText(item?.source || prev?.source || "ai"),
        stepId: toText(item?.stepId || item?.step_id || prev?.stepId),
      };
    });
    const list = Object.values(byQid)
      .filter((item) => !!toText(item?.qid) && !!toText(item?.text))
      .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
    if (list.length) out[elementId] = list;
  });
  return out;
}

export function upsertAiQuestionsForElement(currentMap, elementId, selectedQuestions, options = {}) {
  const eid = toText(elementId);
  if (!eid) return { map: normalizeAiQuestionsByElementMap(currentMap), added: 0, total: 0 };
  const map = normalizeAiQuestionsByElementMap(currentMap);
  const now = Date.now();
  const stepId = toText(options?.stepId);
  const source = toText(options?.source || "ai");
  const incoming = toArray(selectedQuestions)
    .map((q) => ({
      qid: toText(q?.qid || q?.id || q?.question_id || q?.questionId),
      text: toText(q?.text || q?.question),
    }))
    .filter((q) => q.qid || q.text);

  const existing = toArray(map[eid]).map((item) => ({ ...item }));
  const byQid = {};
  const byText = {};
  existing.forEach((item) => {
    const key = toText(item?.qid);
    if (key) byQid[key] = item;
    const textKey = normalizeLoose(item?.text);
    if (textKey) byText[textKey] = item;
  });

  let added = 0;
  incoming.forEach((item, idx) => {
    const qid = item.qid || `q_${idx + 1}_${normalizeLoose(item.text).slice(0, 36) || "untitled"}`;
    const textKey = normalizeLoose(item.text);
    const found = byQid[qid] || (textKey ? byText[textKey] : null);
    if (found) {
      found.qid = qid;
      if (item.text) found.text = item.text;
      if (!toText(found?.stepId) && stepId) found.stepId = stepId;
      if (!toText(found?.source) && source) found.source = source;
      return;
    }
    const next = {
      qid,
      text: item.text || qid,
      comment: "",
      status: "open",
      createdAt: now + idx,
      source: source || "ai",
      stepId,
    };
    existing.push(next);
    byQid[qid] = next;
    if (textKey) byText[textKey] = next;
    added += 1;
  });

  const nextList = existing
    .map((item) => ({
      qid: toText(item?.qid),
      text: toText(item?.text),
      comment: toText(item?.comment),
      status: normalizeAiAttachStatus(item?.status),
      createdAt: Number(item?.createdAt || 0) || now,
      source: toText(item?.source || "ai"),
      stepId: toText(item?.stepId || item?.step_id),
    }))
    .filter((item) => !!item.qid && !!item.text)
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

  return {
    map: {
      ...map,
      [eid]: nextList,
    },
    added,
    total: nextList.length,
  };
}

export function splitCommentAndAiBlock(commentRaw) {
  const source = String(commentRaw || "");
  const start = source.indexOf(AI_ANNOTATION_START);
  const end = source.indexOf(AI_ANNOTATION_END);
  if (start < 0 || end < 0 || end < start) {
    return { manual: source.trim(), aiLines: [] };
  }
  const manual = `${source.slice(0, start)}${source.slice(end + AI_ANNOTATION_END.length)}`.trim();
  const body = source.slice(start + AI_ANNOTATION_START.length, end);
  const aiLines = body
    .split("\n")
    .map((x) => x.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);
  return { manual, aiLines };
}

export function composeCommentWithAi(manualRaw, questionsRaw) {
  const manual = String(manualRaw || "").trim();
  const qs = toArray(questionsRaw).map((x) => toText(x)).filter(Boolean);
  if (!qs.length) return manual;
  const block = `${AI_ANNOTATION_START}\n${qs.map((q) => `- ${q}`).join("\n")}\n${AI_ANNOTATION_END}`;
  return manual ? `${manual}\n\n${block}` : block;
}

export function normalizeLoose(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function safeNodeId(raw) {
  let s = String(raw || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!s) s = `n_${Date.now().toString(36)}`;
  if (!/^[A-Za-z_]/.test(s)) s = `n_${s}`;
  return s;
}

export function mapStepTypeToNodeType(stepType) {
  const t = String(stepType || "").toLowerCase();
  if (t === "waiting") return "timer";
  if (t === "movement") return "message";
  return "step";
}

export function toNonNegativeInt(v) {
  const s = String(v ?? "").replace(",", ".").trim();
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export function canonicalize(value) {
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

export function stableJson(value) {
  try {
    return JSON.stringify(canonicalize(value));
  } catch {
    return "{}";
  }
}

export function localKey(sessionId) {
  return `${STORAGE_PREFIX}${String(sessionId || "")}`;
}

export function localUiKey(sessionId) {
  return `${UI_PREFS_PREFIX}${String(sessionId || "")}`;
}

export function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

export function emptyInterview() {
  return {
    boundaries: {
      trigger: "",
      start_shop: "",
      intermediate_roles: "",
      input_physical: "",
      finish_state: "",
      finish_shop: "",
      output_physical: "",
    },
    steps: [],
    transitions: [],
    subprocesses: [],
    exceptions: [],
    ai_questions: {},
    ai_questions_by_element: {},
    prep_questions: [],
  };
}

export function emptyStep(type = "operation") {
  if (type === "movement") {
    return {
      id: uid("step"),
      node_id: "",
      area: "",
      type,
      action: "Переместить полуфабрикат",
      subprocess: "",
      comment: "",
      role: "",
      duration_min: "5",
      wait_min: "0",
      output: "",
    };
  }
  if (type === "waiting") {
    return {
      id: uid("step"),
      node_id: "",
      area: "",
      type,
      action: "Ожидание очереди/ресурса",
      subprocess: "",
      comment: "",
      role: "",
      duration_min: "0",
      wait_min: "20",
      output: "",
    };
  }
  if (type === "qc") {
    return {
      id: uid("step"),
      node_id: "",
      area: "",
      type,
      action: "Проверить качество партии",
      subprocess: "",
      comment: "",
      role: "",
      duration_min: "10",
      wait_min: "0",
      output: "",
    };
  }
  if (type === "subprocess_collapsed") {
    return {
      id: uid("step"),
      node_id: "",
      area: "",
      type,
      action: "Подпроцесс",
      subprocess: "",
      comment: "",
      role: "",
      duration_min: "20",
      wait_min: "0",
      output: "",
    };
  }
  if (type === "subprocess_expanded") {
    return {
      id: uid("step"),
      node_id: "",
      area: "",
      type,
      action: "Подпроцесс (детализированный)",
      subprocess: "",
      comment: "",
      role: "",
      duration_min: "25",
      wait_min: "0",
      output: "",
    };
  }
  if (type === "adhoc_subprocess_collapsed") {
    return {
      id: uid("step"),
      node_id: "",
      area: "",
      type,
      action: "Ad-hoc подпроцесс",
      subprocess: "",
      comment: "",
      role: "",
      duration_min: "20",
      wait_min: "0",
      output: "",
    };
  }
  if (type === "adhoc_subprocess_expanded") {
    return {
      id: uid("step"),
      node_id: "",
      area: "",
      type,
      action: "Ad-hoc подпроцесс (детализированный)",
      subprocess: "",
      comment: "",
      role: "",
      duration_min: "25",
      wait_min: "0",
      output: "",
    };
  }

  return {
    id: uid("step"),
    node_id: "",
    area: "",
    type,
    action: "",
    subprocess: "",
    comment: "",
    role: "",
    duration_min: "15",
    wait_min: "0",
    output: "",
  };
}

export function emptyException(stepSeq = "") {
  return {
    id: uid("exc"),
    step_seq: stepSeq,
    situation: "",
    trigger: "",
    actions: "",
    add_min: "",
    owner: "",
  };
}

export function statusClass(status) {
  if (status === "подтверждено") return "ok";
  if (status === "уточнить") return "warn";
  return "muted";
}

export function typeLabel(type) {
  const hit = STEP_TYPES.find((x) => x.value === type);
  return hit ? hit.label : type;
}

export function durationClass(min) {
  if (min > 30) return "hi";
  if (min >= 10) return "mid";
  return "low";
}

export function durationLabel(min) {
  if (min > 30) return ">30";
  if (min >= 10) return "10-30";
  return "<10";
}

export function round1(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

export function percent(part, total) {
  const p = Number(part);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
  return round1((p / t) * 100);
}

export function formatPercent(v) {
  const n = round1(v);
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
}

export function laneColor(key, idx) {
  const laneIdx = Number(idx);
  if (Number.isFinite(laneIdx) && laneIdx > 0) {
    // Golden-angle palette: stable and non-repeating for practical lane counts.
    const hue = (laneIdx * 137.508) % 360;
    const sat = 72 + (laneIdx % 4) * 5;
    const light = 64 + (laneIdx % 3) * 4;
    return `hsl(${hue.toFixed(3)} ${sat}% ${light}%)`;
  }
  let h = 19;
  const src = String(key || "lane").toLowerCase();
  for (let i = 0; i < src.length; i += 1) {
    h = (h * 31 + src.charCodeAt(i)) % 360;
  }
  const sat = 74 + (h % 4) * 4;
  const light = 62 + (h % 3) * 5;
  return `hsl(${h} ${sat}% ${light}%)`;
}

export function laneLabel(name, idx) {
  const laneName = toText(name) || "unassigned";
  const laneIdx = Number(idx);
  if (Number.isFinite(laneIdx) && laneIdx > 0) return `L${laneIdx}: ${laneName}`;
  return laneName;
}

export function dedupNames(list) {
  const out = [];
  const seen = new Set();
  toArray(list).forEach((x) => {
    const v = toText(x);
    if (!v) return;
    const k = normalizeLoose(v);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(v);
  });
  return out;
}

export function normalizeInterview(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = emptyInterview();

  const boundaries = {
    ...base.boundaries,
    ...(src.boundaries && typeof src.boundaries === "object" ? src.boundaries : {}),
  };
  const subprocesses = dedupNames(src.subprocesses);
  const aiLinesByStepId = {};

  const steps = toArray(src.steps)
    .map((step) => {
      if (!step || typeof step !== "object") return null;
      const sid = toText(step.id) || uid("step");
      const commentRaw = String(step.comment || step.note || "");
      const split = splitCommentAndAiBlock(commentRaw);
      aiLinesByStepId[sid] = new Set(split.aiLines.map((x) => normalizeLoose(x)));
      return {
        id: sid,
        node_id: toText(step.node_id || step.nodeId || ""),
        area: String(step.area || ""),
        type: STEP_TYPES.some((x) => x.value === step.type) ? step.type : "operation",
        action: String(step.action || ""),
        subprocess: String(step.subprocess || step.subprocess_name || step.group || ""),
        comment: split.manual,
        role: String(step.role || ""),
        duration_min: String(step.duration_min ?? ""),
        wait_min: String(step.wait_min ?? ""),
        output: String(step.output || ""),
      };
    })
    .filter(Boolean);

  const exceptions = toArray(src.exceptions)
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      return {
        id: toText(x.id) || uid("exc"),
        step_seq: String(x.step_seq ?? ""),
        situation: String(x.situation || ""),
        trigger: String(x.trigger || ""),
        actions: String(x.actions || ""),
        add_min: String(x.add_min ?? ""),
        owner: String(x.owner || ""),
      };
    })
    .filter(Boolean);

  const transitions = toArray(src.transitions)
    .map((x, idx) => {
      if (!x || typeof x !== "object") return null;
      const fromId = toText(x.from_node_id || x.from || x.source_id || x.sourceId);
      const toId = toText(x.to_node_id || x.to || x.target_id || x.targetId);
      if (!fromId || !toId) return null;
      return {
        id: toText(x.id) || uid(`tr_${idx + 1}`),
        from_node_id: fromId,
        to_node_id: toId,
        when: String(x.when || x.label || ""),
      };
    })
    .filter(Boolean);

  const ai_questions = {};
  const srcAi = src.ai_questions && typeof src.ai_questions === "object" ? src.ai_questions : {};
  Object.keys(srcAi).forEach((stepId) => {
    const list = toArray(srcAi[stepId]).map((q) => ({
      id: toText(q?.id) || uid("q"),
      text: String(q?.text || ""),
      status: AI_STATUS.includes(q?.status) ? q.status : "неизвестно",
      on_diagram: !!q?.on_diagram,
    }));
    const selectedFromComment = aiLinesByStepId[String(stepId)] || new Set();
      ai_questions[String(stepId)] = list
        .filter((q) => toText(q.text))
        .map((q) => ({
          ...q,
          on_diagram: q.on_diagram || selectedFromComment.has(normalizeLoose(q.text)),
        }))
        .slice(0, 5);
  });

  const ai_questions_by_element = normalizeAiQuestionsByElementMap(
    src.ai_questions_by_element || src.aiQuestionsByElementId,
  );

  const prep_questions = toArray(src.prep_questions || src.ai_prep_questions)
    .map((q, idx) => {
      if (!q || typeof q !== "object") return null;
      const question = toText(q.question || q.text);
      if (!question) return null;
      return {
        id: toText(q.id) || `Q${idx + 1}`,
        block: toText(q.block),
        question,
        ask_to: toText(q.ask_to || q.role || q.askTo),
        answer_type: toText(q.answer_type || q.answerType),
        follow_up: toText(q.follow_up || q.followUp),
        answer: String(q.answer || "").trim(),
      };
    })
    .filter(Boolean);

  return {
    boundaries,
    steps,
    transitions,
    subprocesses,
    exceptions,
    ai_questions,
    ai_questions_by_element,
    prep_questions,
  };
}

export function computeTimeline(steps) {
  let cursor = 0;
  return toArray(steps).map((step, idx) => {
    const duration = toNonNegativeInt(step.duration_min);
    const wait = toNonNegativeInt(step.wait_min);
    const start = cursor;
    const end = cursor + duration + wait;
    cursor = end;
    return {
      ...step,
      seq: idx + 1,
      duration,
      wait,
      t_plus: `T+${start}→${end}`,
    };
  });
}

export function computeNodeOrder(nodes, edges) {
  const list = toArray(nodes).map((n) => toText(n?.id)).filter(Boolean);
  if (!list.length) return [];
  const indeg = {};
  const out = {};
  list.forEach((id) => {
    indeg[id] = 0;
    out[id] = [];
  });
  toArray(edges).forEach((e) => {
    const from = toText(e?.from_id || e?.from || e?.source_id || e?.sourceId);
    const to = toText(e?.to_id || e?.to || e?.target_id || e?.targetId);
    if (!from || !to || !(from in indeg) || !(to in indeg)) return;
    indeg[to] += 1;
    out[from].push(to);
  });

  const indexById = {};
  list.forEach((id, idx) => {
    indexById[id] = idx;
  });

  const queue = list.filter((id) => indeg[id] === 0).sort((a, b) => indexById[a] - indexById[b]);
  const ordered = [];
  while (queue.length) {
    const cur = queue.shift();
    ordered.push(cur);
    toArray(out[cur]).forEach((nxt) => {
      indeg[nxt] -= 1;
      if (indeg[nxt] === 0) queue.push(nxt);
    });
    queue.sort((a, b) => indexById[a] - indexById[b]);
  }
  if (ordered.length < list.length) {
    const orderedSet = new Set(ordered);
    list.forEach((id) => {
      if (!orderedSet.has(id)) ordered.push(id);
    });
  }
  return ordered;
}

export function collectNodeIdsInBpmnOrder(xmlText) {
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

  const domOrder = [];
  const seen = new Set();
  Array.from(doc.getElementsByTagName("*")).forEach((el) => {
    const local = String(el.localName || "").toLowerCase();
    if (!allowed.has(local)) return;
    const id = toText(el.getAttribute("id"));
    if (!id || seen.has(id)) return;
    seen.add(id);
    domOrder.push(id);
  });
  if (!domOrder.length) return [];

  const indeg = {};
  const out = {};
  const idxById = {};
  domOrder.forEach((id, idx) => {
    indeg[id] = 0;
    out[id] = [];
    idxById[id] = idx;
  });

  Array.from(doc.getElementsByTagName("*")).forEach((el) => {
    const local = String(el.localName || "").toLowerCase();
    if (local !== "sequenceflow") return;
    const fromId = toText(el.getAttribute("sourceRef"));
    const toId = toText(el.getAttribute("targetRef"));
    if (!fromId || !toId || fromId === toId) return;
    if (!Object.prototype.hasOwnProperty.call(indeg, fromId)) return;
    if (!Object.prototype.hasOwnProperty.call(indeg, toId)) return;
    out[fromId].push(toId);
    indeg[toId] += 1;
  });

  const queue = domOrder.filter((id) => indeg[id] === 0).sort((a, b) => idxById[a] - idxById[b]);
  const ordered = [];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur) break;
    ordered.push(cur);
    toArray(out[cur]).forEach((nextId) => {
      indeg[nextId] -= 1;
      if (indeg[nextId] === 0) queue.push(nextId);
    });
    queue.sort((a, b) => idxById[a] - idxById[b]);
  }

  if (ordered.length < domOrder.length) {
    const used = new Set(ordered);
    domOrder.forEach((id) => {
      if (!used.has(id)) ordered.push(id);
    });
  }
  return ordered;
}

export function getElementsByLocalNames(root, names) {
  const set = new Set(toArray(names).map((x) => String(x || "").toLowerCase()));
  return Array.from(root.getElementsByTagName("*")).filter((el) => set.has(String(el.localName || "").toLowerCase()));
}

export function parseLaneMetaByNodeFromBpmnXml(xmlText) {
  const raw = String(xmlText || "").trim();
  if (!raw || typeof DOMParser === "undefined") return {};

  let doc;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return {};
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return {};

  const processMetaById = {};
  getElementsByLocalNames(doc, ["process"]).forEach((processEl) => {
    const processId = toText(processEl.getAttribute("id"));
    if (!processId) return;
    processMetaById[processId] = {
      processId,
      processName: toText(processEl.getAttribute("name")) || processId,
      poolId: processId,
      poolName: toText(processEl.getAttribute("name")) || processId,
    };
  });

  getElementsByLocalNames(doc, ["participant"]).forEach((participantEl) => {
    const processRef = toText(participantEl.getAttribute("processRef"));
    if (!processRef) return;
    const poolId = toText(participantEl.getAttribute("id")) || processRef;
    const poolName = toText(participantEl.getAttribute("name")) || poolId;
    const base = processMetaById[processRef] || { processId: processRef, processName: processRef };
    processMetaById[processRef] = {
      ...base,
      poolId,
      poolName,
    };
  });

  const laneInfoById = {};
  const laneNameCount = {};
  const laneIdByNode = {};

  function registerLane(lane, processContext = null) {
    const laneId = toText(lane.getAttribute("id"));
    const laneName = toText(lane.getAttribute("name")) || laneId;
    if (!laneId || !laneName) return;

    const processId = toText(processContext?.processId);
    const processMeta = processMetaById[processId] || processContext || {};
    const poolId = toText(processMeta.poolId) || toText(processMeta.processId) || processId || "pool";
    const poolName = toText(processMeta.poolName) || toText(processMeta.processName) || processId || poolId;

    laneInfoById[laneId] = {
      laneId,
      laneName,
      processId: toText(processMeta.processId) || processId,
      poolId,
      poolName,
    };

    const laneNameKey = normalizeLoose(laneName) || laneId.toLowerCase();
    laneNameCount[laneNameKey] = (laneNameCount[laneNameKey] || 0) + 1;

    getElementsByLocalNames(lane, ["flowNodeRef"]).forEach((ref) => {
      const nodeId = toText(ref.textContent);
      if (!nodeId) return;
      laneIdByNode[nodeId] = laneId;
    });
  }

  getElementsByLocalNames(doc, ["process"]).forEach((processEl) => {
    const processId = toText(processEl.getAttribute("id"));
    const processMeta = processMetaById[processId] || {
      processId,
      processName: toText(processEl.getAttribute("name")) || processId,
      poolId: processId,
      poolName: toText(processEl.getAttribute("name")) || processId,
    };
    getElementsByLocalNames(processEl, ["lane"]).forEach((lane) => registerLane(lane, processMeta));
  });

  getElementsByLocalNames(doc, ["lane"]).forEach((lane) => {
    const laneId = toText(lane.getAttribute("id"));
    if (laneId && laneInfoById[laneId]) return;
    registerLane(lane);
  });

  const laneBoundsById = {};
  const nodeCenters = {};
  getElementsByLocalNames(doc, ["bpmnshape"]).forEach((shape) => {
    const bpmnElement = toText(shape.getAttribute("bpmnElement") || shape.getAttribute("bpmnelement"));
    if (!bpmnElement) return;
    const b = getElementsByLocalNames(shape, ["bounds"])[0];
    if (!b) return;
    const x = Number(b.getAttribute("x"));
    const y = Number(b.getAttribute("y"));
    const w = Number(b.getAttribute("width"));
    const h = Number(b.getAttribute("height"));
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return;
    if (laneInfoById[bpmnElement]) {
      laneBoundsById[bpmnElement] = { x, y, w, h, area: w * h };
      return;
    }
    nodeCenters[bpmnElement] = { cx: x + w / 2, cy: y + h / 2 };
  });

  const laneIds = Object.keys(laneBoundsById);
  if (laneIds.length) {
    Object.keys(nodeCenters).forEach((nodeId) => {
      if (laneIdByNode[nodeId]) return;
      const c = nodeCenters[nodeId];
      const hits = laneIds
        .filter((lid) => {
          const b = laneBoundsById[lid];
          return c.cx >= b.x && c.cx <= b.x + b.w && c.cy >= b.y && c.cy <= b.y + b.h;
        })
        .map((lid) => ({ lid, area: laneBoundsById[lid].area }))
        .sort((a, b) => a.area - b.area);
      if (!hits.length) return;
      laneIdByNode[nodeId] = hits[0].lid;
    });
  }

  const laneMetaByNode = {};
  Object.entries(laneIdByNode).forEach(([nodeId, laneId]) => {
    const lane = laneInfoById[laneId];
    if (!lane) return;
    const laneNameKey = normalizeLoose(lane.laneName) || lane.laneId.toLowerCase();
    const needPoolPrefix = (laneNameCount[laneNameKey] || 0) > 1;
    laneMetaByNode[nodeId] = {
      id: lane.laneId,
      key: `${lane.poolId}::${lane.laneId}`,
      name: lane.laneName,
      label: needPoolPrefix ? `${lane.poolName}: ${lane.laneName}` : lane.laneName,
      processId: lane.processId,
      poolId: lane.poolId,
      poolName: lane.poolName,
    };
  });

  return laneMetaByNode;
}

export function parseLaneMapFromBpmnXml(xmlText) {
  const laneMetaByNode = parseLaneMetaByNodeFromBpmnXml(xmlText);
  const laneByNode = {};
  Object.keys(laneMetaByNode).forEach((nodeId) => {
    laneByNode[nodeId] = toText(laneMetaByNode[nodeId]?.name);
  });
  return laneByNode;
}

export function parseNodeKindMapFromBpmnXml(xmlText) {
  const raw = String(xmlText || "").trim();
  if (!raw || typeof DOMParser === "undefined") return {};

  let doc;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return {};
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return {};

  const kinds = {};
  getElementsByLocalNames(doc, [
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
    "parallelgateway",
    "eventbasedgateway",
    "startevent",
    "endevent",
    "intermediatecatchevent",
    "intermediatethrowevent",
    "boundaryevent",
  ]).forEach((el) => {
    const id = toText(el.getAttribute("id"));
    const kind = toText(el.localName || "").toLowerCase();
    if (!id || !kind) return;
    kinds[id] = kind;
  });
  return kinds;
}

export function extractTextAnnotationsByTarget(xmlText) {
  const raw = String(xmlText || "").trim();
  if (!raw || typeof DOMParser === "undefined") return {};

  let doc;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return {};
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return {};

  const annotationById = {};
  let createdOrder = 0;
  getElementsByLocalNames(doc, ["textannotation"]).forEach((el) => {
    const annotationId = toText(el.getAttribute("id"));
    if (!annotationId) return;
    const textNode = getElementsByLocalNames(el, ["text"])[0];
    const text = toText(textNode?.textContent || "");
    if (!text) return;
    createdOrder += 1;
    annotationById[annotationId] = {
      annotationId,
      text,
      createdOrder,
    };
  });

  const byTarget = {};
  const seen = new Set();
  function add(targetElementId, annotation, associationId) {
    const targetId = toText(targetElementId);
    const annId = toText(annotation?.annotationId);
    const annText = toText(annotation?.text);
    if (!targetId || !annId || !annText) return;
    const key = `${targetId}::${annId}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!byTarget[targetId]) byTarget[targetId] = [];
    byTarget[targetId].push({
      annotationId: annId,
      text: annText,
      createdOrder: Number(annotation?.createdOrder) || 0,
      associationId: toText(associationId),
    });
  }

  getElementsByLocalNames(doc, ["association"]).forEach((el, index) => {
    const sourceRef = toText(el.getAttribute("sourceRef"));
    const targetRef = toText(el.getAttribute("targetRef"));
    if (!sourceRef || !targetRef) return;
    const associationId = toText(el.getAttribute("id")) || `assoc_${index + 1}`;
    const sourceAnnotation = annotationById[sourceRef];
    const targetAnnotation = annotationById[targetRef];
    if (sourceAnnotation && targetRef && !annotationById[targetRef]) add(targetRef, sourceAnnotation, associationId);
    if (targetAnnotation && sourceRef && !annotationById[sourceRef]) add(sourceRef, targetAnnotation, associationId);
  });

  Object.keys(byTarget).forEach((targetId) => {
    byTarget[targetId].sort((a, b) => {
      const ao = Number(a?.createdOrder) || 0;
      const bo = Number(b?.createdOrder) || 0;
      if (ao !== bo) return ao - bo;
      const ai = toText(a?.annotationId);
      const bi = toText(b?.annotationId);
      return ai.localeCompare(bi);
    });
  });

  return byTarget;
}

export function parseTextAnnotationsByNodeFromBpmnXml(xmlText) {
  const richByTarget = extractTextAnnotationsByTarget(xmlText);
  const byNode = {};
  Object.keys(richByTarget).forEach((nodeId) => {
    byNode[nodeId] = toArray(richByTarget[nodeId])
      .map((item) => toText(item?.text))
      .filter(Boolean);
  });
  return byNode;
}

function parseStructuredAnnotationLine(lineRaw) {
  const line = String(lineRaw || "").replace(/\t/g, "  ");
  const prefixed = line.match(/^\s*\[(#+)\]\s*(.+)\s*$/);
  if (prefixed) {
    const level = Math.min(6, Math.max(1, prefixed[1].length));
    return {
      isStructured: true,
      level,
      titleLine: toText(prefixed[2]),
    };
  }

  const heading = line.match(/^\s*(#{2,6})\s+(.+)\s*$/);
  if (heading) {
    const level = Math.min(6, Math.max(1, heading[1].length - 1));
    return {
      isStructured: true,
      level,
      titleLine: toText(heading[2]),
    };
  }

  const bullet = line.match(/^(\s*)[-*]\s+(.+)\s*$/);
  if (bullet) {
    const level = Math.min(6, Math.max(1, Math.floor((bullet[1] || "").length / 2) + 1));
    return {
      isStructured: true,
      level,
      titleLine: toText(bullet[2]),
    };
  }

  return {
    isStructured: false,
    level: 1,
    titleLine: toText(line),
  };
}

export function parseAnnotationTree(text) {
  const raw = toText(text);
  if (!raw) return [];
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const meaningful = lines.map((line) => toText(line)).filter(Boolean);
  if (!meaningful.length) return [];

  const hasStructure = meaningful.some((line) => parseStructuredAnnotationLine(line).isStructured);
  if (!hasStructure) {
    return [
      {
        key: "ann_1",
        titleLine: meaningful[0],
        body: meaningful.slice(1).join("\n"),
        level: 1,
        children: [],
      },
    ];
  }

  let cursor = 0;
  const root = [];
  const stack = [];
  function createNode(level, titleLine) {
    cursor += 1;
    return {
      key: `ann_${cursor}`,
      titleLine: toText(titleLine) || `Аннотация ${cursor}`,
      body: "",
      level: Math.max(1, Number(level) || 1),
      children: [],
    };
  }
  function attachNode(node) {
    while (stack.length && Number(stack[stack.length - 1]?.level || 1) >= node.level) {
      stack.pop();
    }
    if (!stack.length) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  lines.forEach((lineRaw) => {
    const line = String(lineRaw || "");
    const trimmed = toText(line);
    if (!trimmed) return;
    const parsed = parseStructuredAnnotationLine(line);
    if (parsed.isStructured) {
      attachNode(createNode(parsed.level, parsed.titleLine));
      return;
    }
    if (!stack.length) {
      attachNode(createNode(1, trimmed));
      return;
    }
    const current = stack[stack.length - 1];
    current.body = current.body ? `${current.body}\n${trimmed}` : trimmed;
  });

  return root;
}

export function annotationTitleFromText(text, index = 1) {
  const raw = toText(text);
  if (!raw) return `Аннотация #${Math.max(1, Number(index) || 1)}`;
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseStructuredAnnotationLine(lines[i]);
    const title = toText(parsed.titleLine);
    if (title) return title;
  }
  return `Аннотация #${Math.max(1, Number(index) || 1)}`;
}

export function buildAnnotationSyncByStepId(timelineSteps, xmlTextAnnotationsByNode) {
  const out = {};
  toArray(timelineSteps).forEach((step) => {
    const stepId = toText(step?.id);
    if (!stepId) return;

    const rawComment = toText(step?.comment);
    const split = splitCommentAndAiBlock(rawComment);
    const manualComment = toText(split?.manual);
    const commentCandidates = [rawComment, manualComment].filter(Boolean);
    const nodeId = toText(step?.node_bind_id || step?.node_id);
    const xmlNotes = toArray(xmlTextAnnotationsByNode?.[nodeId])
      .map((x) => toText(x))
      .filter(Boolean);
    const hasMatch = xmlNotes.some((xmlNote) => commentCandidates.some((localNote) => normalizeLoose(localNote) === normalizeLoose(xmlNote)));

    const item = {
      status: "empty",
      label: "нет аннотаций BPMN",
      nodeId,
      xmlNotes,
    };

    if (!rawComment) {
      item.status = "empty";
      item.label = "нет аннотаций BPMN";
    } else if (!nodeId) {
      item.status = "missing_node";
      item.label = "нет привязки к узлу";
    } else if (hasMatch) {
      item.status = "synced";
      item.label = "в BPMN/XML добавлено";
    } else if (xmlNotes.length) {
      item.status = "mismatch";
      item.label = "в BPMN другой текст";
    } else {
      item.status = "pending";
      item.label = "ожидает синхронизацию";
    }

    out[stepId] = item;
  });
  return out;
}

export function parseVirtualEventNodesFromBpmnXml(xmlText, laneByNode = {}, nodeKinds = {}) {
  const raw = String(xmlText || "").trim();
  if (!raw || typeof DOMParser === "undefined") return [];

  let doc;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return [];
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return [];

  const out = [];
  const seen = new Set();
  getElementsByLocalNames(doc, [
    "startevent",
    "endevent",
    "intermediatecatchevent",
    "intermediatethrowevent",
    "boundaryevent",
  ]).forEach((el) => {
    const id = toText(el.getAttribute("id"));
    if (!id || seen.has(id)) return;
    seen.add(id);
    const title = toText(el.getAttribute("name")) || id;
    const actorRole = toText(laneByNode[id]);
    const bpmnKind = toText(nodeKinds[id] || el.localName).toLowerCase();
    out.push({
      id,
      title,
      actorRole,
      nodeType: "event_virtual",
      bpmnKind,
      parameters: {},
    });
  });
  return out;
}

export function nodeKindIcon(kind) {
  const k = toText(kind).toLowerCase();
  if (k === "sendtask") return "✉";
  if (k === "receivetask") return "✉";
  if (k === "servicetask") return "⚙";
  if (k === "usertask") return "👤";
  if (k === "manualtask") return "✋";
  if (k === "scripttask") return "⌘";
  if (k === "businessruletask") return "◆";
  if (k === "callactivity") return "▣";
  if (k === "subprocess" || k === "adhocsubprocess") return "▤";
  if (k.includes("gateway")) return "◇";
  if (k.includes("event")) return "○";
  return "□";
}

export function asMarkdown(data, timeline, transitions, summary, topWaits, analytics = {}, meta = {}) {
  const b = data.boundaries;
  const processTitle = toText(meta.processTitle) || "—";
  const sessionLabel = toText(meta.sessionLabel) || "—";
  const subprocesses = dedupNames(meta.subprocesses);
  const lines = [];

  lines.push("## DoD — процесс и подпроцессы");
  lines.push("");
  lines.push(`- Процесс: ${processTitle}`);
  lines.push(`- Сессия: ${sessionLabel}`);
  lines.push(`- Всего шагов: ${timeline.length}`);
  lines.push(`- Подпроцессов: ${subprocesses.length}`);
  lines.push("");

  lines.push("### Подпроцессы");
  if (!subprocesses.length) {
    lines.push("- Подпроцессы не выделены.");
  } else {
    subprocesses.forEach((sp) => {
      const steps = timeline.filter((x) => toText(x.subprocess) === sp);
      const stepNums = steps.map((x) => x.seq).join(", ");
      lines.push(`- ${sp}: шаги ${stepNums || "—"} (${steps.length})`);
    });
  }
  lines.push("");

  lines.push("## Interview — хронология процесса");
  lines.push("");
  lines.push("### Границы процесса");
  lines.push(`- Стартовое событие: ${toText(b.trigger) || "—"}`);
  lines.push(`- Стартовый цех: ${toText(b.start_shop) || "—"}`);
  lines.push(`- Промежуточные роли/участки: ${toText(b.intermediate_roles) || "—"}`);
  lines.push(`- Финишное состояние: ${toText(b.finish_state) || "—"}`);
  lines.push(`- Финишный цех: ${toText(b.finish_shop) || "—"}`);
  lines.push("");

  const prepQuestions = toArray(data.prep_questions);
  if (prepQuestions.length) {
    lines.push("### AI-вопросы и ответы (DoD)");
    prepQuestions.forEach((q) => {
      const header = toText(q.question);
      const label = toText(q.id) ? `[${q.id}] ${header}` : header;
      lines.push(`- ${label || "—"}`);
      if (q.block) lines.push(`  - Блок: ${q.block}`);
      if (q.ask_to) lines.push(`  - Кому: ${q.ask_to}`);
      if (q.answer_type) lines.push(`  - Тип ответа: ${q.answer_type}`);
      if (q.follow_up) lines.push(`  - Follow-up: ${q.follow_up}`);
      lines.push(`  - Ответ: ${toText(q.answer) || "—"}`);
    });
    lines.push("");
  }

  lines.push("### Таймлайн шагов");
  if (!timeline.length) {
    lines.push("- Шаги пока не добавлены.");
  } else {
    lines.push("| № | T+ | Цех/участок | Лайн | Подпроцесс | Тип | Шаг | Узел BPMN | Комментарий | Роль | Длительность (мин) | Ожидание (мин) | Выход |\n|---:|---|---|---|---|---|---|---|---|---|---:|---:|---|");
    timeline.forEach((step) => {
      lines.push(
        `| ${step.seq} | ${step.t_plus} | ${toText(step.area) || "—"} | ${toText(step.lane_name) || "—"} | ${toText(step.subprocess) || "—"} | ${typeLabel(step.type)} | ${toText(step.action) || "—"} | ${toText(step.node_bind_id || step.node_id) || "—"} | ${toText(step.comment) || "—"} | ${toText(step.role) || "—"} | ${step.duration} | ${step.wait} | ${toText(step.output) || "—"} |`,
      );
    });
  }
  lines.push("");

  lines.push("### Ветки BPMN (условия переходов)");
  if (!toArray(transitions).length) {
    lines.push("- Условные переходы не заданы.");
  } else {
    lines.push("| From | To | Условие |\n|---|---|---|");
    toArray(transitions).forEach((tr) => {
      const fromLabel = toText(tr?.from_title) || toText(tr?.from_node_id) || "—";
      const toLabel = toText(tr?.to_title) || toText(tr?.to_node_id) || "—";
      const when = toText(tr?.when) || "—";
      lines.push(`| ${fromLabel} | ${toLabel} | ${when} |`);
    });
  }
  lines.push("");

  lines.push("### Итоги времени");
  lines.push(`- Активное время: ${summary.active} мин`);
  lines.push(`- Ожидание: ${summary.wait} мин`);
  lines.push(`- Lead time: ${summary.lead} мин`);
  lines.push(`- Средняя длительность шага: ${round1(analytics.avgLeadPerStepMin)} мин`);
  lines.push(`- Пропускная способность: ${round1(analytics.stepsPerHour)} шага/час`);
  lines.push(`- Шагов с ожиданием: ${analytics.waitStepCount || 0}/${timeline.length} (${formatPercent(analytics.waitStepSharePct || 0)})`);
  lines.push(`- Привязка шагов к BPMN: ${analytics.boundStepCount || 0}/${timeline.length} (${formatPercent(analytics.bindCoveragePct || 0)})`);
  lines.push(`- Заполненность границ процесса: ${analytics.boundariesFilled || 0}/${analytics.boundariesTotal || 0} (${formatPercent(analytics.boundariesCoveragePct || 0)})`);
  lines.push(`- AI-покрытие шагов: ${analytics.aiStepCoverageCount || 0}/${timeline.length} (${formatPercent(analytics.aiStepCoveragePct || 0)})`);
  lines.push(`- AI-вопросы: всего ${analytics.aiTotal || 0}, подтверждено ${analytics.aiConfirmed || 0}, уточнить ${analytics.aiClarify || 0}, неизвестно ${analytics.aiUnknown || 0}`);
  lines.push(`- Исключения: ${toArray(data.exceptions).length}, суммарно +${analytics.exceptionAddMinTotal || 0} мин`);
  lines.push("");

  lines.push("### Распределение по типам шагов");
  if (!toArray(analytics.typeStats).length) {
    lines.push("- Нет данных.");
  } else {
    lines.push("| Тип | Кол-во | Доля | Активно (мин) | Ожидание (мин) | Lead (мин) |\n|---|---:|---:|---:|---:|---:|");
    toArray(analytics.typeStats).forEach((x) => {
      lines.push(`| ${x.label} | ${x.count} | ${formatPercent(x.sharePct)} | ${x.active} | ${x.wait} | ${x.lead} |`);
    });
  }
  lines.push("");

  lines.push("### Распределение по лайнам");
  if (!toArray(analytics.laneStats).length) {
    lines.push("- Нет данных.");
  } else {
    lines.push("| Лайн | Шагов | Доля | Активно (мин) | Ожидание (мин) | Lead (мин) |\n|---|---:|---:|---:|---:|---:|");
    toArray(analytics.laneStats).forEach((x) => {
      lines.push(`| ${toText(x.name) || "—"} | ${x.count} | ${formatPercent(x.sharePct)} | ${x.active} | ${x.wait} | ${x.lead} |`);
    });
  }
  lines.push("");

  lines.push("### Распределение по подпроцессам");
  if (!toArray(analytics.subprocessStats).length) {
    lines.push("- Нет данных.");
  } else {
    lines.push("| Подпроцесс | Шагов | Доля | Активно (мин) | Ожидание (мин) | Lead (мин) |\n|---|---:|---:|---:|---:|---:|");
    toArray(analytics.subprocessStats).forEach((x) => {
      lines.push(`| ${toText(x.name) || "—"} | ${x.count} | ${formatPercent(x.sharePct)} | ${x.active} | ${x.wait} | ${x.lead} |`);
    });
  }
  lines.push("");

  if (analytics.maxDurationStep || analytics.maxWaitStep) {
    lines.push("### Узкие места");
    if (analytics.maxDurationStep) {
      lines.push(`- Самый долгий активный шаг: #${analytics.maxDurationStep.seq} "${toText(analytics.maxDurationStep.action) || "—"}" — ${analytics.maxDurationStep.duration} мин`);
    }
    if (analytics.maxWaitStep) {
      lines.push(`- Самое длинное ожидание: #${analytics.maxWaitStep.seq} "${toText(analytics.maxWaitStep.action) || "—"}" — ${analytics.maxWaitStep.wait} мин`);
    }
    lines.push("");
  }

  lines.push("### Топ-3 ожидания");
  if (!topWaits.length) {
    lines.push("- Нет шагов с ожиданием.");
  } else {
    topWaits.forEach((x) => {
      lines.push(`- Шаг ${x.seq}: ${toText(x.action) || "—"} — ${x.wait} мин`);
    });
  }
  lines.push("");

  lines.push("### Исключения");
  if (!data.exceptions.length) {
    lines.push("- Исключения не добавлены.");
  } else {
    data.exceptions.forEach((x, idx) => {
      lines.push(`${idx + 1}. Шаг №${toText(x.step_seq) || "—"}: ${toText(x.situation) || "—"}`);
      lines.push(`   - Триггер: ${toText(x.trigger) || "—"}`);
      lines.push(`   - Действия: ${toText(x.actions) || "—"}`);
      lines.push(`   - + минут: ${toText(x.add_min) || "0"}`);
      lines.push(`   - Кто решает: ${toText(x.owner) || "—"}`);
    });
  }
  lines.push("");

  lines.push("### AI-вопросы по шагам");
  const stepIds = Object.keys(data.ai_questions || {});
  if (!stepIds.length) {
    lines.push("- Вопросы пока не добавлены.");
  } else {
    timeline.forEach((step) => {
      const list = toArray(data.ai_questions[step.id]);
      if (!list.length) return;
      lines.push(`- Шаг ${step.seq} (${typeLabel(step.type)}):`);
      list.forEach((q) => lines.push(`  - [${q.status}] ${q.text}`));
    });
  }

  return lines.join("\n").trim();
}

export async function copyText(text) {
  const value = String(text || "");
  if (!value) return false;

  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
    }
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "readonly");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}
