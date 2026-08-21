// Конвертер OpenAPI 3.1 (FastAPI, JSON Schema 2020-12) → 3.0 для swagger-ui@4:
// type:'null' → nullable (nullable только с type), examples → example,
// const → enum, $ref+siblings → allOf. Правила те же, что у backend-экспорта
// docs/openapi.yaml; backend-контракт /api/openapi.json (3.1) НЕ меняется.

function isNullType(s) {
  return s && typeof s === "object" && s.type === "null" && Object.keys(s).length === 1;
}

function convertNode(node) {
  if (Array.isArray(node)) return node.map(convertNode);
  if (!node || typeof node !== "object") return node;

  const out = { ...node };

  // const → enum
  if ("const" in out) {
    out.enum = [out.const];
    delete out.const;
  }
  // examples (массив) → example (значение)
  if (Array.isArray(out.examples)) {
    if (out.examples.length > 0 && out.example === undefined) out.example = out.examples[0];
    delete out.examples;
  } else if ("examples" in out) {
    delete out.examples;
  }
  // $ref рядом с siblings (3.0 игнорирует siblings) → allOf
  if (typeof out.$ref === "string" && Object.keys(out).length > 1) {
    const { $ref, ...siblings } = out;
    const converted = Object.fromEntries(Object.entries(siblings).map(([k, v]) => [k, convertNode(v)]));
    return { allOf: [{ $ref }], ...converted };
  }
  // anyOf с вариантом type:'null' → nullable/фолдинг (ДО рекурсии в варианты)
  if (Array.isArray(out.anyOf)) {
    const variants = out.anyOf;
    const rest = variants.filter((v) => !isNullType(v)).map(convertNode);
    const hasNull = rest.length !== variants.length;
    if (hasNull && rest.length > 0) {
      const keep = {};
      for (const [k, v] of Object.entries(out)) {
        if (k !== "anyOf") keep[k] = convertNode(v);
      }
      if (rest.length === 1) {
        const merged = { ...rest[0], ...keep };
        if (merged.type) merged.nullable = true;
        // фолдинг мог собрать $ref+siblings — обработать повторно
        return convertNode(merged);
      }
      if (keep.type) keep.nullable = true;
      keep.anyOf = rest;
      return keep;
    }
    if (hasNull && rest.length === 0) {
      // только null → пустая схема (допускает всё, включая null)
      const keep = {};
      for (const [k, v] of Object.entries(out)) {
        if (k !== "anyOf" && k !== "type") keep[k] = convertNode(v);
      }
      return keep;
    }
    out.anyOf = rest;
  }
  const result = {};
  for (const [k, v] of Object.entries(out)) result[k] = convertNode(v);
  if (result.type === "null") delete result.type; // {} допускает null
  return result;
}

/** OpenAPI 3.1 документ → 3.0.3 (безопасно для swagger-ui@4). */
export function convertOpenApi31to30(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const out = { ...doc, openapi: "3.0.3" };
  return convertNode(out);
}
