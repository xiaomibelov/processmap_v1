function toText(value) {
  return String(value ?? "").trim();
}

export function inferPropertyValueType(name, value) {
  const nameLower = toText(name).toLowerCase();
  const valueStr = toText(value);

  if (nameLower.startsWith("fpc-")) return "ui_config";
  if (nameLower.includes("duration") || nameLower.includes("work") || nameLower.includes("mode")) return "duration";
  if (valueStr && /(мин|ч|с)$/.test(valueStr)) return "duration";
  if (valueStr && valueStr.startsWith("{") && valueStr.endsWith("}")) {
    try {
      JSON.parse(valueStr);
      return "json";
    } catch {
      /* fallthrough */
    }
  }
  if (valueStr && valueStr.startsWith("[") && valueStr.endsWith("]")) {
    try {
      JSON.parse(valueStr);
      return "json";
    } catch {
      /* fallthrough */
    }
  }
  if (valueStr && /^-?\d+[.,]?\d*$/.test(valueStr.replace(/\s/g, ""))) return "number";
  return "string";
}

export function inferPropertyFamily(name, valueType) {
  const nameLower = toText(name).toLowerCase();
  if (nameLower.startsWith("fpc-")) return "ui_config";
  if (nameLower.includes("ingredient")) return "ingredient";
  if (nameLower.includes("equipment")) return "equipment";
  if (nameLower.includes("container")) return "container";
  if (nameLower.includes("duration") || nameLower.includes("work") || nameLower.includes("mode") || valueType === "duration") {
    return "duration";
  }
  if (valueType === "json") return "structured";
  return "other";
}

export function isJsonLike(value) {
  const s = toText(value);
  if (!s) return false;
  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function truncate(value, max = 60) {
  const s = toText(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export function formatPropertyValue(value, valueType) {
  const s = toText(value);
  if (!s) return "—";
  if (valueType === "json") return truncate(s, 80);
  if (valueType === "duration") return s;
  if (valueType === "number") return Number(s.replace(/\s/g, "").replace(",", ".")).toLocaleString("ru-RU");
  return truncate(s, 120);
}
