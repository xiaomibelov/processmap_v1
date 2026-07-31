// UXF addendum A2 — сводка процесса для панели «Доп. информация».
// Чистые функции над bpmn_xml (regex-парсер, DOM не нужен — работает и в node-тестах).
//
// Маппинг «ручное/оборудование» (зафиксирован в ux_concept addendum):
//   manualTask / userTask        → ручное
//   serviceTask / scriptTask /
//   businessRuleTask / sendTask  → оборудование
//   task (без уточнения)         → не классифицировано

const RE = {
  taskPlain: /<[a-z]+:task[\s>]/gi,
  manualTask: /<[a-z]+:(?:manualTask|userTask)[\s>]/gi,
  equipTask: /<[a-z]+:(?:serviceTask|scriptTask|businessRuleTask|sendTask)[\s>]/gi,
  gateway: /<[a-z]+:\w*Gateway[\s>]/gi,
  subprocess: /<[a-z]+:(?:subProcess|callActivity)[\s>]/gi,
  event: /<[a-z]+:\w*Event[\s>]/gi,
  lane: /<[a-z]+:lane\s[^>]*>/gi,
  laneName: /name="([^"]*)"/i,
  laneSet: /<[a-z]+:laneSet[\s>]/i,
  flowNode: /<[a-z]+:(task|manualTask|userTask|serviceTask|scriptTask|businessRuleTask|sendTask|subProcess|callActivity)\s[^>]*id="([^"]+)"[^>]*>/gi,
  eeProp: /name="ee_time"\s+value="([^"]*)"/i,
  seqFlow: /<[a-z]+:sequenceFlow\s[^>]*id="[^"]*"[^>]*>/gi,
  seqRefs: /sourceRef="([^"]+)"[^>]*targetRef="([^"]+)"|targetRef="([^"]+)"[^>]*sourceRef="([^"]+)"/i,
};

function countMatches(re, text) {
  const m = String(text || "").match(re);
  return m ? m.length : 0;
}

function parseNumber(v) {
  const n = Number(String(v || "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

// Элементы с ee_time: ищем flowNode-элемент и camunda:property внутри его тела.
// Тело = открывающий тег элемента до ближайшего </bpmn:...> того же имени
// (для самозакрывающихся — пусто). Вложенные subProcess учитываются глубиной.
function extractEeTimeByElement(xml) {
  const out = new Map(); // id -> { eeTime, kind: "manual"|"equipment"|"plain" }
  const src = String(xml || "");
  const nodeOpen = /<[a-z]+:(task|manualTask|userTask|serviceTask|scriptTask|businessRuleTask|sendTask|subProcess|callActivity)\s[^>]*?id="([^"]+)"[^>]*?(\/?)>/gi;
  let m;
  while ((m = nodeOpen.exec(src))) {
    const type = m[1];
    const id = m[2];
    const selfClosed = m[3] === "/";
    let body = "";
    if (!selfClosed) {
      // граница тела: соответствующий закрывающий тег с учётом вложенности того же типа
      const rest = src.slice(nodeOpen.lastIndex);
      const openRe = new RegExp(`<[a-z]+:${type}[\\s>]`, "gi");
      const closeRe = new RegExp(`</[a-z]+:${type}>`, "gi");
      let depth = 1;
      let idx = 0;
      let end = -1;
      while (idx < rest.length) {
        openRe.lastIndex = idx;
        closeRe.lastIndex = idx;
        const o = openRe.exec(rest);
        const c = closeRe.exec(rest);
        if (!c) break;
        if (o && o.index < c.index) { depth += 1; idx = o.index + o[0].length; }
        else { depth -= 1; idx = c.index + c[0].length; if (depth === 0) { end = c.index; break; } }
      }
      body = end >= 0 ? rest.slice(0, end) : rest.slice(0, 4000);
    }
    // не двойной счёт: ee_time берём только из ПРЯМОГО extensionElements
    // элемента — отрезаем тело по первому вложенному flowNode (для subProcess)
    const nested = body.match(/<[a-z]+:(?:task|manualTask|userTask|serviceTask|scriptTask|businessRuleTask|sendTask|subProcess|callActivity)[\s>]/i);
    const ownBody = nested ? body.slice(0, nested.index) : body;
    const ee = ownBody.match(RE.eeProp);
    if (!ee) continue;
    const kind = /^(manualTask|userTask)$/i.test(type) ? "manual"
      : /^(serviceTask|scriptTask|businessRuleTask|sendTask)$/i.test(type) ? "equipment"
      : "plain";
    out.set(id, { eeTime: parseNumber(ee[1]), kind });
  }
  return out;
}

function extractSequenceFlows(xml) {
  const flows = [];
  const src = String(xml || "");
  const re = /<[a-z]+:sequenceFlow\s[^>]*>/gi;
  let m;
  while ((m = re.exec(src))) {
    const tag = m[0];
    const s = tag.match(/sourceRef="([^"]+)"/i);
    const t = tag.match(/targetRef="([^"]+)"/i);
    if (s && t) flows.push([s[1], t[1]]);
  }
  return flows;
}

// Критический путь = самый длинный по сумме ee_time путь в DAG потока управления.
// Циклы разрываем (visited в стеке); при любой проблеме — fallback на сумму.
function criticalPathTime(eeById, flows) {
  if (!eeById.size) return 0;
  const adj = new Map();
  for (const [s, t] of flows) {
    if (!adj.has(s)) adj.set(s, []);
    adj.get(s).push(t);
  }
  const weight = (id) => (eeById.get(id)?.eeTime || 0);
  const memo = new Map();
  const inStack = new Set();
  function dfs(id) {
    if (memo.has(id)) return memo.get(id);
    if (inStack.has(id)) return 0; // цикл — разрыв
    inStack.add(id);
    let best = 0;
    for (const nxt of adj.get(id) || []) {
      const cand = dfs(nxt);
      if (cand > best) best = cand;
    }
    inStack.delete(id);
    const val = weight(id) + best;
    memo.set(id, val);
    return val;
  }
  let max = 0;
  for (const id of eeById.keys()) {
    const v = dfs(id);
    if (v > max) max = v;
  }
  return max;
}

export function computeProcessSummary(bpmnXml) {
  const xml = String(bpmnXml || "").trim();
  const empty = {
    hasXml: false,
    tasks: 0, gateways: 0, subprocesses: 0, events: 0,
    lanes: [],
    ee: { present: false, total: 0, manual: 0, equipment: 0, unclassified: 0, criticalPath: 0 },
  };
  if (!xml || !xml.includes("<")) return empty;

  const laneNames = [];
  const laneRe = /<[a-z]+:lane\s[^>]*>/gi;
  let lm;
  while ((lm = laneRe.exec(xml))) {
    const nm = lm[0].match(RE.laneName);
    if (nm && nm[1].trim()) laneNames.push(nm[1].trim());
  }

  const manualTasks = countMatches(RE.manualTask, xml);
  const equipTasks = countMatches(RE.equipTask, xml);
  const plainTasks = countMatches(RE.taskPlain, xml);
  const subprocesses = countMatches(RE.subprocess, xml);

  const eeById = extractEeTimeByElement(xml);
  let total = 0, manual = 0, equipment = 0, unclassified = 0;
  for (const { eeTime, kind } of eeById.values()) {
    total += eeTime;
    if (kind === "manual") manual += eeTime;
    else if (kind === "equipment") equipment += eeTime;
    else unclassified += eeTime;
  }
  const present = eeById.size > 0;

  return {
    hasXml: true,
    tasks: manualTasks + equipTasks + plainTasks,
    gateways: countMatches(RE.gateway, xml),
    subprocesses,
    events: countMatches(RE.event, xml),
    lanes: laneNames,
    ee: {
      present,
      total: Math.round(total * 100) / 100,
      manual: Math.round(manual * 100) / 100,
      equipment: Math.round(equipment * 100) / 100,
      unclassified: Math.round(unclassified * 100) / 100,
      criticalPath: present ? Math.round(criticalPathTime(eeById, extractSequenceFlows(xml)) * 100) / 100 : 0,
    },
  };
}
