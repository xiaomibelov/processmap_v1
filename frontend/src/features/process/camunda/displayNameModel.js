// displayNameModel (v0.3 Phase 1B): derive a readable one-line display name
// for an operation from its operation_code + extension property params.
//
// Rules:
//  1. A manual `display_name` extension property always wins and is never
//     overwritten (returned as-is).
//  2. A known operation with ALL template placeholders present renders the
//     hardcoded RU template.
//  3. Otherwise a generic fallback: `label (key: value, …)` using the key
//     params (template placeholders when a template exists, else the first
//     3 params, `display_name` itself excluded).
//
// Pure module: no side effects, no imports. Safe for unit tests and reuse
// from preview builders, overlay resolvers and popover schema builders.

export const DISPLAY_NAME_TEMPLATES = {
  move: "Перенести {object_ref} в {target_ref}",
  transfer: "Перетарить {source_container_ref} в {target_container_ref}",
  open_container: "Открыть {container_ref}",
  close_container: "Закрыть {container_ref}",
  start_equipment: "Запустить {equipment_ref}",
  open_equipment: "Открыть {equipment_ref}",
  close_equipment: "Закрыть {equipment_ref}",
  set_equipment: "Настроить {equipment_ref}",
  measure_temperature: "Измерить температуру {container_ref}",
  check: "Проверить {object_ref}",
};

const PLACEHOLDER_RE = /\{([a-zA-Z0-9_]+)\}/g;
const FALLBACK_PARAM_LIMIT = 3;
const MANUAL_DISPLAY_NAME_KEY = "display_name";

function asText(value) {
  return String(value ?? "").trim();
}

function templateForOperationKey(operationKeyRaw) {
  const key = asText(operationKeyRaw);
  if (!key) return "";
  return DISPLAY_NAME_TEMPLATES[key] || DISPLAY_NAME_TEMPLATES[key.toLowerCase()] || "";
}

function extractPlaceholders(template) {
  const out = [];
  String(template || "").replace(PLACEHOLDER_RE, (_match, name) => {
    out.push(String(name).toLowerCase());
    return "";
  });
  return out;
}

function fillTemplate(template, params) {
  return String(template).replace(PLACEHOLDER_RE, (_match, nameRaw) => {
    const name = String(nameRaw).toLowerCase();
    return Object.prototype.hasOwnProperty.call(params, name) ? params[name] : "";
  });
}

export function resolveDisplayName({ operationKey = "", operationLabel = "", rows = [] } = {}) {
  const params = {};
  (Array.isArray(rows) ? rows : []).forEach((rowRaw) => {
    const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
    const name = asText(row.name).toLowerCase();
    const value = asText(row.value);
    if (!name || !value) return;
    params[name] = value;
  });

  // 1. Manual override always wins — returned as-is, never rewritten.
  const manual = params[MANUAL_DISPLAY_NAME_KEY];
  if (manual) return manual;

  const template = templateForOperationKey(operationKey);

  // 2. Template fill — only when EVERY placeholder is present.
  if (template) {
    const placeholders = extractPlaceholders(template);
    if (placeholders.every((name) => Object.prototype.hasOwnProperty.call(params, name))) {
      return fillTemplate(template, params);
    }
  }

  // 3. Generic fallback.
  const base = asText(operationLabel) || asText(operationKey);
  const keyParams = template
    ? extractPlaceholders(template).filter((name) => Object.prototype.hasOwnProperty.call(params, name))
    : Object.keys(params).filter((name) => name !== MANUAL_DISPLAY_NAME_KEY).slice(0, FALLBACK_PARAM_LIMIT);
  if (!keyParams.length) return base;
  const paramsText = keyParams.map((name) => `${name}: ${params[name]}`).join(", ");
  return base ? `${base} (${paramsText})` : paramsText;
}
