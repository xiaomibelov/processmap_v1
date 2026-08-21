import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Mirror of resolveDrawioOverlayRenderMatrix + composeOverlayMatrix logic
// to verify the eager mount sync produces correct transform strings.

function asObject(v) {
  return v && typeof v === "object" ? v : {};
}

function resolveDrawioOverlayRenderMatrix({ overlayMatrix, overlayMatrixRef, getOverlayMatrix }) {
  if (typeof getOverlayMatrix === "function") {
    const m = getOverlayMatrix();
    if (m && typeof m === "object" && typeof m.a === "number") return m;
  }
  if (overlayMatrixRef && typeof overlayMatrixRef === "object" && overlayMatrixRef.current) {
    const m = overlayMatrixRef.current;
    if (typeof m.a === "number") return m;
  }
  const m = asObject(overlayMatrix);
  return {
    a: Number(m.a ?? 1),
    b: Number(m.b ?? 0),
    c: Number(m.c ?? 0),
    d: Number(m.d ?? 1),
    e: Number(m.e ?? 0),
    f: Number(m.f ?? 0),
  };
}

function composeOverlayMatrix(matrixRaw, tx, ty) {
  const m = asObject(matrixRaw);
  const a = Number(m.a ?? 1);
  const b = Number(m.b ?? 0);
  const c = Number(m.c ?? 0);
  const d = Number(m.d ?? 1);
  const baseE = Number(m.e ?? 0);
  const baseF = Number(m.f ?? 0);
  const resolvedTx = Number(tx || 0);
  const resolvedTy = Number(ty || 0);
  return {
    a, b, c, d,
    e: baseE + a * resolvedTx + c * resolvedTy,
    f: baseF + b * resolvedTx + d * resolvedTy,
  };
}

function buildEagerMountTransform({ overlayMatrix, overlayMatrixRef, getOverlayMatrix, tx, ty }) {
  const m = resolveDrawioOverlayRenderMatrix({ overlayMatrix, overlayMatrixRef, getOverlayMatrix });
  if (!m || typeof m.a === "undefined") return null;
  const composed = composeOverlayMatrix(m, tx, ty);
  return `matrix(${composed.a},${composed.b},${composed.c},${composed.d},${composed.e},${composed.f})`;
}

describe("useLayoutEffect eager mount matrix sync", () => {
  it("should produce correct transform string from getOverlayMatrix", () => {
    const result = buildEagerMountTransform({
      getOverlayMatrix: () => ({ a: 2, b: 0, c: 0, d: 2, e: 100, f: 200 }),
      tx: 10,
      ty: 20,
    });
    assert.equal(result, "matrix(2,0,0,2,120,240)");
  });

  it("should produce correct transform with zero tx/ty", () => {
    const result = buildEagerMountTransform({
      getOverlayMatrix: () => ({ a: 1.5, b: 0, c: 0, d: 1.5, e: 50, f: 75 }),
      tx: 0,
      ty: 0,
    });
    assert.equal(result, "matrix(1.5,0,0,1.5,50,75)");
  });

  it("should fall back to overlayMatrixRef when getOverlayMatrix is absent", () => {
    const result = buildEagerMountTransform({
      overlayMatrixRef: { current: { a: 1, b: 0, c: 0, d: 1, e: 30, f: 40 } },
      tx: 5,
      ty: 10,
    });
    assert.equal(result, "matrix(1,0,0,1,35,50)");
  });

  it("should fall back to overlayMatrix prop when both getOverlayMatrix and ref are absent", () => {
    const result = buildEagerMountTransform({
      overlayMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      tx: 0,
      ty: 0,
    });
    assert.equal(result, "matrix(1,0,0,1,0,0)");
  });

  it("should return identity when all sources are null/undefined", () => {
    const result = buildEagerMountTransform({
      overlayMatrix: null,
      overlayMatrixRef: null,
      getOverlayMatrix: null,
      tx: 0,
      ty: 0,
    });
    assert.equal(result, "matrix(1,0,0,1,0,0)");
  });

  it("should not throw when getOverlayMatrix returns null", () => {
    const result = buildEagerMountTransform({
      getOverlayMatrix: () => null,
      tx: 0,
      ty: 0,
    });
    // Falls through to overlayMatrix fallback (default identity)
    assert.equal(result, "matrix(1,0,0,1,0,0)");
  });

  it("should not throw when getOverlayMatrix returns undefined", () => {
    const result = buildEagerMountTransform({
      getOverlayMatrix: () => undefined,
      tx: 0,
      ty: 0,
    });
    assert.equal(result, "matrix(1,0,0,1,0,0)");
  });
});
