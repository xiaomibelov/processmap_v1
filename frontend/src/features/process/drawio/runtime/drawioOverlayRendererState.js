import { asObject, toNumber, toText } from "./drawioOverlayState.js";

function hashText(valueRaw) {
  const text = String(valueRaw || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

export function composeOverlayMatrix(matrixRaw, txRaw, tyRaw) {
  const matrix = asObject(matrixRaw);
  const a = toNumber(matrix.a, 1);
  const b = toNumber(matrix.b, 0);
  const c = toNumber(matrix.c, 0);
  const d = toNumber(matrix.d, 1);
  const e = toNumber(matrix.e, 0);
  const f = toNumber(matrix.f, 0);
  const tx = toNumber(txRaw, 0);
  const ty = toNumber(tyRaw, 0);
  return {
    a,
    b,
    c,
    d,
    e: e + (a * tx) + (c * ty),
    f: f + (b * tx) + (d * ty),
  };
}

export function buildDrawioRenderStateSignature(
  bodyRaw,
  effectiveModeRaw,
  lockedRaw,
  layerMap,
  elementMap,
) {
  const parts = [
    hashText(bodyRaw),
    String(effectiveModeRaw || ""),
    lockedRaw === true ? "1" : "0",
  ];
  layerMap.forEach((layerStateRaw, layerId) => {
    const layerState = asObject(layerStateRaw);
    parts.push([
      "L",
      layerId,
      layerState.visible !== false ? "1" : "0",
      layerState.locked === true ? "1" : "0",
      toNumber(layerState.opacity, 1),
    ].join(":"));
  });
  elementMap.forEach((elementStateRaw, elementId) => {
    const elementState = asObject(elementStateRaw);
    parts.push([
      "E",
      elementId,
      toText(elementState.layer_id),
      elementState.visible !== false ? "1" : "0",
      elementState.locked === true ? "1" : "0",
      elementState.deleted === true ? "1" : "0",
      toNumber(elementState.opacity, 1),
      toNumber(elementState.offset_x, 0),
      toNumber(elementState.offset_y, 0),
    ].join(":"));
  });
  return parts.join("|");
}
