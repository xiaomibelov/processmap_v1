function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function parseSvgMatrix(transformRaw) {
  const text = toText(transformRaw);
  const match = text.match(/matrix\(([^)]+)\)/i);
  if (!match) {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }
  const values = String(match[1] || "")
    .split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n));
  if (values.length < 6) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  return {
    a: Number(values[0]),
    b: Number(values[1]),
    c: Number(values[2]),
    d: Number(values[3]),
    e: Number(values[4]),
    f: Number(values[5]),
  };
}

export function matrixToScreen(matrixRaw, xRaw, yRaw) {
  const matrix = asObject(matrixRaw);
  const x = Number(xRaw || 0);
  const y = Number(yRaw || 0);
  return {
    x: Number(matrix.a || 1) * x + Number(matrix.c || 0) * y + Number(matrix.e || 0),
    y: Number(matrix.b || 0) * x + Number(matrix.d || 1) * y + Number(matrix.f || 0),
  };
}

export function matrixToDiagram(matrixRaw, xRaw, yRaw) {
  const matrix = asObject(matrixRaw);
  const x = Number(xRaw || 0);
  const y = Number(yRaw || 0);
  const a = Number(matrix.a || 1);
  const b = Number(matrix.b || 0);
  const c = Number(matrix.c || 0);
  const d = Number(matrix.d || 1);
  const e = Number(matrix.e || 0);
  const f = Number(matrix.f || 0);
  const det = (a * d) - (b * c);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) {
    return { x, y };
  }
  const tx = x - e;
  const ty = y - f;
  return {
    x: ((d * tx) - (c * ty)) / det,
    y: ((-b * tx) + (a * ty)) / det,
  };
}
