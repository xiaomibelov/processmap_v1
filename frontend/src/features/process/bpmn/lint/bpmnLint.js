import { buildBpmnLogicHints } from "../../lib/processStageDomain.js";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function asText(v) {
  return String(v || "").trim();
}

function normalize(v) {
  return asText(v).toLowerCase();
}

const TASK_TYPES = new Set([
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
]);

export const LINT_PROFILES = {
  mvp: {
    id: "mvp",
    title: "MVP",
    description: "Базовый набор критичных проверок.",
    enabledRules: new Set([
      "missing_start_event",
      "missing_end_event",
      "dangling_incoming",
      "dangling_outgoing",
      "gateway_missing_inout",
      "gateway_missing_condition",
      "gateway_single_outgoing",
      "task_without_label",
      "task_without_lane",
      "unreachable_from_start",
    ]),
  },
  production: {
    id: "production",
    title: "Production",
    description: "Расширенный профиль для релизной проверки.",
    enabledRules: "all",
  },
  haccp: {
    id: "haccp",
    title: "HACCP",
    description: "Профиль пищевой безопасности (MVP-stub).",
    enabledRules: new Set([
      "missing_start_event",
      "missing_end_event",
      "dangling_incoming",
      "dangling_outgoing",
      "task_without_lane",
      "task_without_label",
      "gateway_missing_condition",
      "duplicate_task_name",
      "cycle_detected",
    ]),
    isStub: true,
  },
};

function profileById(profileId) {
  const key = normalize(profileId);
  return LINT_PROFILES[key] || LINT_PROFILES.mvp;
}

function ruleIdFromReason(reasonRaw) {
  const reason = normalize(reasonRaw);
  if (reason.includes("отсутствует startevent")) return "missing_start_event";
  if (reason.includes("отсутствует endevent")) return "missing_end_event";
  if (reason.includes("недостижим от startevent")) return "unreachable_from_start";
  if (reason.includes("узел недостижим")) return "dangling_incoming";
  if (reason.includes("обрывает процесс")) return "dangling_outgoing";
  if (reason.includes("разрывает цепочку")) return "gateway_missing_inout";
  if (reason.includes("имеет только 1 исходящ")) return "gateway_single_outgoing";
  if (reason.includes("нет условий на sequenceflow")) return "gateway_missing_condition";
  if (reason.includes("не подписан")) return "task_without_label";
  if (reason.includes("слишком длинное имя")) return "long_label";
  if (reason.includes("не привязан к lane/actor")) return "task_without_lane";
  if (reason.includes("дублирующиеся имена task")) return "duplicate_task_name";
  if (reason.includes("обнаружен цикл")) return "cycle_detected";
  if (reason.includes("в interview")) return "interview_mismatch";
  return "generic";
}

function levelFromSeverity(severityRaw) {
  const severity = normalize(severityRaw);
  return severity === "high" ? "error" : "warn";
}

function shouldKeepRule(profile, ruleId) {
  if (!profile) return true;
  if (profile.enabledRules === "all") return true;
  return profile.enabledRules.has(ruleId);
}

function parseNodeMeta(xmlText) {
  const xml = asText(xmlText);
  if (!xml || typeof DOMParser === "undefined") return { nodeTypeById: {}, outDeg: {} };
  let doc;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return { nodeTypeById: {}, outDeg: {} };
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) {
    return { nodeTypeById: {}, outDeg: {} };
  }

  const nodeTypeById = {};
  const outDeg = {};
  const allEls = Array.from(doc.getElementsByTagName("*"));
  allEls.forEach((el) => {
    const local = normalize(el?.localName);
    if (!TASK_TYPES.has(local) && local !== "startevent" && local !== "endevent" && !local.includes("gateway")) return;
    const id = asText(el.getAttribute("id"));
    if (!id) return;
    nodeTypeById[id] = local;
    if (!Object.prototype.hasOwnProperty.call(outDeg, id)) outDeg[id] = 0;
  });
  allEls.forEach((el) => {
    const local = normalize(el?.localName);
    if (local !== "sequenceflow") return;
    const src = asText(el.getAttribute("sourceRef"));
    if (!src) return;
    outDeg[src] = Number(outDeg[src] || 0) + 1;
  });
  return { nodeTypeById, outDeg };
}

function findBestEndAnchor(xmlText, issues = []) {
  const { nodeTypeById, outDeg } = parseNodeMeta(xmlText);
  const ids = Object.keys(nodeTypeById);
  const sinks = ids.filter((id) => {
    const t = normalize(nodeTypeById[id]);
    if (!TASK_TYPES.has(t)) return false;
    return Number(outDeg[id] || 0) === 0;
  });
  if (sinks.length) return sinks[0];
  const fromIssues = asArray(issues).find((issue) => ruleIdFromReason(asArray(issue?.reasons)[0]) === "dangling_outgoing");
  return asText(fromIssues?.nodeId) || ids.find((id) => TASK_TYPES.has(normalize(nodeTypeById[id]))) || "";
}

export function runBpmnLint({ xmlText, interview, nodes, profileId = "mvp" } = {}) {
  const profile = profileById(profileId);
  const rawIssues = buildBpmnLogicHints(xmlText, interview, nodes);
  const issues = asArray(rawIssues)
    .map((issue) => {
      const reason = asText(asArray(issue?.reasons)[0]);
      const ruleId = ruleIdFromReason(reason);
      return {
        ...issue,
        ruleId,
        level: levelFromSeverity(issue?.severity),
        fixHint: asText(issue?.aiHint || ""),
      };
    })
    .filter((issue) => shouldKeepRule(profile, issue.ruleId));

  const summary = {
    total: issues.length,
    errors: issues.filter((issue) => issue.level === "error").length,
    warns: issues.filter((issue) => issue.level !== "error").length,
  };
  return {
    profile,
    issues,
    summary,
  };
}

export function buildLintAutoFixPreview({ xmlText, issues = [] } = {}) {
  const { nodeTypeById } = parseNodeMeta(xmlText);
  const fixes = [];
  const ops = [];
  const seenRename = new Set();

  const hasMissingEnd = asArray(issues).some((issue) => issue.ruleId === "missing_end_event");
  if (hasMissingEnd) {
    const anchorId = findBestEndAnchor(xmlText, issues);
    if (anchorId) {
      fixes.push({
        id: `autofix_add_end_${anchorId}`,
        ruleId: "missing_end_event",
        title: "Добавить EndEvent",
        target: anchorId,
        safe: true,
        detail: `Добавить EndEvent после ${anchorId}.`,
      });
      ops.push({
        type: "addEndEvent",
        afterElementId: anchorId,
        name: "Завершение",
      });
    }
  }

  asArray(issues).forEach((issue) => {
    if (issue.ruleId !== "task_without_label") return;
    const nodeId = asText(issue?.nodeId);
    if (!nodeId || seenRename.has(nodeId)) return;
    const nodeType = normalize(nodeTypeById[nodeId]);
    if (!TASK_TYPES.has(nodeType)) return;
    seenRename.add(nodeId);
    const label = `Шаг ${seenRename.size}`;
    fixes.push({
      id: `autofix_label_${nodeId}`,
      ruleId: "task_without_label",
      title: "Добавить имя пустому task",
      target: nodeId,
      safe: true,
      detail: `Переименовать ${nodeId} в «${label}».`,
    });
    ops.push({
      type: "rename",
      elementId: nodeId,
      name: label,
    });
  });

  asArray(issues).forEach((issue) => {
    if (issue.ruleId !== "gateway_single_outgoing") return;
    const nodeId = asText(issue?.nodeId);
    fixes.push({
      id: `autofix_warn_gateway_${nodeId || "unknown"}`,
      ruleId: "gateway_single_outgoing",
      title: "Проверить gateway с 1 исходящей",
      target: nodeId,
      safe: false,
      detail: "MVP: только предупреждение, ручная корректировка.",
    });
  });

  return {
    fixes,
    ops,
    safeFixes: fixes.filter((fix) => fix.safe).length,
  };
}
