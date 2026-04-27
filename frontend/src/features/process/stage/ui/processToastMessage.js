function toText(value) {
  return String(value || "").trim();
}

const SOURCE_LABELS = {
  save: "Сохранение",
  bpmn_version: "Версия BPMN",
  sync: "Синхронизация",
  conflict: "Конфликт",
  remote_user: "Другой пользователь",
  document: "Документ",
  save_error: "Ошибка сохранения",
  process: "Процесс",
};

function stripSentenceEnd(value = "") {
  return toText(value).replace(/[.]+$/g, "").trim();
}

function lowerFirstRu(value = "") {
  const text = toText(value);
  if (!text) return "";
  const first = text[0];
  if (/[А-ЯЁ]/.test(first)) {
    return `${first.toLowerCase()}${text.slice(1)}`;
  }
  return text;
}

function stripKnownSourcePrefix(messageRaw = "") {
  const message = toText(messageRaw);
  if (!message) return "";
  const labels = Object.values(SOURCE_LABELS)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return message.replace(new RegExp(`^(?:${labels})\\s*:\\s*`, "i"), "").trim();
}

function normalizeSource(sourceRaw = "", messageRaw = "", toneRaw = "") {
  const explicit = toText(sourceRaw).toLowerCase();
  if (SOURCE_LABELS[explicit]) return explicit;

  const message = toText(messageRaw).toLowerCase();
  const tone = toText(toneRaw).toLowerCase();
  if (/(конфликт|conflict|stale|409)/i.test(message)) return "conflict";
  if (/(другой пользователь|другим пользователем|сессию обновил|remote)/i.test(message)) return "remote_user";
  if (/(документ|отч[её]т|report|documentation)/i.test(message)) return "document";
  if (/(верси|ревизи|bpmn version)/i.test(message)) return "bpmn_version";
  if (/(синхрон|обновлен|обновлена|обновлено|актуальн)/i.test(message)) return "sync";
  if (/(сохран|save)/i.test(message)) return tone === "error" ? "save_error" : "save";
  if (tone === "error") return "save_error";
  return "process";
}

function normalizeBody(source = "process", messageRaw = "") {
  const sourceKey = SOURCE_LABELS[source] ? source : "process";
  const message = stripKnownSourcePrefix(messageRaw);
  const comparable = stripSentenceEnd(message).toLowerCase();

  if (sourceKey === "save") {
    if (comparable === "сохранение") return "выполняется...";
    if (comparable === "сохранено внутри версии") return "сессия сохранена.";
  }

  if (sourceKey === "bpmn_version") {
    if (comparable === "сохранение") return "создание версии...";
    if (comparable === "создана новая версия bpmn") return "создана новая версия.";
  }

  return lowerFirstRu(message);
}

export function resolveProcessToastView({
  message = "",
  tone = "success",
  source = "",
} = {}) {
  const rawMessage = toText(message);
  if (!rawMessage) {
    return {
      message: "",
      tone: toText(tone) || "success",
      source: "process",
      label: SOURCE_LABELS.process,
    };
  }
  const normalizedTone = toText(tone) || "success";
  const normalizedSource = normalizeSource(source, rawMessage, normalizedTone);
  const label = SOURCE_LABELS[normalizedSource] || SOURCE_LABELS.process;
  const body = normalizeBody(normalizedSource, rawMessage);
  return {
    message: `${label}: ${body}`,
    tone: normalizedTone,
    source: normalizedSource,
    label,
  };
}

export default resolveProcessToastView;
