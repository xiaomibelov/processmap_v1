function asText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stripQuotes(value) {
  let text = asText(value);
  if (!text) return "";
  text = text.replace(/[“”«»]/g, '"');
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function normalizeType(raw) {
  const key = asText(raw).toLowerCase();
  if (!key) return "";
  const map = [
    { match: ["service", "сервис"], type: "bpmn:ServiceTask" },
    { match: ["user", "пользователь"], type: "bpmn:UserTask" },
    { match: ["manual", "ручн"], type: "bpmn:ManualTask" },
    { match: ["script", "скрипт"], type: "bpmn:ScriptTask" },
    { match: ["send", "отправ"], type: "bpmn:SendTask" },
    { match: ["receive", "получ"], type: "bpmn:ReceiveTask" },
    { match: ["business", "правил"], type: "bpmn:BusinessRuleTask" },
    { match: ["task", "задач", "шаг", "таск"], type: "bpmn:Task" },
  ];
  for (const item of map) {
    if (item.match.some((token) => key.includes(token))) return item.type;
  }
  if (/^bpmn:/i.test(key)) return key;
  return "";
}

function normalizeCommandText(command) {
  return asText(command)
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "")
    .trim();
}

function ruleAddTask(command, context = {}) {
  const match = command.match(/^(?:добавь|добавить|создай|создать)\s+(?:шаг|задач[ауи]?|таск|task)\s+(.+?)(?:\s+после\s+(.+))?$/i);
  if (!match) return null;
  const name = stripQuotes(match[1]);
  const afterRaw = stripQuotes(match[2]);
  if (!name) return null;
  return {
    type: "addTask",
    name,
    afterElementId: afterRaw || asText(context?.selectedElementId || ""),
  };
}

function ruleRename(command, context = {}) {
  const match = command.match(/^(?:переименуй|переименовать)\s+(.+?)\s+(?:в|на)\s+(.+)$/i);
  if (!match) return null;
  const targetRaw = stripQuotes(match[1]);
  const name = stripQuotes(match[2]);
  if (!name) return null;
  const target = /^(выбранн|selected)/i.test(targetRaw)
    ? asText(context?.selectedElementId || "")
    : targetRaw;
  return {
    type: "rename",
    elementId: target,
    name,
  };
}

function ruleConnect(command) {
  const match = command.match(/^(?:соедини|соединить|свяжи|связать)\s+(.+?)\s+(?:с|->|в)\s+(.+?)(?:\s+(?:если|когда)\s+(.+))?$/i);
  if (!match) return null;
  const fromId = stripQuotes(match[1]);
  const toId = stripQuotes(match[2]);
  const when = stripQuotes(match[3]);
  if (!fromId || !toId) return null;
  return {
    type: "connect",
    fromId,
    toId,
    ...(when ? { when } : {}),
  };
}

function ruleInsertBetween(command) {
  const match = command.match(/^(?:вставь|вставить|добавь|добавить)\s+(?:шаг|задач[ауи]?|таск|task)\s+(.+?)\s+между\s+(.+?)\s+и\s+(.+)$/i);
  if (!match) return null;
  const newTaskName = stripQuotes(match[1]);
  const fromId = stripQuotes(match[2]);
  const toId = stripQuotes(match[3]);
  if (!newTaskName || !fromId || !toId) return null;
  return {
    type: "insertBetween",
    fromId,
    toId,
    newTaskName,
  };
}

function ruleChangeType(command, context = {}) {
  const match = command.match(/^(?:измени|изменить|смени|сменить|поменяй|поменять)\s+тип\s+(.+?)\s+на\s+(.+)$/i);
  if (!match) return null;
  const targetRaw = stripQuotes(match[1]);
  const newType = normalizeType(match[2]);
  if (!newType) return null;
  const target = /^(выбранн|selected)/i.test(targetRaw)
    ? asText(context?.selectedElementId || "")
    : targetRaw;
  return {
    type: "changeType",
    elementId: target,
    newType,
    preserveBounds: true,
  };
}

function sanitizeOp(raw) {
  const op = raw && typeof raw === "object" ? raw : {};
  const type = asText(op?.type || op?.op || op?.kind);
  if (!type) return null;

  if (type === "addTask") {
    const name = asText(op?.name || op?.title || "");
    if (!name) return null;
    return {
      type,
      name,
      afterElementId: asText(op?.afterElementId || op?.afterId || ""),
      laneId: asText(op?.laneId || ""),
    };
  }

  if (type === "rename") {
    const elementId = asText(op?.elementId || op?.id || "");
    const name = asText(op?.name || "");
    if (!elementId || !name) return null;
    return { type, elementId, name };
  }

  if (type === "connect") {
    const fromId = asText(op?.fromId || op?.from || "");
    const toId = asText(op?.toId || op?.to || "");
    if (!fromId || !toId) return null;
    const when = asText(op?.when || "");
    return { type, fromId, toId, ...(when ? { when } : {}) };
  }

  if (type === "insertBetween") {
    const fromId = asText(op?.fromId || op?.from || "");
    const toId = asText(op?.toId || op?.to || "");
    const newTaskName = asText(op?.newTaskName || op?.name || "");
    if (!fromId || !toId || !newTaskName) return null;
    const whenPolicy = asText(op?.whenPolicy || "to_first").toLowerCase();
    return {
      type,
      fromId,
      toId,
      newTaskName,
      laneId: asText(op?.laneId || ""),
      when: asText(op?.when || ""),
      flowId: asText(op?.flowId || ""),
      whenPolicy: whenPolicy === "to_second" || whenPolicy === "both" ? whenPolicy : "to_first",
    };
  }

  if (type === "changeType") {
    const elementId = asText(op?.elementId || op?.id || "");
    const newType = normalizeType(op?.newType || op?.typeId || "") || asText(op?.newType || op?.typeId || "");
    if (!elementId || !newType) return null;
    return {
      type,
      elementId,
      newType,
      preserveBounds: op?.preserveBounds !== false,
    };
  }

  return null;
}

export function parseCommandRuleBased(command, context = {}) {
  const text = normalizeCommandText(command);
  if (!text) return { ok: false, error: "empty_command", ops: [] };

  const rules = [
    ruleInsertBetween,
    (cmd) => ruleAddTask(cmd, context),
    (cmd) => ruleRename(cmd, context),
    ruleConnect,
    (cmd) => ruleChangeType(cmd, context),
  ];

  for (const rule of rules) {
    const op = rule(text);
    if (!op) continue;
    const sanitized = sanitizeOp(op);
    if (!sanitized) {
      return { ok: false, error: "invalid_operation", ops: [] };
    }
    return {
      ok: true,
      source: "rule",
      ops: [sanitized],
    };
  }

  return {
    ok: false,
    error: "command_not_recognized",
    ops: [],
  };
}

async function parseCommandLlmFallback(command, context = {}, llmFallback = null) {
  if (typeof llmFallback !== "function") {
    return {
      ok: false,
      error: "llm_fallback_unavailable",
      ops: [],
    };
  }

  try {
    const raw = await llmFallback({
      command,
      context,
    });
    const candidateOps = asArray(raw?.ops || raw?.result?.ops || raw?.result || raw);
    const ops = candidateOps.map(sanitizeOp).filter(Boolean);
    if (!ops.length) {
      return {
        ok: false,
        error: "llm_invalid_ops",
        ops: [],
      };
    }
    return {
      ok: true,
      source: "llm",
      ops,
    };
  } catch (error) {
    return {
      ok: false,
      error: asText(error?.message || error || "llm_fallback_failed") || "llm_fallback_failed",
      ops: [],
    };
  }
}

export async function parseCommandToOps({ command, context = {}, llmFallback = null } = {}) {
  const rule = parseCommandRuleBased(command, context);
  if (rule.ok) return rule;

  const llm = await parseCommandLlmFallback(command, context, llmFallback);
  if (llm.ok) return llm;

  return {
    ok: false,
    error: rule.error || llm.error || "command_parse_failed",
    ops: [],
    details: {
      ruleError: rule.error,
      llmError: llm.error,
    },
  };
}
