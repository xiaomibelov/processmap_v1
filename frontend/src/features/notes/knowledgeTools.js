import { normalizeElementNotesMap } from "./elementNotes";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function toText(v) {
  return String(v || "").trim();
}

function normalizeType(type) {
  return toText(type).toLowerCase();
}

export const NOTE_TEMPLATE_PRESETS = {
  user_task: {
    key: "user_task",
    title: "Шаблон: User Task",
    bullets: [
      "Роль/ответственный:",
      "Входы/выходы:",
      "SLA/срок выполнения:",
      "Риски и исключения:",
      "Артефакты/документы:",
    ],
  },
  service_task: {
    key: "service_task",
    title: "Шаблон: Service Task",
    bullets: [
      "Система/интеграция:",
      "Входной payload:",
      "Выходной payload:",
      "Ошибки/ретраи:",
      "Метрики качества:",
    ],
  },
  send_receive: {
    key: "send_receive",
    title: "Шаблон: Send/Receive",
    bullets: [
      "Канал передачи:",
      "Формат сообщения:",
      "Подтверждение доставки:",
      "Таймаут/повтор:",
      "Исключения:",
    ],
  },
  gateway: {
    key: "gateway",
    title: "Шаблон: Gateway",
    bullets: [
      "Условие ветвления:",
      "Критерий выбора ветки:",
      "Fallback-путь:",
      "Риски неверной маршрутизации:",
      "Что логируем:",
    ],
  },
};

export function resolveNoteTemplateKey(elementTypeRaw) {
  const t = normalizeType(elementTypeRaw);
  if (!t) return "user_task";
  if (t.includes("servicetask")) return "service_task";
  if (t.includes("sendtask") || t.includes("receivetask")) return "send_receive";
  if (t.includes("gateway")) return "gateway";
  if (t.includes("usertask") || t.includes("task") || t.includes("activity")) return "user_task";
  return "user_task";
}

export function getNoteTemplatePreset(elementTypeRaw) {
  const key = resolveNoteTemplateKey(elementTypeRaw);
  return NOTE_TEMPLATE_PRESETS[key] || NOTE_TEMPLATE_PRESETS.user_task;
}

export function formatTemplateNoteText(preset, context = {}) {
  const tpl = preset && typeof preset === "object" ? preset : NOTE_TEMPLATE_PRESETS.user_task;
  const elementName = toText(context?.elementName);
  const lines = [
    `# ${tpl.title}`,
  ];
  if (elementName) lines.push(`Элемент: ${elementName}`);
  asArray(tpl.bullets).forEach((line) => {
    lines.push(`- ${toText(line)}`);
  });
  return `${lines.join("\n")}\n`;
}

export function summarizeNoteTextForTldr(input, options = {}) {
  const maxItems = Math.max(2, Math.min(6, Number(options?.maxItems || 4)));
  const maxChars = Math.max(120, Math.min(600, Number(options?.maxChars || 320)));
  const src = toText(input);
  if (!src) return "";

  const segments = src
    .split(/\n+|(?<=[.!?])\s+/g)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  const seen = new Set();
  const picks = [];
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const key = segment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(segment);
    if (picks.length >= maxItems) break;
  }
  const bullets = picks.map((line) => `- ${line}`).join("\n");
  const out = `TL;DR\n${bullets}`.trim();
  return out.length > maxChars ? `${out.slice(0, maxChars - 1)}…` : out;
}

export function normalizeAiQuestionsByElementMap(rawMap) {
  const src = asObject(rawMap);
  const out = {};
  Object.keys(src).forEach((rawElementId) => {
    const elementId = toText(rawElementId);
    if (!elementId) return;
    const rawEntry = src[rawElementId];
    const list = Array.isArray(rawEntry)
      ? rawEntry
      : (Array.isArray(rawEntry?.items) ? rawEntry.items : []);
    const normalized = list
      .map((item, idx) => {
        const obj = asObject(item);
        const qid = toText(obj?.qid || obj?.id || `q_${idx + 1}`);
        const text = toText(obj?.text || obj?.question || obj?.label);
        if (!qid || !text) return null;
        return {
          qid,
          text,
          status: toText(obj?.status || "open").toLowerCase() === "done" ? "done" : "open",
          comment: toText(obj?.comment || obj?.answer),
        };
      })
      .filter(Boolean);
    if (normalized.length) out[elementId] = normalized;
  });
  return out;
}

function isCoverageNode(nodeRaw) {
  const node = asObject(nodeRaw);
  const id = toText(node?.id);
  if (!id) return false;
  const kind = normalizeType(node?.parameters?.bpmn_kind || node?.type);
  if (!kind) return true;
  if (kind.includes("startevent") || kind.includes("endevent")) return false;
  if (kind.includes("sequenceflow")) return false;
  return true;
}

function hasDuration(nodeRaw) {
  const node = asObject(nodeRaw);
  const n = Number(node?.duration_min);
  if (Number.isFinite(n) && n > 0) return true;
  const p = asObject(node?.parameters);
  const alt = Number(p?.duration_min || p?.duration || 0);
  return Number.isFinite(alt) && alt > 0;
}

function hasQuality(nodeRaw) {
  const node = asObject(nodeRaw);
  const p = asObject(node?.parameters);
  if (asArray(node?.qc).length > 0) return true;
  if (asArray(p?.qc).length > 0) return true;
  if (toText(p?.quality)) return true;
  if (toText(p?.quality_gate)) return true;
  return false;
}

function isDurationQualityRequired(nodeRaw) {
  const kind = normalizeType(nodeRaw?.parameters?.bpmn_kind || nodeRaw?.type);
  if (!kind) return true;
  if (kind.includes("gateway")) return false;
  return (
    kind.includes("task")
    || kind.includes("activity")
    || kind.includes("subprocess")
  );
}

export function buildCoverageMatrix({
  nodes = [],
  notesByElement = {},
  aiQuestionsByElement = {},
} = {}) {
  const normalizedNotes = normalizeElementNotesMap(notesByElement);
  const normalizedAi = normalizeAiQuestionsByElementMap(aiQuestionsByElement);
  const rows = asArray(nodes)
    .filter((node) => isCoverageNode(node))
    .map((node) => {
      const id = toText(node?.id);
      const title = toText(node?.title || node?.name || id);
      const type = toText(node?.parameters?.bpmn_kind || node?.type);
      const lane = toText(node?.actor_role || node?.laneName || node?.lane);
      const noteEntry = asObject(normalizedNotes[id]);
      const noteItems = asArray(noteEntry?.items);
      const noteSummary = toText(noteEntry?.summary);
      const aiList = asArray(normalizedAi[id]);
      const missingNotes = noteItems.length === 0 && !noteSummary;
      const missingAiQuestions = aiList.length === 0;
      const durationRequired = isDurationQualityRequired(node);
      const missingDurationQuality = durationRequired && (!hasDuration(node) || !hasQuality(node));
      const score = Number(missingNotes) + Number(missingAiQuestions) + Number(missingDurationQuality);
      return {
        id,
        title,
        type,
        lane,
        missingNotes,
        missingAiQuestions,
        missingDurationQuality,
        score,
      };
    })
    .filter((item) => item.id)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const summary = {
    total: rows.length,
    missingNotes: rows.filter((row) => row.missingNotes).length,
    missingAiQuestions: rows.filter((row) => row.missingAiQuestions).length,
    missingDurationQuality: rows.filter((row) => row.missingDurationQuality).length,
    fullyCovered: rows.filter((row) => row.score === 0).length,
  };
  return { summary, rows };
}
