import { useRef } from "react";
import { buildDiagramControlsView } from "../orchestration/buildDiagramViewModel";
import { bumpDrawioPerfCounter } from "../../drawio/runtime/drawioRuntimeProbes.js";

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return false;
  if (aIsArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i];
    if (!hasOwn(b, key)) return false;
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Memoizes buildDiagramControlsView using shallow input comparison.
 * Uses a render-phase ref update (safe for read-only memoization).
 *
 * fix/canvas-pan-overlay-jank-v1 (F2, RC-A): controls-билдеры стоили ~740мс
 * за 8с pan (audit), т.к. пересобирались на каждый из ~1800 idle-коммитов.
 * Наблюдаемость: perf-счётчики "diagram.controlsView.cacheHit"/".cacheMiss" и
 * "diagram.controlsView.input.changed.<key>" (тот же __FPC_DRAWIO_PERF__
 * канал; bust по нестабильной identity конкретного ключа виден по счётчикам).
 */
export default function useStableDiagramControlsView(inputFactory) {
  const cacheRef = useRef({ input: null, output: null });
  const nextInput = inputFactory();
  if (!cacheRef.current.input || !shallowEqual(cacheRef.current.input, nextInput)) {
    bumpDrawioPerfCounter("diagram.controlsView.cacheMiss");
    if (cacheRef.current.input && nextInput && typeof nextInput === "object") {
      const keys = new Set([...Object.keys(cacheRef.current.input), ...Object.keys(nextInput)]);
      let reported = 0;
      keys.forEach((key) => {
        if (reported >= 12) return;
        if (!Object.is(cacheRef.current.input[key], nextInput[key])) {
          reported += 1;
          bumpDrawioPerfCounter(`diagram.controlsView.input.changed.${String(key)}`);
        }
      });
    }
    cacheRef.current.input = nextInput;
    cacheRef.current.output = buildDiagramControlsView(nextInput);
  } else {
    bumpDrawioPerfCounter("diagram.controlsView.cacheHit");
  }
  return cacheRef.current.output;
}
