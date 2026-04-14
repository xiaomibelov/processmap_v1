function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function toJsonText(value) {
  try {
    const text = JSON.stringify(value);
    return typeof text === "string" ? text.trim() : "";
  } catch {
    return "";
  }
}

function normalizePlainText(value) {
  const text = asText(value);
  if (!text || text === "[object Object]") return "";
  return text;
}

function extractFromObject(rawObject, depth = 0) {
  if (depth > 3) return "";
  const value = asObject(rawObject);
  if (!Object.keys(value).length) return "";

  const direct = normalizePlainText(
    value.message
    || value.error
    || value.reason
    || value.title
    || value.detail,
  );
  if (direct) return direct;

  const nestedDetail = value.detail;
  if (nestedDetail && typeof nestedDetail === "object") {
    const fromDetail = extractFromObject(nestedDetail, depth + 1);
    if (fromDetail) return fromDetail;
  }

  const nestedError = value.error;
  if (nestedError && typeof nestedError === "object") {
    const fromError = extractFromObject(nestedError, depth + 1);
    if (fromError) return fromError;
  }

  const code = normalizePlainText(value.code);
  if (code) return code;

  const jsonText = toJsonText(value);
  if (jsonText && jsonText !== "{}" && jsonText !== "[object Object]") return jsonText;
  return "";
}

export function toUserFacingErrorText(raw, fallback = "") {
  const direct = normalizePlainText(raw);
  if (direct) return direct;

  if (raw && typeof raw === "object") {
    const fromObject = extractFromObject(raw);
    if (fromObject) return fromObject;
  }

  return normalizePlainText(fallback);
}

export function shortUserFacingError(raw, maxLen = 160, fallback = "") {
  const text = toUserFacingErrorText(raw, fallback);
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

